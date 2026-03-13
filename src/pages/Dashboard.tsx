import React, { useState, useEffect } from "react";
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
  const { viewMode, dashboardMode, setDashboardMode } = useDashboardView();
  const { selectedMonth, selectedYear, financialYear } = useDate();
  const { selectedTeamId, teams, currentStaff, allStaff } = useAuth();

  const { services } = useServices();
  const { staffPerformance, dailyActivities } = useStaffPerformance("desc");

  const [selectedIndividual, setSelectedIndividual] = useState<{ staff_id: number; name: string } | null>(null);

  // Initialize selected individual to current user or first available staff
  useEffect(() => {
    if (!selectedIndividual && currentStaff) {
      setSelectedIndividual({ staff_id: currentStaff.staff_id, name: currentStaff.name });
    }
  }, [currentStaff]);

  const isAllTeams = selectedTeamId === "all";
  const selectedTeam = !isAllTeams ? teams.find(t => t.id.toString() === selectedTeamId) : null;

  const { teamWorkingDays, workingDaysUpToToday } = useWorkingDays({
    financialYear,
    month: selectedMonth,
  });

  // Filter staff for the selector based on team selection
  const availableStaff = allStaff.filter(s => {
    if (s.is_hidden) return false;
    if (isAllTeams) return true;
    return String(s.team_id) === selectedTeamId;
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

  const handleStaffChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = Number(e.target.value);
    const staff = allStaff.find(s => s.staff_id === id);
    if (staff) {
      setSelectedIndividual({ staff_id: staff.staff_id, name: staff.name });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
          {isAllTeams ? "All Teams Dashboard" : `${selectedTeam?.name} Dashboard`}
        </h2>

        <div className="flex items-center gap-3 bg-gray-100 dark:bg-gray-800 p-1 rounded-lg border border-gray-200 dark:border-gray-700">
          <button
            onClick={() => setDashboardMode("team")}
            className={`px-4 py-1.5 rounded-md text-sm font-bold transition-all ${
              dashboardMode === "team"
                ? "bg-[#001B47] text-white shadow-sm"
                : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
            }`}
          >
            Team View
          </button>
          <button
            onClick={() => setDashboardMode("individual")}
            className={`px-4 py-1.5 rounded-md text-sm font-bold transition-all ${
              dashboardMode === "individual"
                ? "bg-[#001B47] text-white shadow-sm"
                : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
            }`}
          >
            Individual View
          </button>
        </div>
      </div>

      {dashboardMode === "individual" && (
        <div className="flex items-center gap-3 animate-fade-in">
          <label className="text-sm font-bold text-gray-700 dark:text-gray-300">Select Staff:</label>
          <select
            value={selectedIndividual?.staff_id || ""}
            onChange={handleStaffChange}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-medium"
          >
            {availableStaff.map(s => (
              <option key={s.staff_id} value={s.staff_id}>{s.name}</option>
            ))}
          </select>
        </div>
      )}

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
          dashboardMode={dashboardMode}
          currentStaff={selectedIndividual}
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
          currentStaff={selectedIndividual}
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
          currentStaff={selectedIndividual}
          viewMode={viewMode}
        />
      </div>
    </div>
  );
};