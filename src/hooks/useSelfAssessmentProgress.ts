import { useState, useEffect } from 'react';
import { supabase } from '../supabase/client';
import type { Database } from '../supabase/types';
import type { FinancialYear } from '../utils/financialYear';

type Staff = Database['public']['Tables']['staff']['Row'];
type Service = Database['public']['Tables']['services']['Row'];
type DailyActivity = Database['public']['Tables']['dailyactivity']['Row'];
type MonthlyTarget = Database['public']['Tables']['monthlytargets']['Row'];

interface StaffProgressData {
  staff_id: number;
  name: string;
  fullYearTarget: number;
  submitted: number;
  leftToDo: number;
}

export const useSelfAssessmentProgress = (
  financialYear: FinancialYear,
  allStaff: Staff[],
  services: Service[]
) => {
  const [staffProgress, setStaffProgress] = useState<StaffProgressData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      if (!financialYear || allStaff.length === 0 || services.length === 0) {
        setStaffProgress([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const saService = services.find(
          (s: Service) => s.service_name === 'Self Assessments'
        );

        if (!saService) {
          setError('Self Assessment service not found');
          setStaffProgress([]);
          setLoading(false);
          return;
        }

        const deliveryStartYear = financialYear.end;
        const deliveryEndYear = financialYear.end + 1;

        const deliveryStartDate = new Date(deliveryStartYear, 3, 1);
        const deliveryEndDate = new Date(deliveryEndYear, 0, 31);

        const deliveryStartIso = deliveryStartDate.toISOString().slice(0, 10);
        const deliveryEndIso = deliveryEndDate.toISOString().slice(0, 10);

        const today = new Date();
        let lastCompletedIso: string | null = null;

        if (today > deliveryStartDate) {
          const endOfPreviousMonth = new Date(
            today.getFullYear(),
            today.getMonth(),
            0
          );

          const clipped =
            endOfPreviousMonth < deliveryStartDate
              ? null
              : endOfPreviousMonth > deliveryEndDate
              ? deliveryEndDate
              : endOfPreviousMonth;

          lastCompletedIso = clipped
            ? clipped.toISOString().slice(0, 10)
            : null;
        }

        const { data: activities, error: activitiesError } = await supabase
          .from('dailyactivity')
          .select('staff_id, delivered_count, date')
          .eq('service_id', saService.service_id)
          .gte('date', deliveryStartIso)
          .lte('date', deliveryEndIso);

        if (activitiesError) {
          setError('Failed to load activity data');
          setStaffProgress([]);
          setLoading(false);
          return;
        }

        const safeActivities: DailyActivity[] = (activities ?? []) as DailyActivity[];

        const { data: targets, error: targetsError } = await supabase
          .from('monthlytargets')
          .select('staff_id, month, year, target_value')
          .eq('service_id', saService.service_id)
          .in('year', [deliveryStartYear, deliveryEndYear]);

        if (targetsError) {
          setError('Failed to load target data');
          setStaffProgress([]);
          setLoading(false);
          return;
        }

        const safeTargets: MonthlyTarget[] = (targets ?? []) as MonthlyTarget[];

        const staffWithData = new Set<number>();

        safeActivities.forEach((a: DailyActivity) => {
          if (a.staff_id != null) staffWithData.add(a.staff_id);
        });

        safeTargets.forEach((t: MonthlyTarget) => {
          if (t.staff_id != null) staffWithData.add(t.staff_id);
        });

        const results: StaffProgressData[] = [];

        staffWithData.forEach((staffId: number) => {
          const staff = allStaff.find(
            (s: Staff) => s.staff_id === staffId
          );
          if (!staff) return;

          const submitted = safeActivities
            .filter((a: DailyActivity) => a.staff_id === staffId)
            .reduce(
              (sum: number, a: DailyActivity) =>
                sum + (a.delivered_count ?? 0),
              0
            );

          const actualsToLastMonth =
            lastCompletedIso === null
              ? 0
              : safeActivities
                  .filter(
                    (a: DailyActivity) =>
                      a.staff_id === staffId &&
                      a.date <= lastCompletedIso
                  )
                  .reduce(
                    (sum: number, a: DailyActivity) =>
                      sum + (a.delivered_count ?? 0),
                    0
                  );

          const targetStartDate = new Date(
            today.getFullYear(),
            today.getMonth(),
            1
          );

          const futureTargets = safeTargets
            .filter((t: MonthlyTarget) => {
              if (t.staff_id !== staffId) return false;
              const tDate = new Date(t.year, t.month - 1, 1);
              return (
                tDate >= targetStartDate &&
                tDate >= deliveryStartDate &&
                tDate <= deliveryEndDate
              );
            })
            .reduce(
              (sum: number, t: MonthlyTarget) =>
                sum + (t.target_value ?? 0),
              0
            );

          const fullYearTarget = actualsToLastMonth + futureTargets;
          const leftToDo = Math.max(0, fullYearTarget - submitted);

          results.push({
            staff_id: staffId,
            name: staff.name,
            fullYearTarget,
            submitted,
            leftToDo,
          });
        });

        results.sort((a, b) => a.name.localeCompare(b.name));
        setStaffProgress(results);
      } catch {
        setError('Failed to load Self Assessment progress');
        setStaffProgress([]);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [financialYear, allStaff, services]);

  return { staffProgress, loading, error };
};