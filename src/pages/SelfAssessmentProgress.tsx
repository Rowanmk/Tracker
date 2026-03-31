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
import type { Database } from '../supabase/types';

type Staff = Database['public']['Tables']['staff']['Row'];

const isAccountant = (staffMember: Staff) => {
  const role = (staffMember.role || '').toLowerCase();
  return role === 'staff' || role === 'admin';
};

/**
 * Calculates the expected number of SA submissions by today's date,
 * based on the delivery window (Apr FY.end → Jan FY.end+1) and the non-linear
 * monthly targets set in the Targets Control sheet.
 */
function calcRunRatePercent(
  submitted: number,
  fullYearTarget: number,
  financialYear: FinancialYear,
  teamId: number | 'total',
  monthlyData: Record<number, Record<number, { submitted: number; target: number }>>
): number | null {
  if (fullYearTarget <= 0) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Delivery window: 6 April of FY.end → 31 January of FY.end+1
  const windowStart = new Date(financialYear.end, 3, 6); // 6 April
  const windowEnd = new Date(financialYear.end + 1, 0, 31); // 31 January

  // If today is before the window starts, expected = 0 → run rate is undefined
  if (today < windowStart) return null;

  // If today is after the window ends, expected = full target
  if (today > windowEnd) {
    return (submitted / fullYearTarget) * 100;
  }

  // Calculate expected target up to today based on monthly targets
  let expectedByToday = 0;
  const SA_MONTHS = [4, 5, 6, 7, 8, 9, 10, 11, 12, 1];
  
  for (const monthNum of SA_MONTHS) {
    const year = monthNum >= 4 ? financialYear.end : financialYear.end + 1;
    const monthStart = new Date(year, monthNum - 1, 1);
    const monthEnd = new Date(year, monthNum, 0);
    
    // Special case for April: starts on 6th
    const effectiveMonthStart = monthNum === 4 ? new Date(year, 3, 6) : monthStart;
    
    // Get the target for this month
    let monthTarget = 0;
    if (teamId === 'total') {
      // Sum across all teams
      monthTarget = Object.values(monthlyData).reduce((sum, teamData) => sum + (teamData[monthNum]?.target || 0), 0);
    } else {
      monthTarget = monthlyData[teamId]?.[monthNum]?.target || 0;
    }

    if (today > monthEnd) {
      // Full month has passed
      expectedByToday += monthTarget;
    } else if (today >= effectiveMonthStart && today <= monthEnd) {
      // We are in this month, calculate partial target
      const totalDaysInMonth = monthEnd.getDate() - effectiveMonthStart.getDate() + 1;
      const daysElapsed = today.getDate() - effectiveMonthStart.getDate() + 1;
      const fraction = Math.max(0, Math.min(1, daysElapsed / totalDaysInMonth));
      expectedByToday += monthTarget * fraction;
      break; // Future months will be 0
    } else {
      // Future month
      break;
    }
  }

  if (expectedByToday <= 0) return null;

  return (submitted / expectedByToday) * 100;
}

