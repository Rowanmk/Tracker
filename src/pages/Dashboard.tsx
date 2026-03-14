import React, { useEffect, useMemo, useRef, useState } from "react";
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

  const maxPlayableDay = Math.max(
    1,
    isCurrentMonth ? Math.min(today.getDate(), daysInMonth) : daysInMonth
  );

  const [selectedPlaybackDay, setSelectedPlaybackDay] = useState<number>(maxPlayableDay);
  const [playbackProgress, setPlaybackProgress] = useState<number>(maxPlayableDay);
  const [isPlaying, setIsPlaying] = useState(false);
  const animationFrameRef = useRef<number | null>(null);
  const animationStartTimeRef = useRef<number | null>(null);
  const animationStartProgressRef = useRef<number>(1);

  useEffect(() => {
    setSelectedPlaybackDay(maxPlayableDay);
    setPlaybackProgress(maxPlayableDay);
    setIsPlaying(false);
  }, [selectedMonth, selectedYear, selectedTeamId, maxPlayableDay]);

  useEffect(() => {
    if (!isPlaying) {
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      animationStartTimeRef.current = null;
      return;
    }

    const startProgress = Math.max(1, Math.min(maxPlayableDay, animationStartProgressRef.current || playbackProgress || 1));
    animationStartProgressRef.current = startProgress;
    animationStartTimeRef.current = null;

    const remainingDistance = Math.max(0, maxPlayableDay - startProgress);
    const durationMs = Math.max(1200, remainingDistance * 180);

    const step = (timestamp: number) => {
      if (animationStartTimeRef.current === null) {
        animationStartTimeRef.current = timestamp;
      }

      const elapsed = timestamp - animationStartTimeRef.current;
      const progressRatio = Math.min(elapsed / durationMs, 1);
      const easedRatio = 1 - Math.pow(1 - progressRatio, 3);
      const nextProgress =
        startProgress +
        (maxPlayableDay - startProgress) * easedRatio;

      const clampedNextProgress = Math.max(1, Math.min(maxPlayableDay, nextProgress));

      setPlaybackProgress(clampedNextProgress);
      setSelectedPlaybackDay(Math.max(1, Math.min(maxPlayableDay, Math.round(clampedNextProgress))));

      if (progressRatio < 1) {
        animationFrameRef.current = window.requestAnimationFrame(step);
      } else {
        setPlaybackProgress(maxPlayableDay);
        setSelectedPlaybackDay(maxPlayableDay);
        setIsPlaying(false);
      }
    };

    animationFrameRef.current = window.requestAnimationFrame(step);

    return () => {
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [isPlaying, maxPlayableDay, playbackProgress]);

  const filteredActivities = useMemo(() => {
    const safeProgress = Math.max(1, Math.min(maxPlayableDay, playbackProgress));
    const wholeDay = Math.floor(safeProgress);
    const partialDayProgress = safeProgress - wholeDay;

    return dailyActivities
      .map((activity) => {
        if (activity.day < wholeDay) {
          return activity;
        }

        if (activity.day === wholeDay) {
          return activity;
        }

        if (activity.day === wholeDay + 1 && partialDayProgress > 0) {
          return {
            ...activity,
            delivered_count: activity.delivered_count * partialDayProgress,
          };
        }

        return null;
      })
      .filter((activity): activity is NonNullable<typeof activity> => activity !== null);
  }, [dailyActivities, playbackProgress, maxPlayableDay]);

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
    const safeProgress = Math.max(1, Math.min(maxPlayableDay, playbackProgress));
    let count = 0;
    const wholeDay = Math.floor(safeProgress);
    const partialDayProgress = safeProgress - wholeDay;

    for (let day = 1; day <= Math.min(wholeDay, daysInMonth); day++) {
      const currentDate = new Date(yearForMonth, selectedMonth - 1, day);
      const dayOfWeek = currentDate.getDay();
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        count += 1;
      }
    }

    const nextDay = wholeDay + 1;
    if (partialDayProgress > 0 && nextDay <= daysInMonth) {
      const currentDate = new Date(yearForMonth, selectedMonth - 1, nextDay);
      const dayOfWeek = currentDate.getDay();
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        count += partialDayProgress;
      }
    }

    if (isCurrentMonth) {
      return Math.min(count, workingDaysUpToToday);
    }

    return Math.min(count, teamWorkingDays);
  }, [playbackProgress, selectedMonth, yearForMonth, daysInMonth, isCurrentMonth, workingDaysUpToToday, teamWorkingDays, maxPlayableDay]);

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
    const safeDay = Math.max(1, Math.min(maxPlayableDay, day));
    setSelectedPlaybackDay(safeDay);
    setPlaybackProgress(safeDay);
    animationStartProgressRef.current = safeDay;
    setIsPlaying(false);
  };

  const handleTogglePlay = () => {
    if (isPlaying) {
      animationStartProgressRef.current = Math.max(1, Math.min(maxPlayableDay, playbackProgress));
      setIsPlaying(false);
      return;
    }

    const startFrom =
      playbackProgress >= maxPlayableDay
        ? 1
        : Math.max(1, Math.min(maxPlayableDay, playbackProgress));

    setSelectedPlaybackDay(Math.round(startFrom));
    setPlaybackProgress(startFrom);
    animationStartProgressRef.current = startFrom;
    setIsPlaying(true);
  };

  const deliveredPercent =
    performanceSummary.target > 0
      ? Math.min((performanceSummary.delivered / performanceSummary.target) * 100, 100)
      : 0;

  const expectedPercent =
    performanceSummary.target > 0
      ? Math.min((performanceSummary.expected / performanceSummary.target) * 100, 100)
      : 0;

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
          playbackProgress={playbackProgress}
          onDaySelect={handleDaySelect}
          onTogglePlay={handleTogglePlay}
        />
      </div>

      <div className="mb-6 space-y-2">
        <div className="flex justify-between items-center text-sm font-medium">
          <span className="text-gray-700 dark:text-gray-300">
            {isAllTeams ? "Global Progress" : `${selectedTeam?.name} Progress`}
          </span>
          <span className="text-gray-900 dark:text-white font-bold transition-[opacity,transform] duration-150 ease-linear">
            {Math.round(performanceSummary.delivered)} / {performanceSummary.target} ({performanceSummary.target > 0 ? Math.round((performanceSummary.delivered / performanceSummary.target) * 100) : 0}%)
          </span>
        </div>
        <div className="relative w-full h-6 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden shadow-inner">
          <div
            className={`h-6 rounded-full transition-[width] duration-100 ease-linear ${isAhead ? "bg-green-600" : "bg-red-600"}`}
            style={{ width: `${deliveredPercent}%` }}
          />
          <div
            className="absolute top-0 h-6 w-0.5 bg-[#001B47] transition-[left] duration-100 ease-linear"
            style={{ left: `${expectedPercent}%` }}
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
          playbackDay={playbackProgress}
        />
        <RunRateTile
          workingDays={teamWorkingDays}
          workingDaysUpToToday={workingDaysElapsedToPlayback}
          dailyActivities={filteredActivities}
          month={selectedMonth}
          financialYear={financialYear}
          target={performanceSummary.target}
          viewMode={viewMode}
          playbackDay={playbackProgress}
        />
      </div>
    </div>
  );
};