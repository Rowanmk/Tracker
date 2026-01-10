import React, { useState, useEffect, useRef } from "react";
import { TeamProgressTile } from "../components/TeamProgressTile";
import { EmployeeProgressChart } from "../components/EmployeeProgressChart";
import { RunRateTile } from "../components/RunRateTile";
import { StaffPerformanceBar } from "../components/StaffPerformanceBar";
import { useDate } from "../context/DateContext";
import { useAuth } from "../context/AuthContext";
import { useServices } from "../hooks/useServices";
import { useWorkingDays } from "../hooks/useWorkingDays";
import { useDashboardView } from "../context/DashboardViewContext";
import { useStaffPerformance } from "../hooks/useStaffPerformance";

export const Dashboard: React.FC = () => {
  const { viewMode } = useDashboardView();
  const { selectedMonth, selectedYear, financialYear } = useDate();

  const [sortMode, setSortMode] = useState<"desc" | "asc" | "name">("desc");

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
    financialYear: financialYear,
    month: selectedMonth,
  });

  // ✅ Shared staff performance + daily activities + team target
  const {
    staffPerformance,
    dailyActivities,
    teamTarget,
    loading,
    error,
  } = useStaffPerformance(sortMode);

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

  // (sortMode setter/UI not shown in your paste; keeping your state intact)
  useEffect(() => {
    // no-op placeholder to keep sortMode dependency behaviour identical to your current setup
  }, [sortMode]);

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
          financialYear={financialYear}
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
              financialYear={financialYear}
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
              financialYear={financialYear}
            />
          </div>
          <div className="min-w-full lg:min-w-0">
            <RunRateTile
              workingDays={teamWorkingDays}
              workingDaysUpToToday={workingDaysUpToToday}
              totalActual={totalActual}
              dailyActivities={dailyActivities}
              month={selectedMonth}
              financialYear={financialYear}
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
