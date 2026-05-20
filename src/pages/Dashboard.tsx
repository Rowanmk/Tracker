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
import { supabase } from "../supabase/client";
import { BAGEL_SERVICE_ID } from "../utils/bagelDays";

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
    () => services.filter((s) => s.service_id !== BAGEL_SERVICE_ID),
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

  const initialSelectedDay = Math.max(1, maxActualDay);
  const [currentDayIndex, setCurrentDayIndex] = useState(initialSelectedDay);

  useEffect(() => {
    setCurrentDayIndex(initialSelectedDay);
  }, [selectedMonth, selectedYear, selectedTeamId, initialSelectedDay]);

  const clampDay = (day: number) => Math.max(1, Math.min(maxActualDay, day));

  const filteredActivities = useMemo(() => {
    const selectedDay = clampDay(currentDayIndex);
    return dailyActivities.filter((activity) => activity.day <= selectedDay);
  }, [dailyActivities, currentDayIndex, maxActualDay]);

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

      if (matchedService.service_id !== BAGEL_SERVICE_ID) {
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
    const selectedDay = clampDay(currentDayIndex);
    let count = 0;

    for (let day = 1; day <= daysInMonth; day++) {
      if (day > selectedDay) {
        break;
      }

      const dateStr = `${yearForMonth}-${String(selectedMonth).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const currentDate = new Date(yearForMonth, selectedMonth - 1, day);
      const dayOfWeek = currentDate.getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      const isHoliday = bankHolidayDates.has(dateStr);

      if (isWeekend || isHoliday) continue;
      count += 1;
    }

    return Math.min(count, teamWorkingDays);
  }, [
    currentDayIndex,
    selectedMonth,
    yearForMonth,
    daysInMonth,
    teamWorkingDays,
    bankHolidayDates,
    maxActualDay,
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
    setCurrentDayIndex(clampDay(day));
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
    Math.min(maxActualDay, currentDayIndex)
  );

  const runRateActivities = useMemo(() => {
    const noBagels = filteredActivities.filter(
      (a) => a.service_id !== BAGEL_SERVICE_ID
    );

    if (isIndividualDashboard && selectedAccountant) {
      return noBagels.filter((a) => a.staff_id === selectedAccountant.staff_id);
    }

    return noBagels;
  }, [filteredActivities, isIndividualDashboard, selectedAccountant]);

  const runRateStaffList = useMemo(() => {
    if (isIndividualDashboard && selectedAccountant) {
      return staffPerformance
        .filter((s) => s.staff_id === selectedAccountant.staff_id)
        .map((s) => ({ staff_id: s.staff_id, name: s.name }));
    }
    return staffPerformance.map((s) => ({ staff_id: s.staff_id, name: s.name }));
  }, [staffPerformance, isIndividualDashboard, selectedAccountant]);

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
          onDaySelect={handleDaySelect}
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
            playbackDay={selectedDayIndicator}
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
            playbackDay={selectedDayIndicator}
            totalDelivered={performanceSummary.delivered}
            staffPerformance={runRateStaffList}
          />
        </div>
      </div>
    </div>
  );
};