import React, { useState, useEffect, useRef } from "react";
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
  const { viewMode } = useDashboardView();
  const { selectedMonth, selectedYear, derivedFinancialYear } = useDate();
  const [staffPerformance, setStaffPerformance] = useState<StaffPerformance[]>([]);
  const [dailyActivities, setDailyActivities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<"desc" | "asc" | "name">("desc");
  const [teamTarget, setTeamTarget] = useState(0);

  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const {
    currentStaff,
    allStaff,
    selectedStaffId,
    loading: authLoading,
    showFallbackWarning: authWarning,
  } = useAuth();
  const {
    services,
    loading: servicesLoading,
    showFallbackWarning: servicesWarning,
  } = useServices();

  const isTeamSelected = selectedStaffId === "team" || !selectedStaffId;
  const dashboardMode: "team" | "individual" = isTeamSelected ? "team" : "individual";

  const {
    teamWorkingDays,
    workingDaysUpToToday,
    showFallbackWarning: workingDaysWarning,
  } = useWorkingDays({
    financialYear: derivedFinancialYear,
    month: selectedMonth,
  });

  const fetchPerformanceData = async () => {
    if (authLoading || servicesLoading || allStaff.length === 0 || services.length === 0) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { startDate, endDate } = {
        startDate: new Date(derivedFinancialYear.start, 3, 1),
        endDate: new Date(derivedFinancialYear.end, 2, 31),
      };

      const { data: activities, error: activitiesError } = await supabase
        .from("dailyactivity")
        .select("staff_id, service_id, delivered_count, month, year, day, date")
        .eq("month", selectedMonth)
        .eq("year", selectedYear)
        .gte("date", startDate.toISOString().split("T")[0])
        .lte("date", endDate.toISOString().split("T")[0]);

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

      const { data: historicalActivities, error: historicalError } =
        await historicalQuery;

      if (historicalError) {
        console.error("Error fetching historical data:", historicalError);
      }

      const previousMonth = selectedMonth === 1 ? 12 : selectedMonth - 1;
      const previousYear = selectedMonth === 1 ? selectedYear - 1 : selectedYear;

      let previousMonthQuery = supabase
        .from("dailyactivity")
        .select("staff_id, service_id, delivered_count")
        .eq("month", previousMonth)
        .eq("year", previousYear);

      const { data: previousMonthActivities } = await previousMonthQuery;

      const performance: StaffPerformance[] = await Promise.all(
        allStaff.map(async (staff) => {
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

          const { totalTarget } = await loadTargets(selectedMonth, derivedFinancialYear, staff.staff_id);

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

          const { totalTarget: prevMonthTarget } = await loadTargets(previousMonth, derivedFinancialYear, staff.staff_id);
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

      let teamTotalTarget = 0;
      for (const staff of allStaff) {
        const { totalTarget: staffTarget } = await loadTargets(selectedMonth, derivedFinancialYear, staff.staff_id);
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
    fetchPerformanceData();
  }, [
    selectedMonth,
    selectedYear,
    derivedFinancialYear,
    allStaff.length,
    services.length,
    authLoading,
    servicesLoading,
    sortMode,
  ]);

  useEffect(() => {
    const handler = () => {
      fetchPerformanceData();
    };
    window.addEventListener("activity-updated", handler);
    return () => window.removeEventListener("activity-updated", handler);
  }, [
    selectedMonth,
    selectedYear,
    derivedFinancialYear,
    allStaff.length,
    services.length,
    sortMode,
  ]);

  const totalActual = dailyActivities.reduce(
    (sum, a) => sum + a.delivered_count,
    0
  );

  const teamDelivered = staffPerformance.reduce((sum, s) => sum + s.total, 0);

  const getProgressBarColor = (delivered: number, target: number) => {
    if (target === 0) return '#6B7280';
    const expectedSoFar = teamWorkingDays > 0 ? (target / teamWorkingDays) * workingDaysUpToToday : 0;
    const difference = delivered - expectedSoFar;
    
    if (difference >= 0) return '#008A00';
    if (difference >= -0.25 * expectedSoFar) return '#FF8A2A';
    return '#FF3B30';
  };

  const renderProgressBar = (label: string, delivered: number, target: number) => {
    const percentage = target > 0 ? (delivered / target) * 100 : 0;
    const barColor = getProgressBarColor(delivered, target);
    
    const expectedSoFar = teamWorkingDays > 0 ? (target / teamWorkingDays) * workingDaysUpToToday : 0;
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

  const showWarning =
    authWarning || servicesWarning || workingDaysWarning || !!error;

  const currentIndividualStaff = !isTeamSelected && currentStaff 
    ? { staff_id: currentStaff.staff_id, name: currentStaff.name }
    : null;

  return (
    <div>
      <div className="mb-3.2">
        <h2 className="text-2xl lg:text-3xl font-bold text-brand-blue dark:text-white mb-4.8">
          Dashboard
        </h2>
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
          currentStaff={currentIndividualStaff}
          workingDays={teamWorkingDays}
          workingDaysUpToToday={workingDaysUpToToday}
          month={selectedMonth}
          financialYear={derivedFinancialYear}
        />
      </div>

      <div className="mb-6 animate-slide-up">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md border border-gray-200 dark:border-gray-700 p-6">
          <div className="space-y-4">
            {isTeamSelected 
              ? renderProgressBar("Team Progress", teamDelivered, teamTarget)
              : renderProgressBar(`${currentStaff?.name || "My"} Progress`, 
                  staffPerformance.find(s => s.staff_id === currentStaff?.staff_id)?.total || 0,
                  staffPerformance.find(s => s.staff_id === currentStaff?.staff_id)?.target || 0
                )
            }
          </div>
        </div>
      </div>

      <div className="animate-slide-up">
        <div
          ref={scrollContainerRef}
          className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8 overflow-x-auto pb-4"
          style={{ scrollBehavior: 'smooth' }}
        >
          <div className="min-w-full lg:min-w-0">
            <TeamProgressTile
              services={services}
              staffPerformance={staffPerformance}
              dashboardMode={dashboardMode}
              currentStaff={currentIndividualStaff}
              viewMode={viewMode}
              workingDays={teamWorkingDays}
              workingDaysUpToToday={workingDaysUpToToday}
              month={selectedMonth}
              financialYear={derivedFinancialYear}
            />
          </div>
          <div className="min-w-full lg:min-w-0">
            <EmployeeProgressChart
              services={services}
              staffPerformance={staffPerformance}
              dashboardMode={dashboardMode}
              currentStaff={currentIndividualStaff}
              viewMode={viewMode}
              workingDays={teamWorkingDays}
              workingDaysUpToToday={workingDaysUpToToday}
              month={selectedMonth}
              financialYear={derivedFinancialYear}
            />
          </div>
          <div className="min-w-full lg:min-w-0">
            <RunRateTile
              workingDays={teamWorkingDays}
              workingDaysUpToToday={workingDaysUpToToday}
              totalActual={totalActual}
              dailyActivities={dailyActivities}
              month={selectedMonth}
              financialYear={derivedFinancialYear}
              dashboardMode={dashboardMode}
              currentStaff={currentIndividualStaff}
              viewMode={viewMode}
            />
          </div>
        </div>
      </div>
    </div>
  );
};