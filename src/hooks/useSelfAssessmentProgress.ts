import { useState, useEffect } from 'react';
import { supabase } from '../supabase/client';
import type { Database } from '../supabase/types';
import type { FinancialYear } from '../utils/financialYear';
import { isAccountantStaff } from '../utils/staff';
import {
  buildSelfAssessmentTargetAuditCorrectionKey,
  loadSelfAssessmentDistributedMonthlyTargets,
  loadSelfAssessmentTargetAuditCorrections,
  resolveSelfAssessmentOriginalTarget,
} from '../utils/selfAssessmentTargets';

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
      if (!financialYear || allStaff.length === 0 || services.length === 0) {
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

        const accountantStaff = allStaff.filter(
          (s) => !s.is_hidden && isAccountantStaff(s)
        );

        if (accountantStaff.length === 0) {
          setTeamProgress([]);
          setLoading(false);
          return;
        }

        const accountantStaffIds = accountantStaff.map((s) => s.staff_id);

        const [
          activitiesResult,
          targetsResult,
          auditCorrections,
          distributedTargets,
        ] = await Promise.all([
          supabase
            .from('dailyactivity')
            .select('staff_id, delivered_count, date')
            .eq('service_id', saService.service_id)
            .gte('date', deliveryStartIso)
            .lte('date', deliveryEndIso)
            .in('staff_id', accountantStaffIds),
          supabase
            .from('monthlytargets')
            .select('staff_id, team_id, month, year, target_value')
            .eq('service_id', saService.service_id)
            .in('year', [deliveryStartYear, deliveryEndYear])
            .in('staff_id', accountantStaffIds),
          loadSelfAssessmentTargetAuditCorrections(financialYear),
          loadSelfAssessmentDistributedMonthlyTargets(financialYear, accountantStaffIds),
        ]);

        if (activitiesResult.error) {
          setError('Failed to load activity data');
          setTeamProgress([]);
          setLoading(false);
          return;
        }

        if (targetsResult.error) {
          setError('Failed to load target data');
          setTeamProgress([]);
          setLoading(false);
          return;
        }

        const safeActivities: DailyActivity[] = (activitiesResult.data ?? []) as DailyActivity[];
        const safeTargets: MonthlyTarget[] = (targetsResult.data ?? []) as MonthlyTarget[];

        const actualsByStaffAndMonth: Record<number, Record<string, number>> = {};
        safeActivities.forEach((a) => {
          if (a.staff_id == null || !a.date) return;
          const dateObj = new Date(a.date);
          const m = dateObj.getMonth() + 1;
          const y = dateObj.getFullYear();
          const expectedYear = m >= 4 ? deliveryStartYear : deliveryEndYear;
          if (y !== expectedYear) return;

          const key = `${y}-${m}`;
          if (!actualsByStaffAndMonth[a.staff_id]) actualsByStaffAndMonth[a.staff_id] = {};
          actualsByStaffAndMonth[a.staff_id][key] = (actualsByStaffAndMonth[a.staff_id][key] || 0) + (a.delivered_count || 0);
        });

        const targetsByStaffAndMonth: Record<number, Record<string, number>> = {};
        safeTargets.forEach((t) => {
          if (t.staff_id == null) return;
          const expectedYear = t.month >= 4 ? deliveryStartYear : deliveryEndYear;
          if (t.year !== expectedYear) return;

          const key = `${t.year}-${t.month}`;
          if (!targetsByStaffAndMonth[t.staff_id]) targetsByStaffAndMonth[t.staff_id] = {};
          targetsByStaffAndMonth[t.staff_id][key] = (targetsByStaffAndMonth[t.staff_id][key] || 0) + (t.target_value || 0);
        });

        const staffWithData = new Set<number>();

        safeActivities.forEach((a: DailyActivity) => {
          if (a.staff_id != null) staffWithData.add(a.staff_id);
        });

        safeTargets.forEach((t: MonthlyTarget) => {
          if (t.staff_id != null) staffWithData.add(t.staff_id);
        });

        Object.keys(distributedTargets).forEach((staffId) => {
          staffWithData.add(Number(staffId));
        });

        const results: TeamProgressData[] = [];

        staffWithData.forEach((staffId: number) => {
          const staffMember = accountantStaff.find((s) => s.staff_id === staffId);
          if (!staffMember) return;

          const submitted = safeActivities
            .filter((a: DailyActivity) => {
              if (a.staff_id !== staffId || !a.date) return false;
              const dateObj = new Date(a.date);
              const m = dateObj.getMonth() + 1;
              const y = dateObj.getFullYear();
              const expectedYear = m >= 4 ? deliveryStartYear : deliveryEndYear;
              return y === expectedYear;
            })
            .reduce((sum: number, a: DailyActivity) => sum + (a.delivered_count ?? 0), 0);

          let fullYearTarget = 0;
          const SA_MONTHS = [4, 5, 6, 7, 8, 9, 10, 11, 12, 1];

          SA_MONTHS.forEach(m => {
            const y = m >= 4 ? deliveryStartYear : deliveryEndYear;
            const key = `${y}-${m}`;
            const currentTarget = targetsByStaffAndMonth[staffId]?.[key] || 0;
            const monthlySubmitted = actualsByStaffAndMonth[staffId]?.[key] || 0;
            const correctionKey = buildSelfAssessmentTargetAuditCorrectionKey(staffId, y, m);

            fullYearTarget += resolveSelfAssessmentOriginalTarget({
              currentTarget,
              correction: auditCorrections[correctionKey],
              distributedTarget: distributedTargets[staffId]?.[m],
              submitted: monthlySubmitted,
            });
          });

          const leftToDo = Math.max(0, fullYearTarget - submitted);

          results.push({
            team_id: staffId,
            name: staffMember.name,
            fullYearTarget,
            submitted,
            leftToDo,
          });
        });

        results.sort((a, b) => a.name.localeCompare(b.name));
        setTeamProgress(results);
      } catch (err) {
        console.error('[useSelfAssessmentProgress] fetch data:', err);
        setError('Failed to load Self Assessment progress');
        setTeamProgress([]);
      } finally {
        setLoading(false);
      }
    };

    void teams;
    void fetchData();
  }, [financialYear, allStaff, teams, services]);

  return { teamProgress, loading, error };
};