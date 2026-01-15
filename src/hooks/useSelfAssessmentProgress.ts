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
      if (allStaff.length === 0 || services.length === 0) {
        setStaffProgress([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        // Find Self Assessment service
        const saService = services.find(
          (s) => s.service_name === 'Self Assessments'
        );

        if (!saService) {
          setError('Self Assessment service not found');
          setStaffProgress([]);
          setLoading(false);
          return;
        }

        // Date range for financial year: April YYYY to January YYYY+1
        const startDate = new Date(financialYear.start, 3, 1); // April 1
        const endDate = new Date(financialYear.end, 0, 31); // January 31
        const startIso = startDate.toISOString().slice(0, 10);
        const endIso = endDate.toISOString().slice(0, 10);

        // Fetch all SA actuals in the financial year
        const { data: activities, error: activitiesError } = await supabase
          .from('dailyactivity')
          .select('staff_id, delivered_count')
          .eq('service_id', saService.service_id)
          .gte('date', startIso)
          .lte('date', endIso);

        if (activitiesError) {
          console.error('Error fetching activities:', activitiesError);
          setError('Failed to load activity data');
          setStaffProgress([]);
          setLoading(false);
          return;
        }

        // Fetch all SA targets in the financial year
        const { data: targets, error: targetsError } = await supabase
          .from('monthlytargets')
          .select('staff_id, month, year, target_value')
          .eq('service_id', saService.service_id)
          .in('year', [financialYear.start, financialYear.end]);

        if (targetsError) {
          console.error('Error fetching targets:', targetsError);
          setError('Failed to load target data');
          setStaffProgress([]);
          setLoading(false);
          return;
        }

        // Build set of staff IDs that have either actuals or targets
        const staffWithData = new Set<number>();

        (activities || []).forEach((a) => {
          if (a.staff_id) staffWithData.add(a.staff_id);
        });

        (targets || []).forEach((t) => {
          if (t.staff_id) staffWithData.add(t.staff_id);
        });

        // Calculate progress for each staff member
        const progress: StaffProgressData[] = [];

        for (const staffId of Array.from(staffWithData).sort((a, b) => a - b)) {
          const staff = allStaff.find((s) => s.staff_id === staffId);
          if (!staff) continue;

          // Sum submitted (actuals)
          const submitted = (activities || [])
            .filter((a) => a.staff_id === staffId)
            .reduce((sum, a) => sum + (a.delivered_count || 0), 0);

          // Calculate full year target
          // = (Completed items up to end of last fully completed month) + (Monthly targets for future months)
          const today = new Date();
          const currentMonth = today.getMonth() + 1;
          const currentYear = today.getFullYear();

          // Determine last fully completed month
          let lastCompletedMonth = currentMonth - 1;
          let lastCompletedYear = currentYear;
          if (lastCompletedMonth === 0) {
            lastCompletedMonth = 12;
            lastCompletedYear--;
          }

          // Sum actuals up to end of last fully completed month
          const lastCompletedDateEnd = new Date(lastCompletedYear, lastCompletedMonth, 0);
          const lastCompletedIso = lastCompletedDateEnd.toISOString().slice(0, 10);

          const submittedUpToLastMonth = (activities || [])
            .filter((a) => {
              if (a.staff_id !== staffId) return false;
              return a.date <= lastCompletedIso;
            })
            .reduce((sum, a) => sum + (a.delivered_count || 0), 0);

          // Sum targets for future months in the financial year
          let futureTargets = 0;

          // Determine which months are "future" relative to last completed month
          const fyMonths = [4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3];

          fyMonths.forEach((month) => {
            const year = month >= 4 ? financialYear.start : financialYear.end;

            // Check if this month is after last completed month
            const isAfterLastCompleted =
              year > lastCompletedYear ||
              (year === lastCompletedYear && month > lastCompletedMonth);

            if (isAfterLastCompleted) {
              const monthTargets = (targets || [])
                .filter(
                  (t) =>
                    t.staff_id === staffId &&
                    t.month === month &&
                    t.year === year
                )
                .reduce((sum, t) => sum + (t.target_value || 0), 0);

              futureTargets += monthTargets;
            }
          });

          const fullYearTarget = submittedUpToLastMonth + futureTargets;
          const leftToDo = Math.max(0, fullYearTarget - submitted);

          progress.push({
            staff_id: staffId,
            name: staff.name,
            fullYearTarget,
            submitted,
            leftToDo,
          });
        }

        // Sort by name
        progress.sort((a, b) => a.name.localeCompare(b.name));

        setStaffProgress(progress);
      } catch (err) {
        console.error('Error in useSelfAssessmentProgress:', err);
        setError('Failed to load Self Assessment progress data');
        setStaffProgress([]);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [financialYear, allStaff.length, services.length]);

  return { staffProgress, loading, error };
};