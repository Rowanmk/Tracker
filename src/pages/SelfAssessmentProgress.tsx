import React, { useState, useMemo } from 'react';
import { useDate } from '../context/DateContext';
import { useAuth } from '../context/AuthContext';
import { useServices } from '../hooks/useServices';
import { useSelfAssessmentProgress } from '../hooks/useSelfAssessmentProgress';
import { SelfAssessmentProgressChart } from '../components/SelfAssessmentProgressChart';
import { FinancialYearSelector } from '../components/FinancialYearSelector';
import { getFinancialYears, getFinancialYearMonths } from '../utils/financialYear';
import { supabase } from '../supabase/client';
import type { FinancialYear } from '../utils/financialYear';

export const SelfAssessmentProgress: React.FC = () => {
  const { selectedFinancialYear } = useDate();
  const { allStaff, teams, loading: authLoading } = useAuth();
  const { services, loading: servicesLoading } = useServices();

  const [activeTeamId, setActiveTeamId] = useState<number | null>(null);

  const lastCompletedFinancialYear = useMemo(() => {
    const allYears = getFinancialYears();
    const currentFY = selectedFinancialYear;
    const lastCompleted = allYears.find((fy) => fy.end === currentFY.start);
    return lastCompleted || currentFY;
  }, [selectedFinancialYear]);

  const [localFinancialYear, setLocalFinancialYear] =
    useState<FinancialYear>(lastCompletedFinancialYear);

  const { teamProgress, loading, error } = useSelfAssessmentProgress(
    localFinancialYear,
    allStaff,
    teams,
    services
  );

  const [monthlyData, setMonthlyData] = useState<
    Record<number, Record<number, { submitted: number; target: number }>>
  >({});
  const [loadingMonthly, setLoadingMonthly] = useState(false);

  React.useEffect(() => {
    const fetchMonthlyData = async () => {
      if (services.length === 0) return;

      setLoadingMonthly(true);

      try {
        const saService = services.find(
          (s) => s.service_name === 'Self Assessments'
        );

        if (!saService) {
          setMonthlyData({});
          return;
        }

        const deliveryStartYear = localFinancialYear.end;
        const deliveryEndYear = localFinancialYear.end + 1;

        const deliveryStartIso = new Date(deliveryStartYear, 3, 1)
          .toISOString()
          .slice(0, 10);
        const deliveryEndIso = new Date(deliveryEndYear, 0, 31)
          .toISOString()
          .slice(0, 10);

        const { data: activities } = await supabase
          .from('dailyactivity')
          .select('staff_id, delivered_count, date')
          .eq('service_id', saService.service_id)
          .gte('date', deliveryStartIso)
          .lte('date', deliveryEndIso);

        const { data: targets } = await supabase
          .from('monthlytargets')
          .select('team_id, month, year, target_value')
          .eq('service_id', saService.service_id)
          .in('year', [deliveryStartYear, deliveryEndYear]);

        const breakdown: Record<
          number,
          Record<number, { submitted: number; target: number }>
        > = {};

        teamProgress.forEach((team) => {
          breakdown[team.team_id] = {};
          getFinancialYearMonths().forEach((m) => {
            breakdown[team.team_id][m.number] = { submitted: 0, target: 0 };
          });
        });

        (activities || []).forEach((a) => {
          const staff = allStaff.find(s => s.staff_id === a.staff_id);
          if (staff && staff.team_id && breakdown[staff.team_id]) {
            const m = new Date(a.date).getMonth() + 1;
            if (!breakdown[staff.team_id][m]) {
              breakdown[staff.team_id][m] = { submitted: 0, target: 0 };
            }
            breakdown[staff.team_id][m].submitted += a.delivered_count || 0;
          }
        });

        (targets || []).forEach((t) => {
          if (t.team_id != null && breakdown[t.team_id]) {
            if (!breakdown[t.team_id][t.month]) {
              breakdown[t.team_id][t.month] = { submitted: 0, target: 0 };
            }
            breakdown[t.team_id][t.month].target += t.target_value || 0;
          }
        });

        setMonthlyData(breakdown);
      } catch {
        setMonthlyData({});
      } finally {
        setLoadingMonthly(false);
      }
    };

    fetchMonthlyData();
  }, [localFinancialYear, services, teamProgress, allStaff]);

  const visibleTeams = teamProgress.filter(
    (t) => t.fullYearTarget > 0 || t.submitted > 0
  );

  const sortedVisibleTeams = useMemo(() => {
    return [...visibleTeams].sort((a, b) => {
      const percentA = a.fullYearTarget > 0 ? (a.submitted / a.fullYearTarget) * 100 : 0;
      const percentB = b.fullYearTarget > 0 ? (b.submitted / b.fullYearTarget) * 100 : 0;
      return percentB - percentA;
    });
  }, [visibleTeams]);

  const totals = sortedVisibleTeams.reduce(
    (acc, t) => {
      acc.fullYearTarget += t.fullYearTarget;
      acc.submitted += t.submitted;
      acc.leftToDo += t.leftToDo;
      return acc;
    },
    { fullYearTarget: 0, submitted: 0, leftToDo: 0 }
  );

  const totalPercentAchieved =
    totals.fullYearTarget > 0
      ? (totals.submitted / totals.fullYearTarget) * 100
      : 0;

  if (loading || authLoading || servicesLoading) {
    return <div className="py-6 text-center text-gray-500">Loading…</div>;
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-md">
        ⚠️ {error}
      </div>
    );
  }

  return (
    <div className="max-w-[1600px] mx-auto px-6 space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4 page-header">
        <div>
          <h2 className="page-title">Self Assessment Progress</h2>
          <p className="page-subtitle">
            Tax year to April {localFinancialYear.end}
          </p>
        </div>

        <div className="w-full lg:w-48">
          <FinancialYearSelector
            selectedFinancialYear={localFinancialYear}
            onFinancialYearChange={setLocalFinancialYear}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[45%_55%] gap-6">
        <div className="bg-white rounded-xl shadow-md border tile-brand overflow-hidden flex flex-col">
          <div className="tile-header px-4 py-1.5">Self Assessment Data</div>

          <div className="flex-1 overflow-auto">
            <table className="w-full divide-y">
              <thead className="bg-gray-50 sticky top-0 z-10">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase">
                    Accountant
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-bold uppercase">
                    Target
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-bold uppercase">
                    Submitted
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-bold uppercase">
                    %
                  </th>
                </tr>
              </thead>

              <tbody>
                {sortedVisibleTeams.map((team) => {
                  const pct =
                    team.fullYearTarget > 0
                      ? (team.submitted / team.fullYearTarget) * 100
                      : 0;

                  const isActive = activeTeamId === team.team_id;

                  return (
                    <tr
                      key={team.team_id}
                      className={`transition-colors ${
                        isActive
                          ? 'bg-blue-50 ring-1 ring-blue-300'
                          : 'hover:bg-gray-50'
                      }`}
                    >
                      <td className="px-4 py-3 font-medium">{team.name}</td>
                      <td className="px-4 py-3 text-center font-semibold">
                        {team.fullYearTarget}
                      </td>
                      <td className="px-4 py-3 text-center font-semibold">
                        {team.submitted}
                      </td>
                      <td className="px-4 py-3 text-center font-semibold">
                        {pct.toFixed(1)}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>

              <tfoot className="bg-gray-100 font-bold sticky bottom-0">
                <tr>
                  <td className="px-4 py-3">Total</td>
                  <td className="px-4 py-3 text-center">{totals.fullYearTarget}</td>
                  <td className="px-4 py-3 text-center">{totals.submitted}</td>
                  <td className="px-4 py-3 text-center">
                    {totalPercentAchieved.toFixed(1)}%
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-md border tile-brand overflow-hidden flex flex-col">
          <div className="tile-header px-4 py-1.5">Monthly Progress</div>

          <div className="flex-1 p-4">
            {loadingMonthly ? (
              <div className="h-full flex items-center justify-center text-gray-500">
                Loading chart data…
              </div>
            ) : (
              <SelfAssessmentProgressChart
                teamProgress={sortedVisibleTeams}
                financialYear={localFinancialYear}
                monthlyData={monthlyData}
                activeTeamId={activeTeamId}
                onActiveTeamChange={setActiveTeamId}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};