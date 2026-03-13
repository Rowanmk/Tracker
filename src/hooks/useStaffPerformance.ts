import { useCallback, useEffect, useState } from "react";
import { supabase } from "../supabase/client";
import { loadTargets } from "../utils/loadTargets";
import { useAuth } from "../context/AuthContext";
import { useDate } from "../context/DateContext";
import { useServices } from "./useServices";

export interface TeamPerformance {
  team_id: number | 'unassigned';
  name: string;
  services: { [key: string]: number };
  total: number;
  target: number;
  achieved_percent: number;
  historicalAverage: number;
  previousMonthRatio?: number;
}

type SortMode = "desc" | "asc" | "name";

interface UseStaffPerformanceResult {
  staffPerformance: TeamPerformance[];
  dailyActivities: any[];
  teamTarget: number;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export const useStaffPerformance = (sortMode: SortMode): UseStaffPerformanceResult => {
  const { selectedMonth, selectedYear, financialYear } = useDate();
  const { allStaff, loading: authLoading } = useAuth();
  const { services, loading: servicesLoading } = useServices();

  const [performanceData, setPerformanceData] = useState<TeamPerformance[]>([]);
  const [dailyActivities, setDailyActivities] = useState<any[]>([]);
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

      const { data: teamsData } = await supabase.from('teams').select('*');
      const teams = teamsData || [];

      const { data: activities, error: activitiesError } = await supabase
        .from("dailyactivity")
        .select("staff_id, service_id, delivered_count, month, year, day, date")
        .eq("month", selectedMonth)
        .eq("year", selectedYear)
        .gte("date", startDate.toISOString().split("T")[0])
        .lte("date", endDate.toISOString().split("T")[0]);

      if (activitiesError) throw activitiesError;
      setDailyActivities(activities || []);

      const { data: historicalActivities } = await supabase
        .from("dailyactivity")
        .select("staff_id, delivered_count, month, year, date")
        .gte("date", startDate.toISOString().split("T")[0])
        .lte("date", endDate.toISOString().split("T")[0]);

      const previousMonth = selectedMonth === 1 ? 12 : selectedMonth - 1;
      const previousYear = selectedMonth === 1 ? selectedYear - 1 : selectedYear;
      const { data: previousMonthActivities } = await supabase
        .from("dailyactivity")
        .select("staff_id, service_id, delivered_count")
        .eq("month", previousMonth)
        .eq("year", previousYear);

      const teamPerformance: TeamPerformance[] = await Promise.all(
        [...teams, { id: 'unassigned', name: 'Unassigned', is_active: true }].map(async (team) => {
          const teamId = team.id;
          const teamStaff = allStaff.filter(s => 
            teamId === 'unassigned' ? !s.team_id : s.team_id === teamId
          );

          if (teamStaff.length === 0 && teamId !== 'unassigned') return null;

          const serviceData: { [key: string]: number } = {};
          services.forEach(s => serviceData[s.service_name] = 0);
          
          let totalDelivered = 0;
          let totalTarget = 0;
          const teamMonthlyTotals: Record<string, number> = {};
          const teamPrevMonthTotals = { delivered: 0, target: 0 };

          for (const staff of teamStaff) {
            const staffActivities = activities?.filter(a => a.staff_id === staff.staff_id) || [];
            staffActivities.forEach(a => {
              const service = services.find(s => s.service_id === a.service_id);
              if (service) {
                serviceData[service.service_name] += a.delivered_count;
                totalDelivered += a.delivered_count;
              }
            });

            const { totalTarget: staffTarget } = await loadTargets(selectedMonth, financialYear, staff.staff_id);
            totalTarget += staffTarget;

            const staffHistorical = historicalActivities?.filter(a => a.staff_id === staff.staff_id) || [];
            staffHistorical.forEach(a => {
              const key = `${a.year}-${a.month}`;
              teamMonthlyTotals[key] = (teamMonthlyTotals[key] || 0) + a.delivered_count;
            });

            const staffPrevActivities = previousMonthActivities?.filter(a => a.staff_id === staff.staff_id) || [];
            teamPrevMonthTotals.delivered += staffPrevActivities.reduce((s, a) => s + a.delivered_count, 0);
            const { totalTarget: staffPrevTarget } = await loadTargets(previousMonth, financialYear, staff.staff_id);
            teamPrevMonthTotals.target += staffPrevTarget;
          }

          // Exclude current month from historical average calculation
          const currentMonthKey = `${selectedYear}-${selectedMonth}`;
          const historicalKeys = Object.keys(teamMonthlyTotals).filter(k => k !== currentMonthKey);
          const totalHistorical = historicalKeys.reduce((s, k) => s + teamMonthlyTotals[k], 0);
          const historicalMonthsCount = historicalKeys.length;

          if (teamStaff.length === 0 && totalDelivered === 0 && totalTarget === 0) return null;

          return {
            team_id: teamId as number | 'unassigned',
            name: team.name,
            services: serviceData,
            total: totalDelivered,
            target: totalTarget,
            achieved_percent: totalTarget > 0 ? (totalDelivered / totalTarget) * 100 : 0,
            historicalAverage: historicalMonthsCount > 0 ? totalHistorical / historicalMonthsCount : 0,
            previousMonthRatio: teamPrevMonthTotals.target > 0 ? teamPrevMonthTotals.delivered / teamPrevMonthTotals.target : 0,
          };
        })
      ).then(results => results.filter((r): r is TeamPerformance => r !== null));

      const sortedPerformance = [...teamPerformance].sort((a, b) => {
        if (sortMode === "desc") return b.achieved_percent - a.achieved_percent;
        if (sortMode === "asc") return a.achieved_percent - b.achieved_percent;
        if (sortMode === "name") return a.name.localeCompare(b.name);
        return 0;
      });

      setPerformanceData(sortedPerformance);
      setTeamTarget(sortedPerformance.reduce((s, p) => s + p.target, 0));

    } catch (e) {
      console.error("Error in fetchPerformanceData:", e);
      setError("Failed to connect to database");
    } finally {
      setLoading(false);
    }
  }, [authLoading, servicesLoading, allStaff, selectedMonth, selectedYear, financialYear, sortMode]);

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