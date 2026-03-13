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
  const { selectedTeamId, teams } = useAuth();

  const { services } = useServices();
  const { staffPerformance, dailyActivities } = useStaffPerformance("desc");

  const isAllTeams = selectedTeamId === "all";
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
    dashboardMode: "team",
    currentStaff: null,
  });

  const variance = performanceSummary.delivered - performanceSummary.expected;
  const isAhead = variance >= 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
          {isAllTeams ? "All Teams Dashboard" : `${selectedTeam?.name} Dashboard`}
        </h2>
      </div>

      <div className="mb-6">
        <StaffPerformanceBar staffPerformance={staffPerformance} />
      </div>

      <div className="mb-6 space-y-2">
        <div className="flex justify-between items-center text-sm font-medium">
          <span className="text-gray-700 dark:text-gray-300">
            {isAllTeams ? "Global Progress" : `${selectedTeam?.name} Progress`}
          </span>
          <span className="text-gray-900 dark:text-white font-bold">
            {performanceSummary.delivered} / {performanceSummary.target} ({performanceSummary.target > 0 ? Math.round((performanceSummary.delivered / performanceSummary.target) * 100) : 0}%)
          </span>
        </div>
        <div className="relative w-full h-6 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden shadow-inner">
          <div 
            className={`h-6 rounded-full transition-all duration-500 ease-in-out ${isAhead ? "bg-green-600" : "bg-red-600"}`} 
            style={{ width: `${performanceSummary.target > 0 ? Math.min((performanceSummary.delivered / performanceSummary.target) * 100, 100) : 0}%` }} 
          />
          <div 
            className="absolute top-0 h-6 w-0.5 bg-[#001B47] transition-all duration-300" 
            style={{ left: `${performanceSummary.target > 0 ? Math.min((performanceSummary.expected / performanceSummary.target) * 100, 100) : 0}%` }} 
          />
          <div className={`absolute right-3 top-1/2 -translate-y-1/2 text-sm font-bold ${isAhead ? "text-green-700" : "text-red-700"}`}>
            {isAhead ? "+" : "-"}{Math.abs(Math.round(variance))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <TeamProgressTile
          services={services}
          staffPerformance={staffPerformance}
          viewMode={viewMode}
          workingDays={teamWorkingDays}
          workingDaysUpToToday={workingDaysUpToToday}
          month={selectedMonth}
          financialYear={financialYear}
        />
        <EmployeeProgressChart
          services={services}
          staffPerformance={staffPerformance}
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
          viewMode={viewMode}
        />
      </div>
    </div>
  );
};