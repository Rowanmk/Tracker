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
import { supabase } from "../supabase/client";

const DAY_TRANSITION_DURATION_MS = 800;
const DAY_STEP_PAUSE_MS = 150;

interface PlaybackControllerState {
  currentDayIndex: number;
  targetDayIndex: number;
  isPlaying: boolean;
  isPaused: boolean;
  animationProgress: number;
}

const easeInOut = (t: number) => 0.5 - Math.cos(Math.PI * t) / 2;

const getRunRateStatusColor = (achievedPercent: number, elapsedWorkingDayPercent: number) => {
  if (elapsedWorkingDayPercent <= 0) {
    return { bar: "#008A00", text: "text-green-700" };
  }
  const paceRatio = (achievedPercent / elapsedWorkingDayPercent) * 100;
  if (paceRatio >= 100) return { bar: "#008A00", text: "text-green-700" };
  if (paceRatio >= 80) return { bar: "#FF8A2A", text: "text-orange-700" };
  return { bar: "#FF3B30", text: "text-red-700" };
};

export const Dashboard: React.FC = () => {
  const { viewMode } = useDashboardView();
  const { selectedMonth, selectedYear, financialYear } = useDate();
  const { selectedTeamId, teams, accountantStaff, currentStaff } = useAuth();

  const { services } = useServices();
  const { staffPerformance, dailyActivities, loading } = useStaffPerformance("desc");

  const [bankHolidayDates, setBankHolidayDates] = useState<Set<string>>(new Set());

  const yearForMonth = selectedMonth >= 4 ? financialYear.start : financialYear.end;
  const daysInMonth = new Date(yearForMonth, selectedMonth, 0).getDate();

  const startIso = `${yearForMonth}-${String(selectedMonth).padStart(2, "0")}-01`;
  const endIso = `${yearForMonth}-${String(selectedMonth).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;

  useEffect(() => {
    const fetchHolidays = async () => {
      const { data } = await supabase
        .from("bank_holidays")
        .select("date")
        .eq("region", "england-and-wales")
        .gte("date", startIso)
        .lte("date", endIso);

      const dates = new Set<string>((data || []).map((h) => h.date));
      setBankHolidayDates(dates);
    };
    void fetchHolidays();
  }, [startIso, endIso]);

  const displayServices = useMemo(
    () => services.filter((s) => s.service_name !== "Bagel Days"),
    [services]
  );

  const isTeamView = selectedTeamId === "team-view";
  const selectedAccountant = useMemo(() => {
    if (!selectedTeamId || isTeamView) return null;
    return accountantStaff.find((s) => String(s.staff_id) === selectedTeamId) || null;
  }, [accountantStaff, isTeamView, selectedTeamId]);

  const dashboardTitle = isTeamView
    ? "Team Dashboard"
    : `${selectedAccountant?.name || currentStaff?.name || "Team"} Dashboard`;

  const { teamWorkingDays } = useWorkingDays({
    financialYear,
    month: selectedMonth,
  });

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

  const [playbackController, setPlaybackController] = useState<PlaybackControllerState>({
    currentDayIndex: initialPlaybackDay,
    targetDayIndex: initialPlaybackDay,
    isPlaying: false,
    isPaused: false,
    animationProgress: initialPlaybackDay,
  });

  const rafRef = useRef<number | null>(null);
  const pauseTimeoutRef = useRef<number | null>(null);
  const sequenceRef = useRef(0);

  const clampDay = (day: number) => Math.max(1, Math.min(maxActualDay, day));

  const stopPlaybackLoop = () => {
    if (rafRef.current !== null) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (pauseTimeoutRef.current !== null) {
      window.clearTimeout(pauseTimeoutRef.current);
      pauseTimeoutRef.current = null;
    }
  };

  const setIdleAtDay = (day: number) => {
    const safeDay = clampDay(day);
    setPlaybackController({
      currentDayIndex: safeDay,
      targetDayIndex: safeDay,
      isPlaying: false,
      isPaused: false,
      animationProgress: safeDay,
    });
  };

  useEffect(() => {
    stopPlaybackLoop();
    sequenceRef.current += 1;
    setIdleAtDay(initialPlaybackDay);
    return () => { stopPlaybackLoop(); };
  }, [selectedMonth, selectedYear, selectedTeamId, initialPlaybackDay]);

  const startPlaybackSequence = (startDay: number, targetDay: number) => {
    stopPlaybackLoop();
    sequenceRef.current += 1;
    const localSequence = sequenceRef.current;
    const safeTarget = clampDay(targetDay);

    const animateDayStep = (fromDay: number) => {
      if (localSequence !== sequenceRef.current) return;
      const safeFromDay = clampDay(fromDay);
      if (safeFromDay >= safeTarget) {
        setPlaybackController({
          currentDayIndex: safeTarget,
          targetDayIndex: safeTarget,
          isPlaying: false,
          isPaused: false,
          animationProgress: safeTarget,
        });
        return;
      }

      const nextDay = clampDay(safeFromDay + 1);
      const stepStartedAt = performance.now();

      const tick = (timestamp: number) => {
        if (localSequence !== sequenceRef.current) return;
        const elapsed = timestamp - stepStartedAt;
        const linearProgress = Math.min(elapsed / DAY_TRANSITION_DURATION_MS, 1);
        const easedProgress = easeInOut(linearProgress);
        const animationProgress = safeFromDay + (nextDay - safeFromDay) * easedProgress;

        setPlaybackController({
          currentDayIndex: safeFromDay,
          targetDayIndex: safeTarget,
          isPlaying: true,
          isPaused: false,
          animationProgress,
        });

        if (linearProgress < 1) {
          rafRef.current = window.requestAnimationFrame(tick);
          return;
        }

        setPlaybackController({
          currentDayIndex: nextDay,
          targetDayIndex: safeTarget,
          isPlaying: true,
          isPaused: false,
          animationProgress: nextDay,
        });

        if (nextDay >= safeTarget) {
          setPlaybackController({
            currentDayIndex: nextDay,
            targetDayIndex: nextDay,
            isPlaying: false,
            isPaused: false,
            animationProgress: nextDay,
          });
          rafRef.current = null;
          return;
        }

        pauseTimeoutRef.current = window.setTimeout(() => {
          animateDayStep(nextDay);
        }, DAY_STEP_PAUSE_MS);
      };

      rafRef.current = window.requestAnimationFrame(tick);
    };

    setPlaybackController({
      currentDayIndex: clampDay(startDay),
      targetDayIndex: safeTarget,
      isPlaying: true,
      isPaused: false,
      animationProgress: clampDay(startDay),
    });

    animateDayStep(startDay);
  };

  const filteredActivities = useMemo(() => {
    const safeProgress = Math.max(1, Math.min(daysInMonth, playbackController.animationProgress));
    return dailyActivities
      .map((activity) => {
        const visibleFraction = Math.max(0, Math.min(1, safeProgress - (activity.day - 1)));
        if (visibleFraction <= 0) return null;
        return { ...activity, delivered_count: activity.delivered_count * visibleFraction };
      })
      .filter((a): a is NonNullable<typeof a> => a !== null);
  }, [dailyActivities, daysInMonth, playbackController.animationProgress]);

  const historicalStaffPerformance = useMemo(() => {
    const activityTotalsByStaff = new Map<number, number>();
    const serviceTotalsByStaff = new Map<number, Record<string, number>>();
    const staffById = new Map(staffPerformance.map((s) => [s.staff_id, s]));
    const servicesById = new Map(services.map((s) => [s.service_id, s]));

    filteredActivities.forEach((activity) => {
      const staffId = activity.staff_id;
      const serviceId = activity.service_id;
      if (staffId == null || serviceId == null) return;

      const matchedStaff = staffById.get(staffId);
      const matchedService = servicesById.get(serviceId);
      if (!matchedStaff || !matchedService) return;

      if (matchedService.service_name !== "Bagel Days") {
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

    return staffPerformance.map((staff) => {
      const serviceBreakdown = services.reduce<Record<string, number>>((acc, service) => {
        acc[service.service_name] =
          serviceTotalsByStaff.get(staff.staff_id)?.[service.service_name] || 0;
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
    const safeProgress = Math.max(1, Math.min(daysInMonth, playbackController.animationProgress));
    let count = 0;

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${yearForMonth}-${String(selectedMonth).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const currentDate = new Date(yearForMonth, selectedMonth - 1, day);
      const dayOfWeek = currentDate.getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      const isHoliday = bankHolidayDates.has(dateStr);

      if (isWeekend || isHoliday) continue;

      const visibleFraction = Math.max(0, Math.min(1, safeProgress - (day - 1)));
      count += visibleFraction;
    }

    return Math.min(count, teamWorkingDays);
  }, [
    playbackController.animationProgress,
    selectedMonth,
    yearForMonth,
    daysInMonth,
    teamWorkingDays,
    bankHolidayDates,
  ]);

  const isIndividualDashboard = !isTeamView && !!selectedAccountant;

  const summaryStaffPerformance = useMemo(() => {
    if (isIndividualDashboard && selectedAccountant) {
      return historicalStaffPerformance.filter(
        (staff) => staff.staff_id === selectedAccountant.staff_id
      );
    }

    return historicalStaffPerformance;
  }, [historicalStaffPerformance, isIndividualDashboard, selectedAccountant]);

  const summaryTarget = useMemo(() => {
    if (isIndividualDashboard && selectedAccountant) {
      return summaryStaffPerformance[0]?.target || 0;
    }

    return summaryStaffPerformance.reduce((sum, staff) => sum + (staff.target || 0), 0);
  }, [isIndividualDashboard, selectedAccountant, summaryStaffPerformance]);

  const performanceSummary = usePerformanceSummary({
    staffPerformance: summaryStaffPerformance,
    workingDays: teamWorkingDays,
    workingDaysUpToToday: workingDaysElapsedToPlayback,
    selectedMonth,
    selectedYear,
    dashboardMode: isIndividualDashboard ? "individual" : "team",
    currentStaff: isIndividualDashboard && selectedAccountant ? { staff_id: selectedAccountant.staff_id } : null,
    teamTarget: summaryTarget,
  });

  const variance = performanceSummary.variance;

  const handleDaySelect = (day: number) => {
    stopPlaybackLoop();
    sequenceRef.current += 1;
    setIdleAtDay(day);
  };

  const handlePlayPause = () => {
    if (playbackController.isPlaying) {
      stopPlaybackLoop();
      sequenceRef.current += 1;
      const pausedDay = clampDay(playbackController.animationProgress);
      setPlaybackController({
        currentDayIndex: pausedDay,
        targetDayIndex: maxActualDay,
        isPlaying: false,
        isPaused: true,
        animationProgress: pausedDay,
      });
      return;
    }

    const isResume = playbackController.isPaused;
    const startDay = isResume
      ? clampDay(playbackController.animationProgress)
      : clampDay(
          playbackController.animationProgress >= maxActualDay
            ? 1
            : playbackController.animationProgress
        );

    startPlaybackSequence(startDay, maxActualDay);
  };

  const handleReset = () => {
    stopPlaybackLoop();
    sequenceRef.current += 1;
    setIdleAtDay(1);
  };

  const deliveredPercent =
    performanceSummary.target > 0
      ? Math.min((performanceSummary.delivered / performanceSummary.target) * 100, 100)
      : 0;

  const expectedPercent =
    performanceSummary.target > 0
      ? Math.min((performanceSummary.expectedRaw / performanceSummary.target) * 100, 100)
      : 0;

  const elapsedWorkingDayPercent =
    teamWorkingDays > 0 ? (workingDaysElapsedToPlayback / teamWorkingDays) * 100 : 0;

  const globalProgressStatus = getRunRateStatusColor(deliveredPercent, elapsedWorkingDayPercent);

  const selectedDayIndicator = Math.max(
    1,
    Math.min(maxActualDay, Math.round(playbackController.animationProgress))
  );

  // Build run rate activities: no bagels, scoped to individual if needed
  // These are used for the per-day breakdown in the chart bars
  const runRateActivities = useMemo(() => {
    const bagelService = services.find((s) => s.service_name === "Bagel Days");

    const noBagels = filteredActivities.filter(
      (a) => !bagelService || a.service_id !== bagelService.service_id
    );

    if (isIndividualDashboard && selectedAccountant) {
      return noBagels.filter((a) => a.staff_id === selectedAccountant.staff_id);
    }

    return noBagels;
  }, [filteredActivities, services, isIndividualDashboard, selectedAccountant]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="page-header">
          <h2 className="page-title">{dashboardTitle}</h2>
        </div>
        <div className="py-10 text-center text-gray-500">Loading dashboard…</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="page-header">
        <h2 className="page-title">{dashboardTitle}</h2>
      </div>

      <div className="mb-6">
        <StaffPerformanceBar
          staffPerformance={summaryStaffPerformance}
          teamTarget={performanceSummary.target}
          workingDaysUpToToday={workingDaysElapsedToPlayback}
          workingDays={teamWorkingDays}
        />
      </div>

      <div className="mb-6">
        <DashboardPlaybackControls
          daysInMonth={daysInMonth}
          selectedDay={selectedDayIndicator}
          isPlaying={playbackController.isPlaying}
          isPaused={playbackController.isPaused}
          playbackProgress={playbackController.animationProgress}
          maxPlayableDay={maxActualDay}
          onDaySelect={handleDaySelect}
          onPlayPause={handlePlayPause}
          onReset={handleReset}
          month={selectedMonth}
          year={yearForMonth}
        />
      </div>

      <div className="mb-6 space-y-2">
        <div className="flex justify-between items-center text-sm font-medium">
          <span className="text-gray-700 dark:text-gray-300">Global Progress</span>
          <span className="text-gray-900 dark:text-white font-bold">
            {Math.round(performanceSummary.delivered)} / {performanceSummary.target} (
            {performanceSummary.target > 0
              ? Math.round((performanceSummary.delivered / performanceSummary.target) * 100)
              : 0}
            %)
          </span>
        </div>
        <div className="relative w-full h-6 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden shadow-inner">
          <div
            className="h-6 rounded-full transition-[width] duration-[800ms] ease-in-out"
            style={{ width: `${deliveredPercent}%`, backgroundColor: globalProgressStatus.bar }}
          />
          <div
            className="absolute top-0 h-6 w-0.5 bg-[#001B47] transition-[left] duration-[800ms] ease-in-out"
            style={{ left: `${expectedPercent}%` }}
          />
          <div
            className={`absolute right-3 top-1/2 -translate-y-1/2 text-sm font-bold ${globalProgressStatus.text}`}
          >
            {variance > 0 ? "+" : ""}
            {variance}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div>
          <TeamProgressTile
            services={displayServices}
            staffPerformance={historicalStaffPerformance}
            viewMode={viewMode}
            workingDays={teamWorkingDays}
            workingDaysUpToToday={workingDaysElapsedToPlayback}
            month={selectedMonth}
            financialYear={financialYear}
          />
        </div>
        <div>
          <EmployeeProgressChart
            services={displayServices}
            staffPerformance={historicalStaffPerformance}
            viewMode={viewMode}
            workingDays={teamWorkingDays}
            workingDaysUpToToday={workingDaysElapsedToPlayback}
            month={selectedMonth}
            financialYear={financialYear}
            selectedTeamId={selectedTeamId}
            teams={teams}
            playbackDay={playbackController.animationProgress}
          />
        </div>
        <div>
          <RunRateTile
            workingDays={teamWorkingDays}
            workingDaysUpToToday={workingDaysElapsedToPlayback}
            dailyActivities={runRateActivities}
            month={selectedMonth}
            financialYear={financialYear}
            target={performanceSummary.target}
            viewMode={viewMode}
            playbackDay={playbackController.animationProgress}
            totalDelivered={performanceSummary.delivered}
          />
        </div>
      </div>
    </div>
  );
};