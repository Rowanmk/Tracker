import { useState, useEffect } from 'react';
import { supabase } from '../supabase/client';
import type { Database } from '../supabase/types';
import type { FinancialYear } from '../utils/financialYear';

type Staff = Database['public']['Tables']['staff']['Row'];
type Team = Database['public']['Tables']['teams']['Row'];
type Service = Database['public']['Tables']['services']['Row'];
type DailyActivity = Database['public']['Tables']['dailyactivity']['Row'];
type MonthlyTarget = Database['public']['Tables']['monthlytargets']['Row'];

export interface TeamProgressData {
  team_id: number;
  name: string;
  fullYearTarget: number;
  submitted: number;
  leftToDo: number;
}

export const useSelfAssessmentProgress = (
  financialYear: FinancialYear,
  allStaff: Staff[],
  teams: Team[],
  services: Service[]
) => {
  const [teamProgress, setTeamProgress] = useState<TeamProgressData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      if (!financialYear || allStaff.length === 0 || teams.length === 0 || services.length === 0) {
        setTeamProgress([]);
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
          setTeamProgress([]);
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
          setTeamProgress([]);
          setLoading(false);
          return;
        }

        const safeActivities: DailyActivity[] = (activities ?? []) as DailyActivity[];

        const { data: targets, error: targetsError } = await supabase
          .from('monthlytargets')
          .select('team_id, month, year, target_value')
          .eq('service_id', saService.service_id)
          .in('year', [deliveryStartYear, deliveryEndYear]);

        if (targetsError) {
          setError('Failed to load target data');
          setTeamProgress([]);
          setLoading(false);
          return;
        }

        const safeTargets: MonthlyTarget[] = (targets ?? []) as MonthlyTarget[];

        const teamWithData = new Set<number>();

        safeActivities.forEach((a: DailyActivity) => {
          const staff = allStaff.find(s => s.staff_id === a.staff_id);
          if (staff && staff.team_id) teamWithData.add(staff.team_id);
        });

        safeTargets.forEach((t: MonthlyTarget) => {
          if (t.team_id != null) teamWithData.add(t.team_id);
        });

        const results: TeamProgressData[] = [];

        teamWithData.forEach((teamId: number) => {
          const team = teams.find(t => t.id === teamId);
          if (!team) return;

          const teamStaffIds = allStaff.filter(s => s.team_id === teamId).map(s => s.staff_id);

          const submitted = safeActivities
            .filter((a: DailyActivity) => a.staff_id && teamStaffIds.includes(a.staff_id))
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
                      a.staff_id && teamStaffIds.includes(a.staff_id) &&
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
              if (t.team_id !== teamId) return false;
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
            team_id: teamId,
            name: team.name,
            fullYearTarget,
            submitted,
            leftToDo,
          });
        });

        results.sort((a, b) => a.name.localeCompare(b.name));
        setTeamProgress(results);
      } catch {
        setError('Failed to load Self Assessment progress');
        setTeamProgress([]);
      } finally {
        setLoading(false);
      }
    };

    void fetchData();
  }, [financialYear, allStaff, teams, services]);

  return { teamProgress, loading, error };
};