import React, { useState, useEffect } from "react";
    import { TeamProgressTile } from "../components/TeamProgressTile";
    import { EmployeeProgressChart } from "../components/EmployeeProgressChart";
    import { RunRateTile } from "../components/RunRateTile";
    import { StaffPerformanceBar } from "../components/StaffPerformanceBar";
    import { useDate } from "../context/DateContext";
    import { useAuth } from "../context/AuthContext";
    import { useServices } from "../hooks/useServices";
    import { useWorkingDays } from "../hooks/useWorkingDays";
    import { supabase } from "../supabase/client";
    import { useDashboardView } from "../context/DashboardViewContext";
    import { loadTargets } from "../utils/loadTargets";

    interface StaffPerformance {
      staff_id: number;
      name: string;
      services: { [key: string]: number };
      total: number;
      target: number;
      achieved_percent: number;
      historicalAverage: number;
      previousMonthRatio?: number;
    }

    export const Dashboard: React.FC = () => {
      const { dashboardMode, viewMode } = useDashboardView();
      const { selectedMonth, selectedFinancialYear } = useDate();
      const [staffPerformance, setStaffPerformance] = useState<StaffPerformance[]>([]);
      const [dailyActivities, setDailyActivities] = useState<any[]>([]);
      const [loading, setLoading] = useState(true);
      const [error, setError] = useState<string | null>(null);
      const [sortMode, setSortMode] = useState<"desc" | "asc" | "name">("desc");
      const [individualTarget, setIndividualTarget] = useState(0);
      const [teamTarget, setTeamTarget] = useState(0);

      const [isReplaying, setIsReplaying] = useState(false);
      const [replayDay, setReplayDay] = useState(1);
      const [originalData, setOriginalData] = useState<{
        staffPerformance: StaffPerformance[];
        dailyActivities: any[];
      } | null>(null);

      const {
        currentStaff,
        allStaff,
        loading: authLoading,
        showFallbackWarning: authWarning,
      } = useAuth();
      const {
        services,
        loading: servicesLoading,
        showFallbackWarning: servicesWarning,
      } = useServices();

      const isIndividual = dashboardMode === "individual" && currentStaff?.staff_id;

      const {
        teamWorkingDays,
        staffWorkingDays,
        workingDaysUpToToday,
        showFallbackWarning: workingDaysWarning,
      } = useWorkingDays({
        financialYear: selectedFinancialYear,
        month: selectedMonth,
        staffId: isIndividual ? currentStaff!.staff_id : undefined,
      });

      const effectiveWorkingDays = isIndividual ? staffWorkingDays : teamWorkingDays;

      const effectiveWorkingDaysUpToToday = isReplaying 
        ? Math.min(replayDay, workingDaysUpToToday)
        : workingDaysUpToToday;

      const fetchPerformanceData = async (limitToDay?: number) => {
        if (authLoading || servicesLoading || allStaff.length === 0 || services.length === 0) {
          setLoading(false);
          return;
        }

        setLoading(true);
        setError(null);

        try {
          const { startDate, endDate } = {
            startDate: new Date(selectedFinancialYear.start, 3, 1),
            endDate: new Date(selectedFinancialYear.end, 2, 31),
          };

          let activitiesQuery = supabase
            .from("dailyactivity")
            .select("staff_id, service_id, delivered_count, month, year, day, date")
            .eq("month", selectedMonth)
            .gte("date", startDate.toISOString().split("T")[0])
            .lte("date", endDate.toISOString().split("T")[0]);

          if (dashboardMode === "individual" && currentStaff) {
            activitiesQuery = activitiesQuery.eq("staff_id", currentStaff.staff_id);
          }

          if (limitToDay !== undefined) {
            activitiesQuery = activitiesQuery.lte("day", limitToDay);
          }

          const { data: activities, error: activitiesError } = await activitiesQuery;

          if (activitiesError) {
            console.error("Error fetching activities:", activitiesError);
            setError("Failed to load activity data");
          }

          setDailyActivities(activities || []);

          let historicalQuery = supabase
            .from("dailyactivity")
            .select("staff_id, delivered_count, month, year, date")
            .neq("month", selectedMonth)
            .gte("date", startDate.toISOString().split("T")[0])
            .lte("date", endDate.toISOString().split("T")[0]);

          if (dashboardMode === "individual" && currentStaff) {
            historicalQuery = historicalQuery.eq("staff_id", currentStaff.staff_id);
          }

          const { data: historicalActivities, error: historicalError } =
            await historicalQuery;

          if (historicalError) {
            console.error("Error fetching historical data:", historicalError);
          }

          const previousMonth = selectedMonth === 1 ? 12 : selectedMonth - 1;
          const year =
            selectedMonth >= 4
              ? selectedFinancialYear.start
              : selectedFinancialYear.end;
          const previousYear =
            selectedMonth === 1 ? selectedFinancialYear.end - 1 : year;

          let previousMonthQuery = supabase
            .from("dailyactivity")
            .select("staff_id, service_id, delivered_count")
            .eq("month", previousMonth)
            .eq("year", previousYear);

          if (dashboardMode === "individual" && currentStaff) {
            previousMonthQuery = previousMonthQuery.eq("staff_id", currentStaff.staff_id);
          }

          const { data: previousMonthActivities } = await previousMonthQuery;

          const relevantStaff =
            dashboardMode === "individual" && currentStaff ? [currentStaff] : allStaff;

          const performance: StaffPerformance[] = await Promise.all(
            relevantStaff.map(async (staff) => {
              const staffActivities =
                activities?.filter((a) => a.staff_id === staff.staff_id) || [];

              const staffActivityMap: Record<number, number> = {};
              staffActivities.forEach((activity) => {
                if (activity.service_id) {
                  staffActivityMap[activity.service_id] =
                    (staffActivityMap[activity.service_id] || 0) +
                    activity.delivered_count;
                }
              });

              const serviceData: { [key: string]: number } = {};
              services.forEach((service) => {
                serviceData[service.service_name] =
                  staffActivityMap[service.service_id] || 0;
              });

              const total = Object.values(serviceData).reduce((sum, val) => sum + val, 0);

              const { data: targetsData } = await supabase
                .from("monthlytargets")
                .select("target_value")
                .eq("staff_id", staff.staff_id)
                .eq("month", selectedMonth)
                .eq("year", year);

              const totalTarget = (targetsData || []).reduce(
                (sum, row) => sum + (row.target_value || 0),
                0
              );

              const achieved_percent = totalTarget > 0 ? (total / totalTarget) * 100 : 0;

              const staffHistorical =
                historicalActivities?.filter((a) => a.staff_id === staff.staff_id) ||
                [];
              const monthlyTotals: Record<string, number> = {};
              staffHistorical.forEach((activity) => {
                const key = `${activity.year}-${activity.month}`;
                monthlyTotals[key] = (monthlyTotals[key] || 0) + activity.delivered_count;
              });
              const monthsWithData = Object.keys(monthlyTotals).length;
              const totalHistorical = Object.values(monthlyTotals).reduce(
                (sum, val) => sum + val,
                0
              );
              const historicalAverage =
                monthsWithData > 0 ? totalHistorical / monthsWithData : 0;

              const prevMonthActivities =
                previousMonthActivities?.filter((a) => a.staff_id === staff.staff_id) ||
                [];
              const prevMonthTotal = prevMonthActivities.reduce(
                (sum, a) => sum + a.delivered_count,
                0
              );

              const { data: prevTargetsData } = await supabase
                .from("monthlytargets")
                .select("target_value")
                .eq("staff_id", staff.staff_id)
                .eq("month", previousMonth)
                .eq("year", previousYear);

              const prevMonthTarget = (prevTargetsData || []).reduce(
                (sum, row) => sum + (row.target_value || 0),
                0
              );
              const previousMonthRatio =
                prevMonthTarget > 0 ? prevMonthTotal / prevMonthTarget : 0;

              return {
                staff_id: staff.staff_id,
                name: staff.name,
                services: serviceData,
                total,
                target: totalTarget,
                achieved_percent,
                historicalAverage,
                previousMonthRatio,
              };
            })
          );

          const sortedPerformance = [...performance].sort((a, b) => {
            const perfA = a.target > 0 ? a.total / a.target : 0;
            const perfB = b.target > 0 ? b.total / b.target : 0;

            if (sortMode === "desc") return perfB - perfA;
            if (sortMode === "asc") return perfA - perfB;
            if (sortMode === "name") return a.name.localeCompare(b.name);
            return 0;
          });

          setStaffPerformance(sortedPerformance);

          if (currentStaff) {
            const { totalTarget: indTarget } = await loadTargets(selectedMonth, selectedFinancialYear, currentStaff.staff_id);
            setIndividualTarget(indTarget);
          }

          let teamTotalTarget = 0;
          for (const staff of allStaff) {
            const { totalTarget: staffTarget } = await loadTargets(selectedMonth, selectedFinancialYear, staff.staff_id);
            teamTotalTarget += staffTarget;
          }
          setTeamTarget(teamTotalTarget);

        } catch (error) {
          console.error("Error in fetchPerformanceData:", error);
          setError("Failed to connect to database");
          setStaffPerformance([]);
        } finally {
          setLoading(false);
        }
      };

      useEffect(() => {
        if (!isReplaying) {
          fetchPerformanceData();
        }
      }, [
        selectedMonth,
        selectedFinancialYear,
        dashboardMode,
        allStaff.length,
        services.length,
        authLoading,
        servicesLoading,
        currentStaff?.staff_id,
        sortMode,
      ]);

      useEffect(() => {
        const handler = () => {
          if (!isReplaying) {
            fetchPerformanceData();
          }
        };
        window.addEventListener("activity-updated", handler);
        return () => window.removeEventListener("activity-updated", handler);
      }, [
        selectedMonth,
        selectedFinancialYear,
        dashboardMode,
        allStaff.length,
        services.length,
        currentStaff?.staff_id,
        sortMode,
        isReplaying,
      ]);

      const startReplay = async () => {
        if (isReplaying) return;

        setOriginalData({
          staffPerformance: [...staffPerformance],
          dailyActivities: [...dailyActivities],
        });

        setIsReplaying(true);
        setReplayDay(1);

        const today = new Date();
        const currentDay = today.getDate();
        const currentMonth = today.getMonth() + 1;
        const currentYear = today.getFullYear();
        
        const selectedYear = selectedMonth >= 4 ? selectedFinancialYear.start : selectedFinancialYear.end;
        const isCurrentMonth = (selectedMonth === currentMonth && selectedYear === currentYear);
        
        const endDay = isCurrentMonth ? currentDay : new Date(selectedYear, selectedMonth, 0).getDate();

        let day = 1;
        const interval = setInterval(async () => {
          setReplayDay(day);
          await fetchPerformanceData(day);
          
          day++;
          if (day > endDay) {
            clearInterval(interval);
            setTimeout(() => {
              setIsReplaying(false);
              setReplayDay(1);
              if (originalData) {
                setStaffPerformance(originalData.staffPerformance);
                setDailyActivities(originalData.dailyActivities);
                setOriginalData(null);
              }
              fetchPerformanceData();
            }, 500);
          }
        }, 250);
      };

      const totalActual = dailyActivities.reduce(
        (sum, a) => sum + a.delivered_count,
        0
      );

      const deliveredMap: Record<number, number> = {};
      services.forEach((service) => {
        deliveredMap[service.service_id] = staffPerformance.reduce(
          (sum, staff) => sum + (staff.services[service.service_name] || 0),
          0
        );
      });

      const getStatusColor = (achieved_percent: number) => {
        if (achieved_percent >= 100) return "text-green-600 dark:text-green-400";
        if (achieved_percent >= 75)
          return "text-brand-orange dark:text-orange-400";
        return "text-red-600 dark:text-red-400";
      };

      const getTrendArrow = (currentRatio: number, previousRatio?: number) => {
        if (!previousRatio) return <span className="text-gray-400">●</span>;

        if (currentRatio > previousRatio) return <span className="text-green-600">▲</span>;
        if (currentRatio < previousRatio) return <span className="text-red-600">▼</span>;
        return <span className="text-gray-400">●</span>;
      };

      const showWarning =
        authWarning || servicesWarning || workingDaysWarning || !!error;

      const dashboardTitle =
        dashboardMode === "team"
          ? "Team Dashboard"
          : `${currentStaff?.name || "My"} Dashboard`;

      const individualDelivered = currentStaff 
        ? staffPerformance.find(s => s.staff_id === currentStaff.staff_id)?.total || 0
        : 0;
      const teamDelivered = staffPerformance.reduce((sum, s) => sum + s.total, 0);

      const getProgressBarColor = (delivered: number, target: number) => {
        if (target === 0) return '#6B7280';
        const expectedSoFar = effectiveWorkingDays > 0 ? (target / effectiveWorkingDays) * effectiveWorkingDaysUpToToday : 0;
        const difference = delivered - expectedSoFar;
        
        if (difference >= 0) return '#008A00';
        if (difference >= -0.25 * expectedSoFar) return '#FF8A2A';
        return '#FF3B30';
      };

      const renderProgressBar = (label: string, delivered: number, target: number) => {
        const percentage = target > 0 ? (delivered / target) * 100 : 0;
        const barColor = getProgressBarColor(delivered, target);
        
        const expectedSoFar = effectiveWorkingDays > 0 ? (target / effectiveWorkingDays) * effectiveWorkingDaysUpToToday : 0;
        const markerPercentage = target > 0 ? (expectedSoFar / target) * 100 : 0;
        const variance = delivered - expectedSoFar;
        
        let varianceLabel = "0";
        let varianceColor = "#FFFFFF";
        
        if (Math.abs(variance) >= 0.5) {
          varianceLabel = variance > 0 ? `+${Math.round(variance)}` : `${Math.round(variance)}`;
          varianceColor = variance > 0 ? "#FFFFFF" : "#FF3B30";
        }
        
        return (
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="font-medium text-gray-900 dark:text-white text-sm">{label}</span>
              <div className="flex items-center space-x-2">
                <span className="font-bold text-gray-900 dark:text-white text-sm">{delivered} / {target}</span>
                <span className="text-xs text-gray-600 dark:text-gray-400">({Math.round(percentage)}%)</span>
              </div>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-6 overflow-hidden relative">
              <div
                className="h-6 rounded-full transition-all duration-300 ease-in-out"
                style={{ 
                  width: `${Math.min(percentage, 100)}%`,
                  backgroundColor: barColor
                }}
                title={`${label}: ${delivered}/${target} (${Math.round(percentage)}%)`}
              />
              <div
                className="absolute top-0 h-6 w-0.5 bg-[#001B47] transition-all duration-300 ease-in-out"
                style={{ left: `${Math.min(markerPercentage, 100)}%` }}
                title={`Expected by now: ${Math.round(expectedSoFar)}`}
              />
              <div
                className="absolute top-0 h-6 flex items-center text-xs font-bold transition-all duration-300 ease-in-out"
                style={{ 
                  left: `${Math.min(markerPercentage, 95)}%`,
                  marginLeft: '4px',
                  color: varianceColor
                }}
              >
                {varianceLabel}
              </div>
            </div>
          </div>
        );
      };

      return (
        <div>
          <div className="mb-3.2">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl lg:text-3xl font-bold text-brand-blue dark:text-white mb-4.8">
                {dashboardTitle}
                {isReplaying && (
                  <span className="ml-4 text-lg text-orange-600 dark:text-orange-400 transition-all duration-300 ease-in-out">
                    (Replaying Day {replayDay})
                  </span>
                )}
              </h2>
              
              <button
                onClick={startReplay}
                disabled={isReplaying || loading}
                className={`flex items-center space-x-2 px-4 py-2 rounded-md font-semibold transition-all duration-200 ${
                  isReplaying || loading
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-blue-600 text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500'
                }`}
                title="Replay the current month from Day 1 to today"
              >
                <svg 
                  className={`w-5 h-5 transition-transform duration-200 ${isReplaying ? 'animate-spin' : ''}`}
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path 
                    strokeLinecap="round" 
                    strokeLinejoin="round" 
                    strokeWidth={2} 
                    d="M14.828 14.828a4 4 0 01-5.656 0M9 10h1m4 0h1m-6 4h1m4 0h1m6-6V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2h14a2 2 0 002-2v-3M9 5l7 7-7 7" 
                  />
                </svg>
                <span>{isReplaying ? 'Replaying...' : 'Replay Month'}</span>
              </button>
            </div>
          </div>

          {showWarning && (
            <div className="mb-6 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl animate-fade-in">
              <p className="text-yellow-800 dark:text-yellow-200">
                ⚠️ Some data may be unavailable due to connection issues. Showing
                available data with fallbacks.
              </p>
            </div>
          )}

          <div className="mb-6 animate-slide-up">
            <StaffPerformanceBar
              staffPerformance={staffPerformance}
              dashboardMode={dashboardMode}
              currentStaff={currentStaff}
              workingDays={effectiveWorkingDays}
              workingDaysUpToToday={effectiveWorkingDaysUpToToday}
              month={selectedMonth}
              financialYear={selectedFinancialYear}
            />
          </div>

          <div className="mb-6 animate-slide-up">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md border border-gray-200 dark:border-gray-700 p-6">
              <div className="space-y-4">
                {dashboardMode === "individual" ? (
                  renderProgressBar("Individual Progress", individualDelivered, individualTarget)
                ) : (
                  <>
                    {renderProgressBar("Individual Progress", individualDelivered, individualTarget)}
                    {renderProgressBar("Team Progress", teamDelivered, teamTarget)}
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
            <div className="animate-slide-up">
              <TeamProgressTile
                services={services}
                staffPerformance={staffPerformance}
                dashboardMode={dashboardMode}
                currentStaff={currentStaff}
                viewMode={viewMode}
                workingDays={effectiveWorkingDays}
                workingDaysUpToToday={effectiveWorkingDaysUpToToday}
                month={selectedMonth}
                financialYear={selectedFinancialYear}
              />
            </div>
            <div className="animate-slide-up" style={{ animationDelay: "0.05s" }}>
              <EmployeeProgressChart
                services={services}
                staffPerformance={staffPerformance}
                dashboardMode={dashboardMode}
                currentStaff={currentStaff}
                viewMode={viewMode}
                workingDays={effectiveWorkingDays}
                workingDaysUpToToday={effectiveWorkingDaysUpToToday}
                month={selectedMonth}
                financialYear={selectedFinancialYear}
              />
            </div>
            <div className="animate-slide-up" style={{ animationDelay: "0.1s" }}>
              <RunRateTile
                workingDays={effectiveWorkingDays}
                workingDaysUpToToday={effectiveWorkingDaysUpToToday}
                totalActual={totalActual}
                dailyActivities={dailyActivities}
                month={selectedMonth}
                financialYear={selectedFinancialYear}
                dashboardMode={dashboardMode}
                currentStaff={currentStaff}
                viewMode={viewMode}
              />
            </div>
          </div>
        </div>
      );
    };