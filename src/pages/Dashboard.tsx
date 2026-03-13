import React from "react";
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
  const { selectedTeamId, teams, currentStaff } = useAuth();

  const { services } = useServices();
  const { staffPerformance, dailyActivities } = useStaffPerformance("desc");

  const isAllTeams = selectedTeamId === "all";
  // Dashboard mode is "individual" if we are looking at a specific team or if we want to highlight the current user
  // However, for the charts, "team" mode now means "show all staff in the current selection"
  const dashboardMode: "team" | "individual" = "team";

  const selectedTeam = !isAllTeams ? teams.find(t => t.id.toString() === selectedTeamId) : null;

  const { teamWorkingDays, workingDaysUpToToday } = useWorkingDays({
    financialYear,
    month: selectedMonth,
  });

  const performanceSummary = usePerformanceSummary({
    staffPerformance,
    workingDays: teamWorkingDays,
    workingDaysUpToToday,
    selectedMonth,
    selectedYear,
    dashboardMode: "team", // Aggregate summary for the current view
    currentStaff: null,
  });

  const variance = performanceSummary.delivered - performanceSummary.expected;
  const isAhead = variance >= 0;

  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">
        {isAllTeams ? "All Teams Dashboard" : `${selectedTeam?.name} Dashboard`}
      </h2>

      <div className="mb-6">
        <StaffPerformanceBar staffPerformance={staffPerformance} />
      </div>

      <div className="mb-6 space-y-2">
        <div className="flex justify-between items-center text-sm font-medium">
          <span>{isAllTeams ? "Global Progress" : `${selectedTeam?.name} Progress`}</span>
          <span>
            {performanceSummary.delivered} / {performanceSummary.target} ({performanceSummary.target > 0 ? Math.round((performanceSummary.delivered / performanceSummary.target) * 100) : 0}%)
          </span>
        </div>
        <div className="relative w-full h-6 bg-gray-200 rounded-full overflow-hidden">
          <div className={`h-6 rounded-full ${isAhead ? "bg-green-600" : "bg-red-600"}`} style={{ width: `${performanceSummary.target > 0 ? Math.min((performanceSummary.delivered / performanceSummary.target) * 100, 100) : 0}%` }} />
          <div className="absolute top-0 h-6 w-0.5 bg-[#001B47]" style={{ left: `${performanceSummary.target > 0 ? Math.min((performanceSummary.expected / performanceSummary.target) * 100, 100) : 0}%` }} />
          <div className={`absolute right-3 top-1/2 -translate-y-1/2 text-sm font-bold ${isAhead ? "text-green-700" : "text-red-700"}`}>
            {isAhead ? "+" : "-"}{Math.abs(Math.round(variance))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <TeamProgressTile
          services={services}
          staffPerformance={staffPerformance}
          dashboardMode={dashboardMode}
          currentStaff={null}
          viewMode={viewMode}
          workingDays={teamWorkingDays}
          workingDaysUpToToday={workingDaysUpToToday}
          month={selectedMonth}
          financialYear={financialYear}
        />
        <EmployeeProgressChart
          services={services}
          staffPerformance={staffPerformance}
          dashboardMode={dashboardMode}
          currentStaff={null}
          viewMode={viewMode}
          workingDays={teamWorkingDays}
          workingDaysUpToToday={workingDaysUpToToday}
          month={selectedMonth}
          financialYear={financialYear}
        />
        <RunRateTile
          workingDays={teamWorkingDays}
          workingDaysUpToToday={workingDaysUpToToday}
          totalActual={performanceSummary.delivered}
          dailyActivities={dailyActivities}
          month={selectedMonth}
          financialYear={financialYear}
          dashboardMode={dashboardMode}
          currentStaff={null}
          viewMode={viewMode}
        />
      </div>
    </div>
  );
};