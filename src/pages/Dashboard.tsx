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

export const Dashboard: React.FC = () => {
  const { viewMode } = useDashboardView();
  const { selectedMonth, financialYear } = useDate();

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

  const {
    staffPerformance,
    dailyActivities,
    teamTarget,
    loading,
    error,
  } = useStaffPerformance(sortMode);

  const totalActual = dailyActivities.reduce(
    (sum, a) => sum + (a.delivered_count || 0),
    0
  );

  const teamDelivered = staffPerformance.reduce(
    (sum, s) => sum + (s.total || 0),
    0
  );

  const effectiveWorkingDays = isTeamSelected
    ? teamWorkingDays
    : staffWorkingDays;

  const renderProgressBar = (label: string, delivered: number, target: number) => {
    const percentage = target > 0 ? (delivered / target) * 100 : 0;

    const expected =
      effectiveWorkingDays > 0
        ? (target / effectiveWorkingDays) * workingDaysUpToToday
        : 0;

    const variance = delivered - expected;

    return (
      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <span className="font-medium text-sm">{label}</span>
          <span className="font-bold text-sm">
            {delivered} / {target} ({Math.round(percentage)}%)
          </span>
        </div>

        <div className="relative w-full h-6 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-6 bg-green-600 rounded-full"
            style={{ width: `${Math.min(percentage, 100)}%` }}
          />

          <div
            className="absolute top-0 h-6 w-0.5 bg-[#001B47]"
            style={{
              left: `${target > 0 ? Math.min((expected / target) * 100, 100) : 0}%`,
            }}
          />

          {Math.abs(variance) >= 1 && (
            <span
              className={`absolute top-0 h-6 flex items-center text-xs font-bold ml-1 ${
                variance < 0 ? "text-red-600" : "text-white"
              }`}
              style={{
                left: `${target > 0 ? Math.min((expected / target) * 100, 95) : 0}%`,
              }}
            >
              {variance > 0 ? `+${Math.round(variance)}` : Math.round(variance)}
            </span>
          )}
        </div>
      </div>
    );
  };

  const showWarning =
    authWarning || servicesWarning || workingDaysWarning || !!error;

  const currentIndividualStaff =
    !isTeamSelected && currentStaff
      ? { staff_id: currentStaff.staff_id, name: currentStaff.name }
      : null;

  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">Dashboard</h2>

      {showWarning && (
        <div className="mb-6 p-4 bg-yellow-50 border rounded-xl">
          ⚠️ Some data may be unavailable. Showing fallbacks.
        </div>
      )}

      <div className="mb-6">
        <StaffPerformanceBar
          staffPerformance={staffPerformance}
          dashboardMode={dashboardMode}
          currentStaff={currentIndividualStaff}
          workingDays={effectiveWorkingDays}
          workingDaysUpToToday={workingDaysUpToToday}
          month={selectedMonth}
          financialYear={financialYear}
        />
      </div>

      <div className="mb-6">
        {isTeamSelected
          ? renderProgressBar("Team Progress", teamDelivered, teamTarget)
          : renderProgressBar(
              `${currentStaff?.name} Progress`,
              staffPerformance.find(
                s => s.staff_id === currentStaff?.staff_id
              )?.total || 0,
              staffPerformance.find(
                s => s.staff_id === currentStaff?.staff_id
              )?.target || 0
            )}
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
  );
};
