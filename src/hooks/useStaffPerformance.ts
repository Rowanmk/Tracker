import { useCallback, useEffect, useMemo, useState } from "react";
    import { supabase } from "../supabase/client";
    import { loadTargets } from "../utils/loadTargets";
    import { useAuth } from "../context/AuthContext";
    import { useDate } from "../context/DateContext";
    import { useServices } from "./useServices";
    import { generateBagelDays, BAGEL_SERVICE_ID } from "../utils/bagelDays";
    import { isAccountantStaff } from "../utils/staff";

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
      const { selectedMonth, financialYear } = useDate();
      const { allStaff, loading: authLoading, selectedTeamId } = useAuth();
      const { services, loading: servicesLoading } = useServices();

      const [performanceData, setPerformanceData] = useState<StaffPerformance[]>([]);
      const [dailyActivities, setDailyActivities] = useState<UseStaffPerformanceResult['dailyActivities']>([]);
      const [teamTarget, setTeamTarget] = useState(0);

      const [loading, setLoading] = useState(true);
      const [error, setError] = useState<string | null>(null);

      const accountantStaff = useMemo(
        () => allStaff.filter(s => !s.is_hidden && isAccountantStaff(s)),
        [allStaff]
      );

      const fetchPerformanceData = useCallback(async () => {
        if (authLoading || servicesLoading || accountantStaff.length === 0 || services.length === 0) {
          setLoading(false);
          return;
        }

        setLoading(true);
        setError(null);

        try {
          const startDate = new Date(financialYear.start, 3, 1);
          const endDate = new Date(financialYear.end, 2, 31);

          const isFullTeamSelection =
            !selectedTeamId || selectedTeamId === "team-view";

          const filteredStaff = isFullTeamSelection
            ? accountantStaff
            : accountantStaff.filter(s => String(s.staff_id) === selectedTeamId);

          if (filteredStaff.length === 0) {
            setPerformanceData([]);
            setDailyActivities([]);
            setTeamTarget(0);
            setLoading(false);
            return;
          }

          const targetsMap = new Map<number, number>();
          await Promise.all(
            filteredStaff.map(async (staffMember) => {
              const { totalTarget } = await loadTargets(selectedMonth, financialYear, staffMember.staff_id);
              targetsMap.set(staffMember.staff_id, totalTarget);
            })
          );

          const totalTeamTarget = Array.from(targetsMap.values()).reduce((sum, v) => sum + v, 0);
          setTeamTarget(totalTeamTarget);

          const staffIds = filteredStaff.map(s => s.staff_id);

          const { data: bankHolidays } = await supabase.from('bank_holidays').select('date, region');
          const yearForSelectedMonth = selectedMonth >= 4 ? financialYear.start : financialYear.end;

          const { data: activities, error: activitiesError } = await supabase
            .from("dailyactivity")
            .select("staff_id, service_id, delivered_count, month, year, day, date")
            .eq("month", selectedMonth)
            .eq("year", yearForSelectedMonth)
            .in("staff_id", staffIds);

          if (activitiesError) throw activitiesError;

          let finalActivities = activities || [];
          if (bankHolidays) {
            const startOfMonth = new Date(yearForSelectedMonth, selectedMonth - 1, 1);
            const endOfMonth = new Date(yearForSelectedMonth, selectedMonth, 0);
            const bagels = generateBagelDays(finalActivities, bankHolidays, filteredStaff, BAGEL_SERVICE_ID, startOfMonth, endOfMonth);
            finalActivities = [...finalActivities, ...bagels];
          }
          setDailyActivities(finalActivities as UseStaffPerformanceResult['dailyActivities']);

          const { data: historicalActivities } = await supabase
            .from("dailyactivity")
            .select("staff_id, service_id, delivered_count, month, year, date")
            .in("staff_id", staffIds)
            .neq("month", selectedMonth)
            .gte("date", startDate.toISOString().split("T")[0])
            .lte("date", endDate.toISOString().split("T")[0]);

          let finalHistorical = historicalActivities || [];
          if (bankHolidays) {
            const bagels = generateBagelDays(finalHistorical, bankHolidays, filteredStaff, BAGEL_SERVICE_ID, startDate, endDate)
              .filter(b => b.month !== selectedMonth);
            finalHistorical = [...finalHistorical, ...bagels];
          }

          const previousMonth = selectedMonth === 1 ? 12 : selectedMonth - 1;
          const previousYear = selectedMonth === 1
            ? (yearForSelectedMonth - 1)
            : yearForSelectedMonth;

          const { data: previousMonthActivities } = await supabase
            .from("dailyactivity")
            .select("staff_id, service_id, delivered_count, date")
            .in("staff_id", staffIds)
            .eq("month", previousMonth)
            .eq("year", previousYear);

          let finalPrevMonth = previousMonthActivities || [];
          if (bankHolidays) {
            const startOfPrev = new Date(previousYear, previousMonth - 1, 1);
            const endOfPrev = new Date(previousYear, previousMonth, 0);
            const bagels = generateBagelDays(finalPrevMonth, bankHolidays, filteredStaff, BAGEL_SERVICE_ID, startOfPrev, endOfPrev);
            finalPrevMonth = [...finalPrevMonth, ...bagels];
          }

          const staffResults: StaffPerformance[] = filteredStaff.map((staff) => {
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
                if (service.service_id !== BAGEL_SERVICE_ID) {
                  totalDelivered += a.delivered_count || 0;
                }
              }
            });

            const totalTarget = targetsMap.get(staff.staff_id) ?? 0;

            const staffHistorical = finalHistorical.filter(a => a.staff_id === staff.staff_id);
            const monthlyTotals: Record<string, number> = {};
            staffHistorical.forEach(a => {
              if (a.service_id !== BAGEL_SERVICE_ID) {
                const key = `${a.year}-${a.month}`;
                monthlyTotals[key] = (monthlyTotals[key] || 0) + (a.delivered_count || 0);
              }
            });
            const historicalMonthsCount = Object.keys(monthlyTotals).length;
            const totalHistorical = Object.values(monthlyTotals).reduce((s, v) => s + v, 0);

            const staffPrevActivities = finalPrevMonth.filter(a => a.staff_id === staff.staff_id);
            const previousMonthTotal = staffPrevActivities.reduce((sum, a) => {
              if (a.service_id !== BAGEL_SERVICE_ID) {
                return sum + (a.delivered_count || 0);
              }
              return sum;
            }, 0);

            return {
              staff_id: staff.staff_id,
              name: staff.name,
              services: serviceData,
              total: totalDelivered,
              target: totalTarget,
              achieved_percent: totalTarget > 0 ? (totalDelivered / totalTarget) * 100 : 0,
              historicalAverage: historicalMonthsCount > 0 ? totalHistorical / historicalMonthsCount : 0,
              previousMonthRatio: previousMonthTotal > 0 ? totalDelivered / previousMonthTotal : 0,
              team_id: staff.team_id
            };
          });

          const sortedPerformance = [...staffResults].sort((a, b) => {
            if (sortMode === "desc") return b.total - a.total;
            if (sortMode === "asc") return a.total - b.total;
            if (sortMode === "name") return a.name.localeCompare(b.name);
            return 0;
          });

          setPerformanceData(sortedPerformance);
        } catch (err) {
          void err;
          setError("Failed to connect to database");
        } finally {
          setLoading(false);
        }
      }, [authLoading, servicesLoading, accountantStaff, selectedMonth, financialYear, sortMode, selectedTeamId, services]);

      useEffect(() => {
        fetchPerformanceData();
      }, [fetchPerformanceData]);

      useEffect(() => {
        const handler = () => fetchPerformanceData();
        window.addEventListener("activity-updated", handler);
        window.addEventListener("targets-updated", handler);
        return () => {
          window.removeEventListener("activity-updated", handler);
          window.removeEventListener("targets-updated", handler);
        };
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