function getRunRateColor(pct: number): string {
  if (pct >= 95) return 'text-green-700 bg-green-50';
  if (pct >= 75) return 'text-orange-700 bg-orange-50';
  return 'text-red-700 bg-red-50';
}

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
      if (services.length === 0 || teamProgress.length === 0) return;

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

        const staffIds = teamProgress.map((t) => t.team_id);

        const { data: activities } = await supabase
          .from('dailyactivity')
          .select('staff_id, delivered_count, date')
          .eq('service_id', saService.service_id)
          .gte('date', deliveryStartIso)
          .lte('date', deliveryEndIso)
          .in('staff_id', staffIds);

        const { data: targets } = await supabase
          .from('monthlytargets')
          .select('staff_id, month, year, target_value')
          .eq('service_id', saService.service_id)
          .in('year', [deliveryStartYear, deliveryEndYear])
          .in('staff_id', staffIds);

        const breakdown: Record<
          number,
          Record<number, { submitted: number; target: number }>
        > = {};

        teamProgress.forEach((staffEntry) => {
          breakdown[staffEntry.team_id] = {};
          getFinancialYearMonths().forEach((m) => {
            breakdown[staffEntry.team_id][m.number] = { submitted: 0, target: 0 };
          });
        });

        (activities || []).forEach((a) => {
          if (a.staff_id != null && breakdown[a.staff_id]) {
            const m = new Date(a.date).getMonth() + 1;
            if (!breakdown[a.staff_id][m]) {
              breakdown[a.staff_id][m] = { submitted: 0, target: 0 };
            }
            breakdown[a.staff_id][m].submitted += a.delivered_count || 0;
          }
        });

        (targets || []).forEach((t) => {
          if (t.staff_id != null && breakdown[t.staff_id]) {
            if (!breakdown[t.staff_id][t.month]) {
              breakdown[t.staff_id][t.month] = { submitted: 0, target: 0 };
            }
            breakdown[t.staff_id][t.month].target += t.target_value || 0;
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
  }, [localFinancialYear, services, teamProgress]);

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

  const totalRunRatePct = calcRunRatePercent(
    totals.submitted,
    totals.fullYearTarget,
    localFinancialYear,
    'total',
    monthlyData
  );

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
                    Total % Completed
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-bold uppercase leading-tight">
                    Run Rate %
                    <div className="text-[9px] font-normal text-gray-400 normal-case tracking-normal mt-0.5">
                      vs today's expected
                    </div>
                  </th>
                </tr>
              </thead>

              <tbody>
                {sortedVisibleTeams.map((entry) => {
                  const pct =
                    entry.fullYearTarget > 0
                      ? (entry.submitted / entry.fullYearTarget) * 100
                      : 0;

                  const runRatePct = calcRunRatePercent(
                    entry.submitted,
                    entry.fullYearTarget,
                    localFinancialYear,
                    entry.team_id,
                    monthlyData
                  );

                  const isActive = activeTeamId === entry.team_id;

                  return (
                    <tr
                      key={entry.team_id}
                      className={`transition-colors ${
                        isActive
                          ? 'bg-blue-50 ring-1 ring-blue-300'
                          : 'hover:bg-gray-50'
                      }`}
                    >
                      <td className="px-4 py-3 font-medium">{entry.name}</td>
                      <td className="px-4 py-3 text-center font-semibold">
                        {entry.fullYearTarget}
                      </td>
                      <td className="px-4 py-3 text-center font-semibold">
                        {entry.submitted}
                      </td>
                      <td className="px-4 py-3 text-center font-semibold">
                        {pct.toFixed(1)}%
                      </td>
                      <td className="px-4 py-3 text-center">
                        {runRatePct === null ? (
                          <span className="text-xs text-gray-400">—</span>
                        ) : (
                          <span
                            className={`inline-flex items-center justify-center px-2 py-0.5 rounded text-xs font-bold ${getRunRateColor(runRatePct)}`}
                          >
                            {Math.round(runRatePct)}%
                          </span>
                        )}
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
                  <td className="px-4 py-3 text-center">
                    {totalRunRatePct === null ? (
                      <span className="text-xs text-gray-400">—</span>
                    ) : (
                      <span
                        className={`inline-flex items-center justify-center px-2 py-0.5 rounded text-xs font-bold ${getRunRateColor(totalRunRatePct)}`}
                      >
                        {Math.round(totalRunRatePct)}%
                      </span>
                    )}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Legend */}
          <div className="px-4 py-3 border-t border-gray-100 bg-gray-50 flex flex-wrap gap-3 text-xs text-gray-500">
            <span className="font-semibold text-gray-600">Run Rate % key:</span>
            <span className="inline-flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block"></span>
              ≥95% — on or ahead of run rate
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-orange-500 inline-block"></span>
              75–94% — slightly behind
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block"></span>
              &lt;75% — significantly behind
            </span>
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