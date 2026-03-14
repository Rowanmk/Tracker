import { useCallback, useEffect, useState } from "react";
import { supabase } from "../supabase/client";
import { loadTargets } from "../utils/loadTargets";
import { useAuth } from "../context/AuthContext";
import { useDate } from "../context/DateContext";
import { useServices } from "./useServices";
import { generateBagelDays } from "../utils/bagelDays";

export interface StaffPerformance {
  staff_id: number;
  name: string;
  services: { [key: string]: number };
  total: number;
  target: number;
  achieved_percent: number;
  historicalAverage: number;
  previousMonthRatio?: number;
  team_id: number | null;
}

type SortMode = "desc" | "asc" | "name";

interface UseStaffPerformanceResult {
  staffPerformance: StaffPerformance[];
  dailyActivities: Array<{
    staff_id: number | null;
    service_id: number | null;
    delivered_count: number;
    month: number;
    year: number;
    day: number;
    date: string;
  }>;
  teamTarget: number;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export const useStaffPerformance = (sortMode: SortMode): UseStaffPerformanceResult => {
  const { selectedMonth, selectedYear, financialYear } = useDate();
  const { allStaff, loading: authLoading, selectedTeamId } = useAuth();
  const { services, loading: servicesLoading } = useServices();

  const [performanceData, setPerformanceData] = useState<StaffPerformance[]>([]);
  const [dailyActivities, setDailyActivities] = useState<UseStaffPerformanceResult['dailyActivities']>([]);
  const [teamTarget, setTeamTarget] = useState(0);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPerformanceData = useCallback(async () => {
    if (authLoading || servicesLoading || allStaff.length === 0 || services.length === 0) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const startDate = new Date(financialYear.start, 3, 1);
      const endDate = new Date(financialYear.end, 2, 31);

      const filteredStaff = selectedTeamId === "all" || !selectedTeamId
        ? allStaff.filter(s => !s.is_hidden)
        : allStaff.filter(s => !s.is_hidden && String(s.team_id) === selectedTeamId);

      if (filteredStaff.length === 0) {
        setPerformanceData([]);
        setDailyActivities([]);
        setTeamTarget(0);
        setLoading(false);
        return;
      }

      const staffIds = filteredStaff.map(s => s.staff_id);

      const { data: bankHolidays } = await supabase.from('bank_holidays').select('date, region');
      const bagelService = services.find(s => s.service_name === 'Bagel Days');
      const bagelServiceId = bagelService?.service_id;

      const { data: activities, error: activitiesError } = await supabase
        .from("dailyactivity")
        .select("staff_id, service_id, delivered_count, month, year, day, date")
        .eq("month", selectedMonth)
        .eq("year", selectedYear)
        .in("staff_id", staffIds);

      if (activitiesError) throw activitiesError;

      let finalActivities = activities || [];
      if (bagelServiceId && bankHolidays) {
        const startOfMonth = new Date(selectedYear, selectedMonth - 1, 1);
        const endOfMonth = new Date(selectedYear, selectedMonth, 0);
        const bagels = generateBagelDays(finalActivities, bankHolidays, filteredStaff, bagelServiceId, startOfMonth, endOfMonth);
        finalActivities = [...finalActivities, ...bagels];
      }
      setDailyActivities(finalActivities as any);

      const { data: historicalActivities } = await supabase
        .from("dailyactivity")
        .select("staff_id, delivered_count, month, year, date")
        .in("staff_id", staffIds)
        .neq("month", selectedMonth)
        .gte("date", startDate.toISOString().split("T")[0])
        .lte("date", endDate.toISOString().split("T")[0]);

      let finalHistorical = historicalActivities || [];
      if (bagelServiceId && bankHolidays) {
        const bagels = generateBagelDays(finalHistorical, bankHolidays, filteredStaff, bagelServiceId, startDate, endDate)
          .filter(b => b.month !== selectedMonth);
        finalHistorical = [...finalHistorical, ...bagels];
      }

      const previousMonth = selectedMonth === 1 ? 12 : selectedMonth - 1;
      const previousYear = selectedMonth === 1 ? selectedYear - 1 : selectedYear;
      const previousMonthFinancialYear =
        previousMonth >= 4
          ? { start: previousYear, end: previousYear + 1, label: `${previousYear}/${String(previousYear + 1).slice(-2)}` }
          : { start: previousYear - 1, end: previousYear, label: `${previousYear - 1}/${String(previousYear).slice(-2)}` };

      const { data: previousMonthActivities } = await supabase
        .from("dailyactivity")
        .select("staff_id, service_id, delivered_count, date")
        .in("staff_id", staffIds)
        .eq("month", previousMonth)
        .eq("year", previousYear);

      let finalPrevMonth = previousMonthActivities || [];
      if (bagelServiceId && bankHolidays) {
        const startOfPrev = new Date(previousYear, previousMonth - 1, 1);
        const endOfPrev = new Date(previousYear, previousMonth, 0);
        const bagels = generateBagelDays(finalPrevMonth, bankHolidays, filteredStaff, bagelServiceId, startOfPrev, endOfPrev);
        finalPrevMonth = [...finalPrevMonth, ...bagels];
      }

      const staffResults: StaffPerformance[] = await Promise.all(
        filteredStaff.map(async (staff) => {
          const serviceData: { [key: string]: number } = {};
          services.forEach(s => {
            serviceData[s.service_name] = 0;
          });

          const staffActivities = finalActivities.filter(a => a.staff_id === staff.staff_id);
          let totalDelivered = 0;

          staffActivities.forEach(a => {
            const service = services.find(s => s.service_id === a.service_id);
            if (service) {
              serviceData[service.service_name] += a.delivered_count || 0;
              totalDelivered += a.delivered_count || 0;
            }
          });

          const { totalTarget } = await loadTargets(selectedMonth, financialYear, staff.staff_id);

          const staffHistorical = finalHistorical.filter(a => a.staff_id === staff.staff_id);
          const monthlyTotals: Record<string, number> = {};
          staffHistorical.forEach(a => {
            const key = `${a.year}-${a.month}`;
            monthlyTotals[key] = (monthlyTotals[key] || 0) + (a.delivered_count || 0);
          });
          const historicalMonthsCount = Object.keys(monthlyTotals).length;
          const totalHistorical = Object.values(monthlyTotals).reduce((s, v) => s + v, 0);

          const staffPrevActivities = finalPrevMonth.filter(a => a.staff_id === staff.staff_id);
          const prevMonthTotal = staffPrevActivities.reduce((s, a) => s + (a.delivered_count || 0), 0);
          const { totalTarget: prevMonthTarget } = await loadTargets(previousMonth, previousMonthFinancialYear, staff.staff_id);

          return {
            staff_id: staff.staff_id,
            name: staff.name,
            services: serviceData,
            total: totalDelivered,
            target: totalTarget,
            achieved_percent: totalTarget > 0 ? (totalDelivered / totalTarget) * 100 : 0,
            historicalAverage: historicalMonthsCount > 0 ? totalHistorical / historicalMonthsCount : 0,
            previousMonthRatio: prevMonthTarget > 0 ? prevMonthTotal / prevMonthTarget : 0,
            team_id: staff.team_id
          };
        })
      );

      const sortedPerformance = [...staffResults].sort((a, b) => {
        if (sortMode === "desc") return b.achieved_percent - a.achieved_percent;
        if (sortMode === "asc") return a.achieved_percent - b.achieved_percent;
        if (sortMode === "name") return a.name.localeCompare(b.name);
        return 0;
      });

      setPerformanceData(sortedPerformance);
      setTeamTarget(sortedPerformance.reduce((s, p) => s + p.target, 0));
    } catch {
      setError("Failed to connect to database");
    } finally {
      setLoading(false);
    }
  }, [authLoading, servicesLoading, allStaff, selectedMonth, selectedYear, financialYear, sortMode, selectedTeamId, services]);

  useEffect(() => {
    fetchPerformanceData();
  }, [fetchPerformanceData]);

  useEffect(() => {
    const handler = () => fetchPerformanceData();
    window.addEventListener("activity-updated", handler);
    return () => window.removeEventListener("activity-updated", handler);
  }, [fetchPerformanceData]);

  return {
    staffPerformance: performanceData,
    dailyActivities,
    teamTarget,
    loading,
    error,
    refetch: fetchPerformanceData,
  };
};