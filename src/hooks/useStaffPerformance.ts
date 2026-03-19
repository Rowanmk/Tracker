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

const isAccountant = (role: string) => role === 'staff';

export const useStaffPerformance = (sortMode: SortMode): UseStaffPerformanceResult => {
  const { selectedMonth, selectedYear, financialYear } = useDate();
  const { allStaff, loading: authLoading, selectedTeamId, teams } = useAuth();
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

      const visibleAccountants = allStaff.filter(s => !s.is_hidden && isAccountant(s.role));

      const filteredStaff = selectedTeamId === "all" || !selectedTeamId
        ? visibleAccountants
        : visibleAccountants.filter(s => String(s.team_id) === selectedTeamId);

      if (filteredStaff.length === 0) {
        setPerformanceData([]);
        setDailyActivities([]);
        setTeamTarget(0);
        setLoading(false);
        return;
      }

      let totalTeamTarget = 0;
      if (selectedTeamId === 'all' || !selectedTeamId) {
        for (const team of teams) {
          const { totalTarget } = await loadTargets(selectedMonth, financialYear, undefined, team.id);
          totalTeamTarget += totalTarget;
        }
      } else {
        const { totalTarget } = await loadTargets(selectedMonth, financialYear, undefined, Number(selectedTeamId));
        totalTeamTarget = totalTarget;
      }
      setTeamTarget(totalTeamTarget);

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
        .select("staff_id, service_id, delivered_count, month, year, date")
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
              if (service.service_name !== 'Bagel Days') {
                totalDelivered += a.delivered_count || 0;
              }
            }
          });

          const staffHistorical = finalHistorical.filter(a => a.staff_id === staff.staff_id);
          const monthlyTotals: Record<string, number> = {};
          staffHistorical.forEach(a => {
            const service = services.find(s => s.service_id === a.service_id);
            if (service?.service_name !== 'Bagel Days') {
              const key = `${a.year}-${a.month}`;
              monthlyTotals[key] = (monthlyTotals[key] || 0) + (a.delivered_count || 0);
            }
          });
          const historicalMonthsCount = Object.keys(monthlyTotals).length;
          const totalHistorical = Object.values(monthlyTotals).reduce((s, v) => s + v, 0);

          const staffPrevActivities = finalPrevMonth.filter(a => a.staff_id === staff.staff_id);
          staffPrevActivities.reduce((s, a) => {
            const service = services.find(srv => srv.service_id === a.service_id);
            if (service?.service_name !== 'Bagel Days') {
              return s + (a.delivered_count || 0);
            }
            return s;
          }, 0);

          return {
            staff_id: staff.staff_id,
            name: staff.name,
            services: serviceData,
            total: totalDelivered,
            target: 0,
            achieved_percent: 0,
            historicalAverage: historicalMonthsCount > 0 ? totalHistorical / historicalMonthsCount : 0,
            previousMonthRatio: 0,
            team_id: staff.team_id
          };
        })
      );

      const sortedPerformance = [...staffResults].sort((a, b) => {
        if (sortMode === "desc") return b.total - a.total;
        if (sortMode === "asc") return a.total - b.total;
        if (sortMode === "name") return a.name.localeCompare(b.name);
        return 0;
      });

      setPerformanceData(sortedPerformance);
    } catch {
      setError("Failed to connect to database");
    } finally {
      setLoading(false);
    }
  }, [authLoading, servicesLoading, allStaff, selectedMonth, selectedYear, financialYear, sortMode, selectedTeamId, services, teams]);

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