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

  const windowStart = new Date(financialYear.end, 3, 6);
  const windowEnd = new Date(financialYear.end + 1, 0, 31);

  if (today < windowStart) return null;

  if (today > windowEnd) {
    return (submitted / fullYearTarget) * 100;
  }

  let expectedByToday = 0;
  const SA_MONTHS = [4, 5, 6, 7, 8, 9, 10, 11, 12, 1];

  for (const monthNum of SA_MONTHS) {
    const year = monthNum >= 4 ? financialYear.end : financialYear.end + 1;
    const monthStart = new Date(year, monthNum - 1, 1);
    const monthEnd = new Date(year, monthNum, 0);
    const effectiveMonthStart = monthNum === 4 ? new Date(year, 3, 6) : monthStart;

    let monthTarget = 0;
    if (teamId === 'total') {
      monthTarget = Object.values(monthlyData).reduce((sum, teamData) => sum + (teamData[monthNum]?.target || 0), 0);
    } else {
      monthTarget = monthlyData[teamId]?.[monthNum]?.target || 0;
    }

    if (today > monthEnd) {
      expectedByToday += monthTarget;
    } else if (today >= effectiveMonthStart && today <= monthEnd) {
      const totalDaysInMonth = monthEnd.getDate() - effectiveMonthStart.getDate() + 1;
      const daysElapsed = today.getDate() - effectiveMonthStart.getDate() + 1;
      const fraction = Math.max(0, Math.min(1, daysElapsed / totalDaysInMonth));
      expectedByToday += monthTarget * fraction;
      break;
    } else {
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

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export const SelfAssessmentProgress: React.FC = () => {
  const { selectedFinancialYear, selectedMonth } = useDate();
  const { allStaff, teams, loading: authLoading } = useAuth();
  const { services, loading: servicesLoading } = useServices();

  const [activeTeamId, setActiveTeamId] = useState<number | null>(null);

  // Default to 25/26 financial year
  const defaultFinancialYear = useMemo(() => {
    const allYears = getFinancialYears();
    return allYears.find(fy => fy.start === 2025 && fy.end === 2026) || allYears[1] || selectedFinancialYear;
  }, [selectedFinancialYear]);

  const [localFinancialYear, setLocalFinancialYear] = useState<FinancialYear>(defaultFinancialYear);

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
        const saService = services.find((s) => s.service_name === 'Self Assessments');

        if (!saService) {
          setMonthlyData({});
          return;
        }

        const deliveryStartYear = localFinancialYear.end;
        const deliveryEndYear = localFinancialYear.end + 1;

        const deliveryStartIso = new Date(deliveryStartYear, 3, 1).toISOString().slice(0, 10);
        const deliveryEndIso = new Date(deliveryEndYear, 0, 31).toISOString().slice(0, 10);

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

        const breakdown: Record<number, Record<number, { submitted: number; target: number }>> = {};

        teamProgress.forEach((staffEntry) => {
          breakdown[staffEntry.team_id] = {};
          getFinancialYearMonths().forEach((m) => {
            breakdown[staffEntry.team_id][m.number] = { submitted: 0, target: 0 };
          });
        });

        (activities || []).forEach((a) => {
          if (a.staff_id != null && breakdown[a.staff_id]) {
            const dateObj = new Date(a.date);
            const m = dateObj.getMonth() + 1;
            const y = dateObj.getFullYear();
            const expectedYear = m >= 4 ? deliveryStartYear : deliveryEndYear;
            if (y !== expectedYear) return;

            if (!breakdown[a.staff_id][m]) {
              breakdown[a.staff_id][m] = { submitted: 0, target: 0 };
            }
            breakdown[a.staff_id][m].submitted += a.delivered_count || 0;
          }
        });

        const dbTargets: Record<number, Record<number, number>> = {};
        (targets || []).forEach((t) => {
          if (t.staff_id != null) {
            const expectedYear = t.month >= 4 ? deliveryStartYear : deliveryEndYear;
            if (t.year !== expectedYear) return;

            if (!dbTargets[t.staff_id]) dbTargets[t.staff_id] = {};
            dbTargets[t.staff_id][t.month] = (dbTargets[t.staff_id][t.month] || 0) + (t.target_value || 0);
          }
        });

        const today = new Date();
        const currentYear = today.getFullYear();
        const currentMonth = today.getMonth() + 1;

        teamProgress.forEach((staffEntry) => {
          const staffId = staffEntry.team_id;
          getFinancialYearMonths().forEach((m) => {
            const monthNum = m.number;
            const yearNum = monthNum >= 4 ? deliveryStartYear : deliveryEndYear;
            const isPastMonth = yearNum < currentYear || (yearNum === currentYear && monthNum < currentMonth);

            if (isPastMonth) {
              breakdown[staffId][monthNum].target = breakdown[staffId][monthNum].submitted;
            } else {
              breakdown[staffId][monthNum].target = dbTargets[staffId]?.[monthNum] || 0;
            }
          });
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

  const visibleTeams = teamProgress.filter((t) => t.fullYearTarget > 0 || t.submitted > 0);

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
    totals.fullYearTarget > 0 ? (totals.submitted / totals.fullYearTarget) * 100 : 0;

  const totalRunRatePct = calcRunRatePercent(
    totals.submitted,
    totals.fullYearTarget,
    localFinancialYear,
    'total',
    monthlyData
  );

  // Monthly tile data — linked to dashboard selected month
  const monthlyTileData = useMemo(() => {
    if (!monthlyData || Object.keys(monthlyData).length === 0) return null;

    const monthSubmitted = sortedVisibleTeams.reduce((sum, entry) => {
      return sum + (monthlyData[entry.team_id]?.[selectedMonth]?.submitted || 0);
    }, 0);

    const monthTarget = sortedVisibleTeams.reduce((sum, entry) => {
      return sum + (monthlyData[entry.team_id]?.[selectedMonth]?.target || 0);
    }, 0);

    const monthPct = monthTarget > 0 ? (monthSubmitted / monthTarget) * 100 : 0;

    const perAccountant = sortedVisibleTeams.map(entry => ({
      name: entry.name,
      submitted: monthlyData[entry.team_id]?.[selectedMonth]?.submitted || 0,
      target: monthlyData[entry.team_id]?.[selectedMonth]?.target || 0,
    })).filter(e => e.submitted > 0 || e.target > 0);

    return {
      month: selectedMonth,
      monthName: MONTH_NAMES[selectedMonth - 1],
      submitted: monthSubmitted,
      target: monthTarget,
      pct: monthPct,
      perAccountant,
    };
  }, [monthlyData, selectedMonth, sortedVisibleTeams]);

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
        {/* Full Year Data Tile */}
        <div className="bg-white rounded-xl shadow-md border tile-brand overflow-hidden flex flex-col">
          <div className="tile-header px-4 py-1.5">Self Assessment Data — Full Year</div>

          <div className="flex-1 overflow-auto">
            <table className="w-full divide-y">
              <thead className="bg-gray-50 sticky top-0 z-10">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase">Accountant</th>
                  <th className="px-4 py-3 text-center text-xs font-bold uppercase">Target</th>
                  <th className="px-4 py-3 text-center text-xs font-bold uppercase">Submitted</th>
                  <th className="px-4 py-3 text-center text-xs font-bold uppercase">Total % Completed</th>
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
                      <td className="px-4 py-3 text-center font-semibold">{entry.fullYearTarget}</td>
                      <td className="px-4 py-3 text-center font-semibold">{entry.submitted}</td>
                      <td className="px-4 py-3 text-center font-semibold">{pct.toFixed(1)}%</td>
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
                  <td className="px-4 py-3 text-center">{totalPercentAchieved.toFixed(1)}%</td>
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

        {/* Monthly Progress Chart */}
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

      {/* Monthly Data Tile — linked to dashboard selected month */}
      <div className="bg-white rounded-xl shadow-md border tile-brand overflow-hidden">
        <div className="tile-header px-4 py-1.5 flex items-center justify-between">
          <span>Self Assessment Data — {monthlyTileData?.monthName ?? MONTH_NAMES[selectedMonth - 1]}</span>
          <span className="text-white/70 text-xs font-normal">
            Linked to dashboard month selector
          </span>
        </div>

        {loadingMonthly ? (
          <div className="px-6 py-8 text-center text-gray-500 text-sm">Loading monthly data…</div>
        ) : !monthlyTileData || (monthlyTileData.submitted === 0 && monthlyTileData.target === 0) ? (
          <div className="px-6 py-8 text-center text-gray-500 text-sm">
            No Self Assessment data recorded for {MONTH_NAMES[selectedMonth - 1]}.
          </div>
        ) : (
          <div className="overflow-auto">
            <table className="w-full divide-y">
              <thead className="bg-gray-50 sticky top-0 z-10">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase">Accountant</th>
                  <th className="px-4 py-3 text-center text-xs font-bold uppercase">
                    {monthlyTileData.monthName} Target
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-bold uppercase">
                    {monthlyTileData.monthName} Submitted
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-bold uppercase">% of Month Target</th>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase">Progress</th>
                </tr>
              </thead>

              <tbody>
                {monthlyTileData.perAccountant.map((entry, idx) => {
                  const pct = entry.target > 0 ? (entry.submitted / entry.target) * 100 : 0;
                  const barColor =
                    pct >= 95
                      ? 'bg-green-500'
                      : pct >= 75
                      ? 'bg-orange-500'
                      : 'bg-red-500';

                  return (
                    <tr
                      key={entry.name}
                      className={idx % 2 === 0 ? 'bg-white hover:bg-gray-50' : 'bg-gray-50/50 hover:bg-gray-100'}
                    >
                      <td className="px-4 py-3 font-medium text-gray-900">{entry.name}</td>
                      <td className="px-4 py-3 text-center font-semibold text-gray-700">
                        {entry.target}
                      </td>
                      <td className="px-4 py-3 text-center font-semibold text-gray-900">
                        {entry.submitted}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`inline-flex items-center justify-center px-2 py-0.5 rounded text-xs font-bold ${
                            pct >= 95
                              ? 'text-green-700 bg-green-50'
                              : pct >= 75
                              ? 'text-orange-700 bg-orange-50'
                              : entry.target === 0
                              ? 'text-gray-500 bg-gray-50'
                              : 'text-red-700 bg-red-50'
                          }`}
                        >
                          {entry.target === 0 ? '—' : `${pct.toFixed(1)}%`}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden min-w-[80px]">
                          <div
                            className={`h-full rounded-full transition-all duration-300 ${barColor}`}
                            style={{ width: `${Math.min(pct, 100)}%` }}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>

              <tfoot className="bg-gray-100 font-bold sticky bottom-0">
                <tr>
                  <td className="px-4 py-3 text-gray-900">Total</td>
                  <td className="px-4 py-3 text-center text-gray-900">{monthlyTileData.target}</td>
                  <td className="px-4 py-3 text-center text-gray-900">{monthlyTileData.submitted}</td>
                  <td className="px-4 py-3 text-center">
                    <span
                      className={`inline-flex items-center justify-center px-2 py-0.5 rounded text-xs font-bold ${
                        monthlyTileData.pct >= 95
                          ? 'text-green-700 bg-green-100'
                          : monthlyTileData.pct >= 75
                          ? 'text-orange-700 bg-orange-100'
                          : monthlyTileData.target === 0
                          ? 'text-gray-500 bg-gray-100'
                          : 'text-red-700 bg-red-100'
                      }`}
                    >
                      {monthlyTileData.target === 0 ? '—' : `${monthlyTileData.pct.toFixed(1)}%`}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="w-full h-2 bg-gray-300 rounded-full overflow-hidden min-w-[80px]">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${
                          monthlyTileData.pct >= 95
                            ? 'bg-green-500'
                            : monthlyTileData.pct >= 75
                            ? 'bg-orange-500'
                            : 'bg-red-500'
                        }`}
                        style={{ width: `${Math.min(monthlyTileData.pct, 100)}%` }}
                      />
                    </div>
                  </td>
                </tr>
              </tfoot>
            </table>

            <div className="px-4 py-3 border-t border-gray-100 bg-gray-50 text-xs text-gray-500">
              Showing data for <span className="font-semibold text-gray-700">{monthlyTileData.monthName}</span>.
              Change the month using the dashboard month selector.
            </div>
          </div>
        )}
      </div>
    </div>
  );
};