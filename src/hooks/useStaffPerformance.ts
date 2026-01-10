import { useCallback, useEffect, useState } from "react";
import { supabase } from "../supabase/client";
import { loadTargets } from "../utils/loadTargets";
import { useAuth } from "../context/AuthContext";
import { useDate } from "../context/DateContext";
import { useServices } from "./useServices";

export interface StaffPerformance {
  staff_id: number;
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
  staffPerformance: StaffPerformance[];
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

  const [staffPerformance, setStaffPerformance] = useState<StaffPerformance[]>([]);
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
      const startDate = new Date(financialYear.start, 3, 1); // Apr 1
      const endDate = new Date(financialYear.end, 2, 31);   // Mar 31

      const { data: activities, error: activitiesError } = await supabase
        .from("dailyactivity")
        .select("staff_id, service_id, delivered_count, month, year, day, date")
        .eq("month", selectedMonth)
        .eq("year", selectedYear)
        .gte("date", startDate.toISOString().split("T")[0])
        .lte("date", endDate.toISOString().split("T")[0]);

      if (activitiesError) {
        console.error("Error fetching activities:", activitiesError);
        setError("Failed to load activity data");
      }

      setDailyActivities(activities || []);

      const { data: historicalActivities, error: historicalError } = await supabase
        .from("dailyactivity")
        .select("staff_id, delivered_count, month, year, date")
        .neq("month", selectedMonth)
        .gte("date", startDate.toISOString().split("T")[0])
        .lte("date", endDate.toISOString().split("T")[0]);

      if (historicalError) {
        console.error("Error fetching historical data:", historicalError);
      }

      const previousMonth = selectedMonth === 1 ? 12 : selectedMonth - 1;
      const previousYear = selectedMonth === 1 ? selectedYear - 1 : selectedYear;

      const { data: previousMonthActivities } = await supabase
        .from("dailyactivity")
        .select("staff_id, service_id, delivered_count")
        .eq("month", previousMonth)
        .eq("year", previousYear);

      const performance: StaffPerformance[] = await Promise.all(
        allStaff.map(async (staff) => {
          const staffActivities =
            activities?.filter((a: any) => a.staff_id === staff.staff_id) || [];

          const staffActivityMap: Record<number, number> = {};
          staffActivities.forEach((activity: any) => {
            if (activity.service_id) {
              staffActivityMap[activity.service_id] =
                (staffActivityMap[activity.service_id] || 0) + activity.delivered_count;
            }
          });

          const serviceData: { [key: string]: number } = {};
          services.forEach((service: any) => {
            serviceData[service.service_name] = staffActivityMap[service.service_id] || 0;
          });

          const total = Object.values(serviceData).reduce((sum, val) => sum + val, 0);

          const { totalTarget } = await loadTargets(selectedMonth, financialYear, staff.staff_id);
          const achieved_percent = totalTarget > 0 ? (total / totalTarget) * 100 : 0;

          const staffHistorical =
            historicalActivities?.filter((a: any) => a.staff_id === staff.staff_id) || [];
          const monthlyTotals: Record<string, number> = {};
          staffHistorical.forEach((activity: any) => {
            const key = `${activity.year}-${activity.month}`;
            monthlyTotals[key] = (monthlyTotals[key] || 0) + activity.delivered_count;
          });
          const monthsWithData = Object.keys(monthlyTotals).length;
          const totalHistorical = Object.values(monthlyTotals).reduce((sum, val) => sum + val, 0);
          const historicalAverage = monthsWithData > 0 ? totalHistorical / monthsWithData : 0;

          const prevMonthActivities =
            previousMonthActivities?.filter((a: any) => a.staff_id === staff.staff_id) || [];
          const prevMonthTotal = prevMonthActivities.reduce((sum: number, a: any) => sum + a.delivered_count, 0);

          const { totalTarget: prevMonthTarget } = await loadTargets(previousMonth, financialYear, staff.staff_id);
          const previousMonthRatio = prevMonthTarget > 0 ? prevMonthTotal / prevMonthTarget : 0;

          return {
            staff_id: staff.staff_id,
            name: staff.name,
            services: serviceData,
            total,
            target: totalTarget,
            achieved_percent,
            historicalAverage,
            previousMonthRatio,
          };
        })
      );

      const sortedPerformance = [...performance].sort((a, b) => {
        const perfA = a.target > 0 ? a.total / a.target : 0;
        const perfB = b.target > 0 ? b.total / b.target : 0;

        if (sortMode === "desc") return perfB - perfA;
        if (sortMode === "asc") return perfA - perfB;
        if (sortMode === "name") return a.name.localeCompare(b.name);
        return 0;
      });

      setStaffPerformance(sortedPerformance);

      let teamTotalTarget = 0;
      for (const staff of allStaff) {
        const { totalTarget: staffTarget } = await loadTargets(selectedMonth, financialYear, staff.staff_id);
        teamTotalTarget += staffTarget;
      }
      setTeamTarget(teamTotalTarget);

    } catch (e) {
      console.error("Error in fetchPerformanceData:", e);
      setError("Failed to connect to database");
      setStaffPerformance([]);
      setDailyActivities([]);
      setTeamTarget(0);
    } finally {
      setLoading(false);
    }
  }, [
    authLoading,
    servicesLoading,
    allStaff,
    services,
    selectedMonth,
    selectedYear,
    financialYear,
    sortMode,
  ]);

  useEffect(() => {
    fetchPerformanceData();
  }, [fetchPerformanceData]);

  useEffect(() => {
    const handler = () => fetchPerformanceData();
    window.addEventListener("activity-updated", handler);
    return () => window.removeEventListener("activity-updated", handler);
  }, [fetchPerformanceData]);

  return {
    staffPerformance,
    dailyActivities,
    teamTarget,
    loading,
    error,
    refetch: fetchPerformanceData,
  };
};
