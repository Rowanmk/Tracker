import React, { useEffect, useMemo, useState } from "react";
import { TeamProgressTile } from "../components/TeamProgressTile";
import { EmployeeProgressChart } from "../components/EmployeeProgressChart";
import { RunRateTile } from "../components/RunRateTile";
import { StaffPerformanceBar } from "../components/StaffPerformanceBar";
import { DashboardPlaybackControls } from "../components/DashboardPlaybackControls";
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

  const yearForMonth = selectedMonth >= 4 ? financialYear.start : financialYear.end;
  const daysInMonth = new Date(yearForMonth, selectedMonth, 0).getDate();

  const today = new Date();
  const isCurrentMonth =
    selectedMonth === today.getMonth() + 1 && selectedYear === today.getFullYear();

  const maxPlayableDay = isCurrentMonth ? Math.min(today.getDate(), daysInMonth) : daysInMonth;

  const [selectedPlaybackDay, setSelectedPlaybackDay] = useState<number>(Math.max(1, maxPlayableDay));
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    setSelectedPlaybackDay(Math.max(1, maxPlayableDay));
    setIsPlaying(false);
  }, [selectedMonth, selectedYear, selectedTeamId, maxPlayableDay]);

  useEffect(() => {
    if (!isPlaying) return;

    const timer = window.setInterval(() => {
      setSelectedPlaybackDay((current) => {
        if (current >= maxPlayableDay) {
          window.clearInterval(timer);
          setIsPlaying(false);
          return maxPlayableDay;
        }
        return current + 1;
      });
    }, 700);

    return () => window.clearInterval(timer);
  }, [isPlaying, maxPlayableDay]);

  const filteredActivities = useMemo(() => {
    return dailyActivities.filter((activity) => activity.day <= selectedPlaybackDay);
  }, [dailyActivities, selectedPlaybackDay]);

  const historicalStaffPerformance = useMemo(() => {
    const activityTotalsByStaff = new Map<number, number>();
    const serviceTotalsByStaff = new Map<number, Record<string, number>>();

    filteredActivities.forEach((activity) => {
      const staffId = activity.staff_id;
      const serviceId = activity.service_id;

      if (staffId == null || serviceId == null) return;

      const matchedStaff = staffPerformance.find((staff) => staff.staff_id === staffId);
      const matchedService = services.find((service) => service.service_id === serviceId);

      if (!matchedStaff || !matchedService) return;

      activityTotalsByStaff.set(staffId, (activityTotalsByStaff.get(staffId) || 0) + activity.delivered_count);

      const existingServices = serviceTotalsByStaff.get(staffId) || {};
      existingServices[matchedService.service_name] = (existingServices[matchedService.service_name] || 0) + activity.delivered_count;
      serviceTotalsByStaff.set(staffId, existingServices);
    });

    return staffPerformance.map((staff) => {
      const serviceBreakdown = services.reduce<Record<string, number>>((acc, service) => {
        acc[service.service_name] = serviceTotalsByStaff.get(staff.staff_id)?.[service.service_name] || 0;
        return acc;
      }, {});

      const total = activityTotalsByStaff.get(staff.staff_id) || 0;

      return {
        ...staff,
        total,
        services: serviceBreakdown,
        achieved_percent: staff.target > 0 ? (total / staff.target) * 100 : 0,
      };
    });
  }, [filteredActivities, services, staffPerformance]);

  const workingDaysElapsedToPlayback = useMemo(() => {
    const countUntilSelectedDay = (limitDay: number) => {
      let count = 0;
      for (let day = 1; day <= Math.min(limitDay, daysInMonth); day++) {
        const currentDate = new Date(yearForMonth, selectedMonth - 1, day);
        const dayOfWeek = currentDate.getDay();
        if (dayOfWeek !== 0 && dayOfWeek !== 6) {
          count += 1;
        }
      }
      return count;
    };

    const rawCount = countUntilSelectedDay(selectedPlaybackDay);

    if (isCurrentMonth) {
      return Math.min(rawCount, workingDaysUpToToday);
    }

    return Math.min(rawCount, teamWorkingDays);
  }, [selectedPlaybackDay, selectedMonth, yearForMonth, daysInMonth, isCurrentMonth, workingDaysUpToToday, teamWorkingDays]);

  const performanceSummary = usePerformanceSummary({
    staffPerformance: historicalStaffPerformance,
    workingDays: teamWorkingDays,
    workingDaysUpToToday: workingDaysElapsedToPlayback,
    selectedMonth,
    selectedYear,
    dashboardMode: "team",
    currentStaff: null,
  });

  const variance = performanceSummary.delivered - performanceSummary.expected;
  const isAhead = variance >= 0;

  const handleDaySelect = (day: number) => {
    setSelectedPlaybackDay(day);
    setIsPlaying(false);
  };

  const handleTogglePlay = () => {
    if (isPlaying) {
      setIsPlaying(false);
      return;
    }

    if (selectedPlaybackDay >= maxPlayableDay) {
      setSelectedPlaybackDay(1);
    }

    setIsPlaying(true);
  };

  return (
    <div className="space-y-6">
      <div className="page-header">
        <h2 className="page-title">
          {isAllTeams ? "All Teams Dashboard" : `${selectedTeam?.name} Dashboard`}
        </h2>
      </div>

      <div className="mb-6">
        <StaffPerformanceBar staffPerformance={historicalStaffPerformance} />
      </div>

      <div className="mb-6">
        <DashboardPlaybackControls
          daysInMonth={maxPlayableDay}
          selectedDay={selectedPlaybackDay}
          isPlaying={isPlaying}
          onDaySelect={handleDaySelect}
          onTogglePlay={handleTogglePlay}
        />
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
          staffPerformance={historicalStaffPerformance}
          viewMode={viewMode}
          workingDays={teamWorkingDays}
          workingDaysUpToToday={workingDaysElapsedToPlayback}
          month={selectedMonth}
          financialYear={financialYear}
        />
        <EmployeeProgressChart
          services={services}
          staffPerformance={historicalStaffPerformance}
          viewMode={viewMode}
          workingDays={teamWorkingDays}
          workingDaysUpToToday={workingDaysElapsedToPlayback}
          month={selectedMonth}
          financialYear={financialYear}
          selectedTeamId={selectedTeamId}
          teams={teams}
          playbackDay={selectedPlaybackDay}
        />
        <RunRateTile
          workingDays={teamWorkingDays}
          workingDaysUpToToday={workingDaysElapsedToPlayback}
          dailyActivities={filteredActivities}
          month={selectedMonth}
          financialYear={financialYear}
          target={performanceSummary.target}
          viewMode={viewMode}
          playbackDay={selectedPlaybackDay}
        />
      </div>
    </div>
  );
};