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

const PLAYBACK_STEP_DURATION_MS = 220;

export const Dashboard: React.FC = () => {
  const { viewMode } = useDashboardView();
  const { selectedMonth, selectedYear, financialYear } = useDate();
  const { selectedTeamId, teams } = useAuth();

  const { services } = useServices();
  const { staffPerformance, dailyActivities, loading } = useStaffPerformance("desc");

  const displayServices = useMemo(() => services.filter(s => s.service_name !== 'Bagel Days'), [services]);

  const runRateActivities = useMemo(() => {
    const bagelService = services.find(s => s.service_name === 'Bagel Days');
    if (!bagelService) return dailyActivities;
    return dailyActivities.filter(a => a.service_id !== bagelService.service_id);
  }, [dailyActivities, services]);

  const isAllTeams = selectedTeamId === "all";
  const selectedTeam = !isAllTeams ? teams.find((t) => t.id.toString() === selectedTeamId) : null;

  const { teamWorkingDays, workingDaysUpToToday } = useWorkingDays({
    financialYear,
    month: selectedMonth,
  });

  const yearForMonth = selectedMonth >= 4 ? financialYear.start : financialYear.end;
  const daysInMonth = new Date(yearForMonth, selectedMonth, 0).getDate();

  const today = new Date();
  const isCurrentMonth =
    selectedMonth === today.getMonth() + 1 && selectedYear === today.getFullYear();
  const isFutureMonth =
    selectedYear > today.getFullYear() ||
    (selectedYear === today.getFullYear() && selectedMonth > today.getMonth() + 1);

  const maxActualDay = isFutureMonth
    ? 1
    : isCurrentMonth
    ? Math.min(today.getDate(), daysInMonth)
    : daysInMonth;

  const initialPlaybackDay = Math.max(1, maxActualDay);

  const [selectedPlaybackDay, setSelectedPlaybackDay] = useState&lt;number&gt;(initialPlaybackDay);
  const [playbackProgress, setPlaybackProgress] = useState&lt;number&gt;(initialPlaybackDay);
  const [isPlaying, setIsPlaying] = useState(false);

  const animationFrameRef = useRef&lt;number | null&gt;(null);
  const animationStartTimeRef = useRef&lt;number | null&gt;(null);
  const playbackStartDayRef = useRef&lt;number&gt;(initialPlaybackDay);
  const playbackTargetDayRef = useRef&lt;number&gt;(initialPlaybackDay);

  useEffect(() =&gt; {
    setSelectedPlaybackDay(initialPlaybackDay);
    setPlaybackProgress(initialPlaybackDay);
    setIsPlaying(false);
    playbackStartDayRef.current = initialPlaybackDay;
    playbackTargetDayRef.current = initialPlaybackDay;
    animationStartTimeRef.current = null;

    if (animationFrameRef.current !== null) {
      window.cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
  }, [selectedMonth, selectedYear, selectedTeamId, initialPlaybackDay]);

  useEffect(() =&gt; {
    if (!isPlaying) {
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      animationStartTimeRef.current = null;
      return;
    }

    const startDay = Math.max(1, Math.min(daysInMonth, playbackStartDayRef.current));
    const targetDay = Math.max(startDay, Math.min(daysInMonth, playbackTargetDayRef.current));

    if (startDay &gt;= targetDay) {
      setPlaybackProgress(targetDay);
      setSelectedPlaybackDay(targetDay);
      setIsPlaying(false);
      return;
    }

    animationStartTimeRef.current = null;

    const step = (timestamp: number) =&gt; {
      if (animationStartTimeRef.current === null) {
        animationStartTimeRef.current = timestamp;
      }

      const elapsed = timestamp - animationStartTimeRef.current;
      const completedSegments = Math.floor(elapsed / PLAYBACK_STEP_DURATION_MS);
      const segmentProgress = (elapsed % PLAYBACK_STEP_DURATION_MS) / PLAYBACK_STEP_DURATION_MS;

      const currentBaseDay = Math.min(startDay + completedSegments, targetDay);
      const nextDay = Math.min(currentBaseDay + 1, targetDay);

      const easedSegmentProgress = 1 - Math.pow(1 - segmentProgress, 3);
      const interpolatedProgress =
        currentBaseDay &gt;= targetDay
          ? targetDay
          : currentBaseDay + (nextDay - currentBaseDay) * easedSegmentProgress;

      setPlaybackProgress(interpolatedProgress);
      setSelectedPlaybackDay(Math.max(1, Math.min(daysInMonth, Math.round(interpolatedProgress))));

      if (currentBaseDay &lt; targetDay) {
        animationFrameRef.current = window.requestAnimationFrame(step);
      } else {
        setPlaybackProgress(targetDay);
        setSelectedPlaybackDay(targetDay);
        playbackStartDayRef.current = targetDay;
        animationFrameRef.current = null;
        animationStartTimeRef.current = null;
        setIsPlaying(false);
      }
    };

    animationFrameRef.current = window.requestAnimationFrame(step);

    return () =&gt; {
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [isPlaying, daysInMonth]);

  const filteredActivities = useMemo(() =&gt; {
    const safeProgress = Math.max(1, Math.min(daysInMonth, playbackProgress));
    const wholeDay = Math.floor(safeProgress);
    const partialDayProgress = safeProgress - wholeDay;

    return dailyActivities
      .map((activity) =&gt; {
        if (activity.day &lt;= wholeDay) {
          return activity;
        }

        if (activity.day === wholeDay + 1 &amp;&amp; partialDayProgress &gt; 0) {
          return {
            ...activity,
            delivered_count: activity.delivered_count * partialDayProgress,
          };
        }

        return null;
      })
      .filter((activity): activity is NonNullable&lt;typeof activity&gt; =&gt; activity !== null);
  }, [dailyActivities, playbackProgress, daysInMonth]);

  const historicalStaffPerformance = useMemo(() =&gt; {
    const activityTotalsByStaff = new Map&lt;number, number&gt;();
    const serviceTotalsByStaff = new Map&lt;number, Record&lt;string, number&gt;&gt;();

    filteredActivities.forEach((activity) =&gt; {
      const staffId = activity.staff_id;
      const serviceId = activity.service_id;

      if (staffId == null || serviceId == null) return;

      const matchedStaff = staffPerformance.find((staff) =&gt; staff.staff_id === staffId);
      const matchedService = services.find((service) =&gt; service.service_id === serviceId);

      if (!matchedStaff || !matchedService) return;

      if (matchedService.service_name !== 'Bagel Days') {
        activityTotalsByStaff.set(
          staffId,
          (activityTotalsByStaff.get(staffId) || 0) + activity.delivered_count
        );
      }

      const existingServices = serviceTotalsByStaff.get(staffId) || {};
      existingServices[matchedService.service_name] =
        (existingServices[matchedService.service_name] || 0) + activity.delivered_count;
      serviceTotalsByStaff.set(staffId, existingServices);
    });

    return staffPerformance.map((staff) =&gt; {
      const serviceBreakdown = services.reduce&lt;Record&lt;string, number&gt;&gt;((acc, service) =&gt; {
        acc[service.service_name] =
          serviceTotalsByStaff.get(staff.staff_id)?.[service.service_name] || 0;
        return acc;
      }, {});

      const total = activityTotalsByStaff.get(staff.staff_id) || 0;

      return {
        ...staff,
        total,
        services: serviceBreakdown,
        achieved_percent: staff.target &gt; 0 ? (total / staff.target) * 100 : 0,
      };
    });
  }, [filteredActivities, services, staffPerformance]);

  const workingDaysElapsedToPlayback = useMemo(() =&gt; {
    const safeProgress = Math.max(1, Math.min(daysInMonth, playbackProgress));
    const wholeDay = Math.floor(safeProgress);
    const partialDayProgress = safeProgress - wholeDay;

    let count = 0;

    for (let day = 1; day &lt;= Math.min(wholeDay, daysInMonth); day++) {
      const currentDate = new Date(yearForMonth, selectedMonth - 1, day);
      const dayOfWeek = currentDate.getDay();

      if (dayOfWeek !== 0 &amp;&amp; dayOfWeek !== 6) {
        count += 1;
      }
    }

    const nextDay = wholeDay + 1;
    if (partialDayProgress &gt; 0 &amp;&amp; nextDay &lt;= daysInMonth) {
      const currentDate = new Date(yearForMonth, selectedMonth - 1, nextDay);
      const dayOfWeek = currentDate.getDay();

      if (dayOfWeek !== 0 &amp;&amp; dayOfWeek !== 6) {
        count += partialDayProgress;
      }
    }

    return Math.min(count, teamWorkingDays);
  }, [
    playbackProgress,
    selectedMonth,
    yearForMonth,
    daysInMonth,
    teamWorkingDays,
  ]);

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
  const isAhead = variance &gt;= 0;

  const handleDaySelect = (day: number) =&gt; {
    const safeDay = Math.max(1, Math.min(daysInMonth, day));

    if (animationFrameRef.current !== null) {
      window.cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    animationStartTimeRef.current = null;
    playbackStartDayRef.current = safeDay;
    playbackTargetDayRef.current = safeDay;
    setSelectedPlaybackDay(safeDay);
    setPlaybackProgress(safeDay);
    setIsPlaying(false);
  };

  const handleTogglePlay = () =&gt; {
    if (isPlaying) {
      const pausedDay = Math.max(1, Math.min(daysInMonth, Math.round(playbackProgress)));
      playbackStartDayRef.current = pausedDay;
      playbackTargetDayRef.current = pausedDay;
      setSelectedPlaybackDay(pausedDay);
      setPlaybackProgress(pausedDay);
      setIsPlaying(false);
      return;
    }

    const currentRoundedDay = Math.max(1, Math.min(daysInMonth, Math.round(playbackProgress)));
    const startFrom = currentRoundedDay &gt;= maxActualDay ? 1 : currentRoundedDay;
    const targetDay = maxActualDay;

    playbackStartDayRef.current = startFrom;
    playbackTargetDayRef.current = targetDay;
    setSelectedPlaybackDay(startFrom);
    setPlaybackProgress(startFrom);
    setIsPlaying(true);
  };

  const deliveredPercent =
    performanceSummary.target &gt; 0
      ? Math.min((performanceSummary.delivered / performanceSummary.target) * 100, 100)
      : 0;

  const expectedPercent =
    performanceSummary.target &gt; 0
      ? Math.min((performanceSummary.expected / performanceSummary.target) * 100, 100)
      : 0;

  if (loading) {
    return (
      &lt;div className="space-y-6"&gt;
        &lt;div className="page-header"&gt;
          &lt;h2 className="page-title"&gt;
            {isAllTeams ? "All Teams Dashboard" : `${selectedTeam?.name} Dashboard`}
          &lt;/h2&gt;
        &lt;/div&gt;
        &lt;div className="py-10 text-center text-gray-500"&gt;Loading dashboard…&lt;/div&gt;
      &lt;/div&gt;
    );
  }

  return (
    &lt;div className="space-y-6"&gt;
      &lt;div className="page-header"&gt;
        &lt;h2 className="page-title"&gt;
          {isAllTeams ? "All Teams Dashboard" : `${selectedTeam?.name} Dashboard`}
        &lt;/h2&gt;
      &lt;/div&gt;

      &lt;div className="mb-6"&gt;
        &lt;StaffPerformanceBar staffPerformance={historicalStaffPerformance} /&gt;
      &lt;/div&gt;

      &lt;div className="mb-6"&gt;
        &lt;DashboardPlaybackControls
          daysInMonth={daysInMonth}
          selectedDay={selectedPlaybackDay}
          isPlaying={isPlaying}
          playbackProgress={playbackProgress}
          onDaySelect={handleDaySelect}
          onTogglePlay={handleTogglePlay}
          month={selectedMonth}
          year={yearForMonth}
        /&gt;
      &lt;/div&gt;

      &lt;div className="mb-6 space-y-2"&gt;
        &lt;div className="flex justify-between items-center text-sm font-medium"&gt;
          &lt;span className="text-gray-700 dark:text-gray-300"&gt;
            {isAllTeams ? "Global Progress" : `${selectedTeam?.name} Progress`}
          &lt;/span&gt;
          &lt;span className="text-gray-900 dark:text-white font-bold"&gt;
            {Math.round(performanceSummary.delivered)} / {performanceSummary.target} (
            {performanceSummary.target &gt; 0
              ? Math.round((performanceSummary.delivered / performanceSummary.target) * 100)
              : 0}
            %)
          &lt;/span&gt;
        &lt;/div&gt;
        &lt;div className="relative w-full h-6 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden shadow-inner"&gt;
          &lt;div
            className={`h-6 rounded-full transition-[width] duration-150 ease-linear ${
              isAhead ? "bg-green-600" : "bg-red-600"
            }`}
            style={{ width: `${deliveredPercent}%` }}
          /&gt;
          &lt;div
            className="absolute top-0 h-6 w-0.5 bg-[#001B47] transition-[left] duration-150 ease-linear"
            style={{ left: `${expectedPercent}%` }}
          /&gt;
          &lt;div
            className={`absolute right-3 top-1/2 -translate-y-1/2 text-sm font-bold ${
              isAhead ? "text-green-700" : "text-red-700"
            }`}
          &gt;
            {isAhead ? "+" : "-"}
            {Math.abs(Math.round(variance))}
          &lt;/div&gt;
        &lt;/div&gt;
      &lt;/div&gt;

      &lt;div className="grid grid-cols-1 lg:grid-cols-3 gap-6"&gt;
        &lt;TeamProgressTile
          services={displayServices}
          staffPerformance={historicalStaffPerformance}
          viewMode={viewMode}
          workingDays={teamWorkingDays}
          workingDaysUpToToday={workingDaysElapsedToPlayback}
          month={selectedMonth}
          financialYear={financialYear}
        /&gt;
        &lt;EmployeeProgressChart
          services={displayServices}
          staffPerformance={historicalStaffPerformance}
          viewMode={viewMode}
          workingDays={teamWorkingDays}
          workingDaysUpToToday={workingDaysElapsedToPlayback}
          month={selectedMonth}
          financialYear={financialYear}
          selectedTeamId={selectedTeamId}
          teams={teams}
          playbackDay={playbackProgress}
        /&gt;
        &lt;RunRateTile
          workingDays={teamWorkingDays}
          workingDaysUpToToday={workingDaysElapsedToPlayback}
          dailyActivities={runRateActivities}
          month={selectedMonth}
          financialYear={financialYear}
          target={performanceSummary.target}
          viewMode={viewMode}
          playbackDay={playbackProgress}
        /&gt;
      &lt;/div&gt;
    &lt;/div&gt;
  );
};