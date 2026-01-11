import React, { useState, useRef } from "react";
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
import { usePerformanceSummary } from "../hooks/usePerformanceSummary";

export const Dashboard: React.FC = () => {
  const { viewMode } = useDashboardView();
  const { selectedMonth, selectedYear, financialYear } = useDate();

  const [sortMode] = useState<"desc" | "asc" | "name">("desc");
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const {
    currentStaff,
    selectedStaffId,
    showFallbackWarning: authWarning,
  } = useAuth();

  const {
    services,
    showFallbackWarning: servicesWarning,
  } = useServices();

  const isTeamSelected = selectedStaffId === "team" || !selectedStaffId;
  const dashboardMode: "team" | "individual" = isTeamSelected ? "team" : "individual";

  const staffIdForWorkingDays =
    !isTeamSelected && currentStaff ? currentStaff.staff_id : undefined;

  const {
    teamWorkingDays,
    staffWorkingDays,
    workingDaysUpToToday,
    showFallbackWarning: workingDaysWarning,
  } = useWorkingDays({
    financialYear,
    month: selectedMonth,
    staffId: staffIdForWorkingDays,
  });

  const { staffPerformance, dailyActivities, loading, error } =
    useStaffPerformance(sortMode);

  const effectiveWorkingDays = isTeamSelected ? teamWorkingDays : staffWorkingDays;

  const currentIndividualStaff =
    !isTeamSelected && currentStaff
      ? { staff_id: currentStaff.staff_id, name: currentStaff.name }
      : null;

  const performanceSummary = usePerformanceSummary({
    staffPerformance,
    workingDays: effectiveWorkingDays,
    workingDaysUpToToday,
    selectedMonth,
    selectedYear,
    dashboardMode,
    currentStaff: currentIndividualStaff,
  });

  const variance = performanceSummary.delivered - performanceSummary.expected;
  const isAhead = variance >= 0;

  const showWarning =
    authWarning || servicesWarning || workingDaysWarning || !!error;

  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">Dashboard</h2>

      {showWarning && (
        <div className="mb-6 p-4 bg-yellow-50 border rounded-xl">
          ⚠️ Some data may be unavailable. Showing fallbacks.
        </div>
      )}

      {/* 🔵 Staff performance header bar (includes date selector inside it) */}
      <div className="mb-6">
        <StaffPerformanceBar staffPerformance={staffPerformance} />
      </div>

      {/* Progress bar */}
      <div className="mb-6 space-y-2">
        <div className="flex justify-between items-center text-sm font-medium">
          <span>
            {dashboardMode === "team"
              ? "Team Progress"
              : `${currentStaff?.name} Progress`}
          </span>
          <span>
            {performanceSummary.delivered} / {performanceSummary.target} (
            {performanceSummary.target > 0
              ? Math.round(
                  (performanceSummary.delivered / performanceSummary.target) * 100
                )
              : 0}
            %)
          </span>
        </div>

        <div className="relative w-full h-6 bg-gray-200 rounded-full overflow-hidden">
          <div
            className={`h-6 rounded-full ${isAhead ? "bg-green-600" : "bg-red-600"}`}
            style={{
              width: `${
                performanceSummary.target > 0
                  ? Math.min(
                      (performanceSummary.delivered / performanceSummary.target) * 100,
                      100
                    )
                  : 0
              }%`,
            }}
          />

          {/* Expected marker */}
          <div
            className="absolute top-0 h-6 w-0.5 bg-[#001B47]"
            style={{
              left: `${
                performanceSummary.target > 0
                  ? Math.min(
                      (performanceSummary.expected / performanceSummary.target) * 100,
                      100
                    )
                  : 0
              }%`,
            }}
          />

          {/* Variance at the END of the bar */}
          <div
            className={`absolute right-3 top-1/2 -translate-y-1/2 text-sm font-bold ${
              isAhead ? "text-green-700" : "text-red-700"
            }`}
            title="Ahead/Behind vs expected by today"
          >
            {isAhead ? "+" : "-"}
            {Math.abs(Math.round(variance))}
          </div>
        </div>
      </div>

      <div
        ref={scrollContainerRef}
        className="grid grid-cols-1 lg:grid-cols-3 gap-6"
      >
        <TeamProgressTile
          services={services}
          staffPerformance={staffPerformance}
          dashboardMode={dashboardMode}
          currentStaff={currentIndividualStaff}
          viewMode={viewMode}
          workingDays={effectiveWorkingDays}
          workingDaysUpToToday={workingDaysUpToToday}
          month={selectedMonth}
          financialYear={financialYear}
        />

        <EmployeeProgressChart
          services={services}
          staffPerformance={staffPerformance}
          dashboardMode={dashboardMode}
          currentStaff={currentIndividualStaff}
          viewMode={viewMode}
          workingDays={effectiveWorkingDays}
          workingDaysUpToToday={workingDaysUpToToday}
          month={selectedMonth}
          financialYear={financialYear}
        />

        <RunRateTile
          workingDays={effectiveWorkingDays}
          workingDaysUpToToday={workingDaysUpToToday}
          totalActual={performanceSummary.delivered}
          dailyActivities={dailyActivities}
          month={selectedMonth}
          financialYear={financialYear}
          dashboardMode={dashboardMode}
          currentStaff={currentIndividualStaff}
          viewMode={viewMode}
        />
      </div>
    </div>
  );
};
