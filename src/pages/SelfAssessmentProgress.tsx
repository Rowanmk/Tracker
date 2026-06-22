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

function calcMonthlyRunRatePercent(
  submitted: number,
  target: number,
  monthNum: number,
  financialYear: FinancialYear
): number | null {
  if (target <= 0) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const year = monthNum >= 4 ? financialYear.end : financialYear.end + 1;
  const monthStart = new Date(year, monthNum - 1, 1);
  const monthEnd = new Date(year, monthNum, 0);
  const effectiveMonthStart = monthNum === 4 ? new Date(year, 3, 6) : monthStart;

  if (today > monthEnd) {
    return (submitted / target) * 100;
  }

  if (today < effectiveMonthStart) {
    return null;
  }

  const totalDaysInMonth = monthEnd.getDate() - effectiveMonthStart.getDate() + 1;
  const daysElapsed = today.getDate() - effectiveMonthStart.getDate() + 1;
  const fraction = Math.max(0, Math.min(1, daysElapsed / totalDaysInMonth));
  const expectedByToday = target * fraction;

  if (expectedByToday <= 0) return null;
  return (submitted / expectedByToday) * 100;
}

function getRunRateColor(pct: number): string {
  if (pct >= 95) return 'text-green-700 bg-green-50';
  if (pct >= 75) return 'text-orange-700 bg-orange-50';
  return 'text-red-700 bg-red-50';
}

function getPctBadgeColor(pct: number, target: number): string {
  if (target === 0) return 'text-gray-500 bg-gray-50';
  if (pct >= 95) return 'text-green-700 bg-green-50';
  if (pct >= 75) return 'text-orange-700 bg-orange-50';
  return 'text-red-700 bg-red-50';
}

function getProgressBarColor(runRatePct: number | null, completionPct: number): string {
  const pct = runRatePct !== null ? runRatePct : completionPct;
  if (pct >= 95) return 'bg-green-500';
  if (pct >= 75) return 'bg-orange-500';
  return 'bg-red-500';
}

function getCompletionPercent(submitted: number, target: number): number {
  return target > 0 ? (submitted / target) * 100 : 0;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export const SelfAssessmentProgress: React.FC = () => {
  const { selectedFinancialYear, selectedMonth } = useDate();
  const { allStaff, teams, loading: authLoading } = useAuth();
  const { services, loading: servicesLoading } = useServices();

  const [activeTeamId, setActiveTeamId] = useState&lt;number | null&gt;(null);
  const [selectedName, setSelectedName] = useState&lt;string | null&gt;(null);

  const defaultFinancialYear = useMemo(() =&gt; {
    const allYears = getFinancialYears();
    return allYears.find(fy =&gt; fy.start === 2025 &amp;&amp; fy.end === 2026) || allYears[1] || selectedFinancialYear;
  }, [selectedFinancialYear]);

  const [localFinancialYear, setLocalFinancialYear] = useState&lt;FinancialYear&gt;(defaultFinancialYear);

  const { teamProgress, loading, error } = useSelfAssessmentProgress(
    localFinancialYear,
    allStaff,
    teams,
    services
  );

  const [monthlyData, setMonthlyData] = useState&lt;
    Record&lt;number, Record&lt;number, { submitted: number; target: number }&gt;&gt;
  &gt;({});
  const [dailyActuals, setDailyActuals] = useState&lt;Record&lt;number, Record&lt;string, number&gt;&gt;&gt;({});
  const [loadingMonthly, setLoadingMonthly] = useState(false);

  React.useEffect(() =&gt; {
    const fetchMonthlyData = async () =&gt; {
      if (services.length === 0 || teamProgress.length === 0) return;

      setLoadingMonthly(true);

      try {
        const saService = services.find((s) =&gt; s.service_name === 'Self Assessments');

        if (!saService) {
          setMonthlyData({});
          setDailyActuals({});
          return;
        }

        const deliveryStartYear = localFinancialYear.end;
        const deliveryEndYear = localFinancialYear.end + 1;

        const deliveryStartIso = new Date(deliveryStartYear, 3, 1).toISOString().slice(0, 10);
        const deliveryEndIso = new Date(deliveryEndYear, 0, 31).toISOString().slice(0, 10);

        const staffIds = teamProgress.map((t) =&gt; t.team_id);

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

        const nextDailyActuals: Record&lt;number, Record&lt;string, number&gt;&gt; = {};
        (activities || []).forEach((a) =&gt; {
          if (a.staff_id == null || !a.date) return;
          if (!nextDailyActuals[a.staff_id]) nextDailyActuals[a.staff_id] = {};
          nextDailyActuals[a.staff_id][a.date] =
            (nextDailyActuals[a.staff_id][a.date] || 0) + (a.delivered_count || 0);
        });
        setDailyActuals(nextDailyActuals);

        const breakdown: Record&lt;number, Record&lt;number, { submitted: number; target: number }&gt;&gt; = {};

        teamProgress.forEach((staffEntry) =&gt; {
          breakdown[staffEntry.team_id] = {};
          getFinancialYearMonths().forEach((m) =&gt; {
            breakdown[staffEntry.team_id][m.number] = { submitted: 0, target: 0 };
          });
        });

        (activities || []).forEach((a) =&gt; {
          if (a.staff_id != null &amp;&amp; breakdown[a.staff_id]) {
            const dateObj = new Date(a.date);
            const m = dateObj.getMonth() + 1;
            const y = dateObj.getFullYear();
            const expectedYear = m &gt;= 4 ? deliveryStartYear : deliveryEndYear;
            if (y !== expectedYear) return;

            if (!breakdown[a.staff_id][m]) {
              breakdown[a.staff_id][m] = { submitted: 0, target: 0 };
            }
            breakdown[a.staff_id][m].submitted += a.delivered_count || 0;
          }
        });

        const dbTargets: Record&lt;number, Record&lt;number, number&gt;&gt; = {};
        (targets || []).forEach((t) =&gt; {
          if (t.staff_id != null) {
            const expectedYear = t.month &gt;= 4 ? deliveryStartYear : deliveryEndYear;
            if (t.year !== expectedYear) return;

            if (!dbTargets[t.staff_id]) dbTargets[t.staff_id] = {};
            dbTargets[t.staff_id][t.month] = (dbTargets[t.staff_id][t.month] || 0) + (t.target_value || 0);
          }
        });

        teamProgress.forEach((staffEntry) =&gt; {
          const staffId = staffEntry.team_id;
          getFinancialYearMonths().forEach((m) =&gt; {
            breakdown[staffId][m.number].target = dbTargets[staffId]?.[m.number] || 0;
          });
        });

        setMonthlyData(breakdown);
      } catch {
        setMonthlyData({});
        setDailyActuals({});
      } finally {
        setLoadingMonthly(false);
      }
    };

    fetchMonthlyData();
  }, [localFinancialYear, services, teamProgress]);

  const visibleTeams = useMemo(
    () =&gt; teamProgress.filter((t) =&gt; t.fullYearTarget &gt; 0 || t.submitted &gt; 0),
    [teamProgress]
  );

  const sortedVisibleTeams = useMemo(() =&gt; {
    return [...visibleTeams].sort((a, b) =&gt; {
      const percentA = getCompletionPercent(a.submitted, a.fullYearTarget);
      const percentB = getCompletionPercent(b.submitted, b.fullYearTarget);
      if (percentB !== percentA) {
        return percentB - percentA;
      }
      return a.name.localeCompare(b.name);
    });
  }, [visibleTeams]);

  const chartTeamProgress = useMemo(() =&gt; sortedVisibleTeams, [sortedVisibleTeams]);

  const totals = sortedVisibleTeams.reduce(
    (acc, t) =&gt; {
      acc.fullYearTarget += t.fullYearTarget;
      acc.submitted += t.submitted;
      acc.leftToDo += t.leftToDo;
      return acc;
    },
    { fullYearTarget: 0, submitted: 0, leftToDo: 0 }
  );

  const totalPercentAchieved =
    totals.fullYearTarget &gt; 0 ? (totals.submitted / totals.fullYearTarget) * 100 : 0;

  const totalRunRatePct = calcRunRatePercent(
    totals.submitted,
    totals.fullYearTarget,
    localFinancialYear,
    'total',
    monthlyData
  );

  const monthlyTileData = useMemo(() =&gt; {
    if (!monthlyData || Object.keys(monthlyData).length === 0) return null;

    const monthSubmitted = sortedVisibleTeams.reduce((sum, entry) =&gt; {
      return sum + (monthlyData[entry.team_id]?.[selectedMonth]?.submitted || 0);
    }, 0);

    const monthTarget = sortedVisibleTeams.reduce((sum, entry) =&gt; {
      return sum + (monthlyData[entry.team_id]?.[selectedMonth]?.target || 0);
    }, 0);

    const monthPct = monthTarget &gt; 0 ? (monthSubmitted / monthTarget) * 100 : 0;

    const perAccountantRaw = sortedVisibleTeams.map(entry =&gt; ({
      name: entry.name,
      team_id: entry.team_id,
      submitted: monthlyData[entry.team_id]?.[selectedMonth]?.submitted || 0,
      target: monthlyData[entry.team_id]?.[selectedMonth]?.target || 0,
    })).filter(e =&gt; e.submitted &gt; 0 || e.target &gt; 0);

    const perAccountant = [...perAccountantRaw].sort((a, b) =&gt; {
      const pctA = getCompletionPercent(a.submitted, a.target);
      const pctB = getCompletionPercent(b.submitted, b.target);
      if (pctB !== pctA) {
        return pctB - pctA;
      }
      return a.name.localeCompare(b.name);
    });

    return {
      month: selectedMonth,
      monthName: MONTH_NAMES[selectedMonth - 1],
      submitted: monthSubmitted,
      target: monthTarget,
      pct: monthPct,
      perAccountant,
    };
  }, [monthlyData, selectedMonth, sortedVisibleTeams]);

  const chartMonthlyData = useMemo(() =&gt; {
    return monthlyData;
  }, [monthlyData]);

  const handleRowClick = (name: string) =&gt; {
    setSelectedName(prev =&gt; prev === name ? null : name);
    const entry = visibleTeams.find(t =&gt; t.name === name);
    if (entry) {
      setActiveTeamId(prev =&gt; prev === entry.team_id ? null : entry.team_id);
    }
  };

  if (loading || authLoading || servicesLoading) {
    return &lt;div className="py-6 text-center text-gray-500"&gt;Loading…&lt;/div&gt;;
  }

  if (error) {
    return (
      &lt;div className="p-4 bg-red-50 border border-red-200 rounded-md"&gt;
        ⚠️ {error}
      &lt;/div&gt;
    );
  }

  return (
    &lt;div className="max-w-[1600px] mx-auto px-6 space-y-6"&gt;
      &lt;div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4 page-header"&gt;
        &lt;div&gt;
          &lt;h2 className="page-title"&gt;Self Assessment Progress&lt;/h2&gt;
          &lt;p className="page-subtitle"&gt;
            Tax year to April {localFinancialYear.end}
          &lt;/p&gt;
        &lt;/div&gt;
        &lt;div className="w-full lg:w-48"&gt;
          &lt;FinancialYearSelector
            selectedFinancialYear={localFinancialYear}
            onFinancialYearChange={setLocalFinancialYear}
          /&gt;
        &lt;/div&gt;
      &lt;/div&gt;

      &lt;div className="grid grid-cols-1 xl:grid-cols-2 gap-6"&gt;

        {/* Monthly tile */}
        &lt;div className="bg-white rounded-xl shadow-md border tile-brand overflow-hidden flex flex-col"&gt;
          &lt;div className="tile-header px-4 py-1.5 flex items-center justify-between"&gt;
            &lt;span&gt;Self Assessment Data — {monthlyTileData?.monthName ?? MONTH_NAMES[selectedMonth - 1]}&lt;/span&gt;
            &lt;span className="text-white/70 text-xs font-normal"&gt;
              Linked to dashboard month
            &lt;/span&gt;
          &lt;/div&gt;

          {loadingMonthly ? (
            &lt;div className="flex-1 flex items-center justify-center text-gray-500 text-sm py-10"&gt;
              Loading monthly data…
            &lt;/div&gt;
          ) : !monthlyTileData || (monthlyTileData.submitted === 0 &amp;&amp; monthlyTileData.target === 0) ? (
            &lt;div className="flex-1 flex items-center justify-center text-gray-500 text-sm py-10 px-6 text-center"&gt;
              No Self Assessment data recorded for {MONTH_NAMES[selectedMonth - 1]}.
            &lt;/div&gt;
          ) : (
            &lt;&gt;
              &lt;div className="flex-1 overflow-auto"&gt;
                &lt;table className="w-full divide-y"&gt;
                  &lt;thead className="bg-gray-50 sticky top-0 z-10"&gt;
                    &lt;tr&gt;
                      &lt;th className="px-4 py-3 text-left text-xs font-bold uppercase"&gt;Accountant&lt;/th&gt;
                      &lt;th className="px-4 py-3 text-center text-xs font-bold uppercase"&gt;Target&lt;/th&gt;
                      &lt;th className="px-4 py-3 text-center text-xs font-bold uppercase"&gt;Submitted&lt;/th&gt;
                      &lt;th className="px-4 py-3 text-center text-xs font-bold uppercase"&gt;% Complete&lt;/th&gt;
                      &lt;th className="px-4 py-3 text-left text-xs font-bold uppercase"&gt;Progress&lt;/th&gt;
                      &lt;th className="px-4 py-3 text-center text-xs font-bold uppercase leading-tight"&gt;
                        Run Rate %
                        &lt;div className="text-[9px] font-normal text-gray-400 normal-case tracking-normal mt-0.5"&gt;
                          vs today's expected
                        &lt;/div&gt;
                      &lt;/th&gt;
                    &lt;/tr&gt;
                  &lt;/thead&gt;

                  &lt;tbody&gt;
                    {monthlyTileData.perAccountant.map((entry, idx) =&gt; {
                      const pct = getCompletionPercent(entry.submitted, entry.target);
                      const isSelected = selectedName === entry.name;
                      const runRatePct = calcMonthlyRunRatePercent(
                        entry.submitted,
                        entry.target,
                        selectedMonth,
                        localFinancialYear
                      );
                      const progressBarColor = getProgressBarColor(runRatePct, pct);

                      return (
                        &lt;tr
                          key={entry.name}
                          onClick={() =&gt; handleRowClick(entry.name)}
                          className={`cursor-pointer transition-colors ${
                            isSelected
                              ? 'bg-blue-100 ring-1 ring-inset ring-blue-400'
                              : idx % 2 === 0 ? 'bg-white hover:bg-gray-50' : 'bg-gray-50/50 hover:bg-gray-100'
                          }`}
                        &gt;
                          &lt;td className="px-4 py-3 font-medium text-gray-900"&gt;{entry.name}&lt;/td&gt;
                          &lt;td className="px-4 py-3 text-center font-semibold text-gray-700"&gt;
                            {entry.target}
                          &lt;/td&gt;
                          &lt;td className="px-4 py-3 text-center font-semibold text-gray-900"&gt;
                            {entry.submitted}
                          &lt;/td&gt;
                          &lt;td className="px-4 py-3 text-center"&gt;
                            &lt;span
                              className={`inline-flex items-center justify-center px-2 py-0.5 rounded text-xs font-bold ${getPctBadgeColor(pct, entry.target)}`}
                            &gt;
                              {entry.target === 0 ? '—' : `${pct.toFixed(1)}%`}
                            &lt;/span&gt;
                          &lt;/td&gt;
                          &lt;td className="px-4 py-3"&gt;
                            &lt;div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden min-w-[80px]"&gt;
                              &lt;div
                                className={`h-full rounded-full transition-all duration-300 ${progressBarColor}`}
                                style={{ width: `${Math.min(pct, 100)}%` }}
                              /&gt;
                            &lt;/div&gt;
                          &lt;/td&gt;
                          &lt;td className="px-4 py-3 text-center"&gt;
                            {runRatePct === null ? (
                              &lt;span className="text-xs text-gray-400"&gt;—&lt;/span&gt;
                            ) : (
                              &lt;span
                                className={`inline-flex items-center justify-center px-2 py-0.5 rounded text-xs font-bold ${getRunRateColor(runRatePct)}`}
                              &gt;
                                {Math.round(runRatePct)}%
                              &lt;/span&gt;
                            )}
                          &lt;/td&gt;
                        &lt;/tr&gt;
                      );
                    })}
                  &lt;/tbody&gt;

                  &lt;tfoot className="bg-gray-100 font-bold sticky bottom-0"&gt;
                    &lt;tr&gt;
                      &lt;td className="px-4 py-3 text-gray-900"&gt;Total&lt;/td&gt;
                      &lt;td className="px-4 py-3 text-center text-gray-900"&gt;{monthlyTileData.target}&lt;/td&gt;
                      &lt;td className="px-4 py-3 text-center text-gray-900"&gt;{monthlyTileData.submitted}&lt;/td&gt;
                      &lt;td className="px-4 py-3 text-center"&gt;
                        &lt;span
                          className={`inline-flex items-center justify-center px-2 py-0.5 rounded text-xs font-bold ${getPctBadgeColor(monthlyTileData.pct, monthlyTileData.target)}`}
                        &gt;
                          {monthlyTileData.target === 0 ? '—' : `${monthlyTileData.pct.toFixed(1)}%`}
                        &lt;/span&gt;
                      &lt;/td&gt;
                      &lt;td className="px-4 py-3"&gt;
                        &lt;div className="w-full h-2 bg-gray-300 rounded-full overflow-hidden min-w-[80px]"&gt;
                          &lt;div
                            className={`h-full rounded-full transition-all duration-300 ${getProgressBarColor(
                              calcMonthlyRunRatePercent(
                                monthlyTileData.submitted,
                                monthlyTileData.target,
                                selectedMonth,
                                localFinancialYear
                              ),
                              monthlyTileData.pct
                            )}`}
                            style={{ width: `${Math.min(monthlyTileData.pct, 100)}%` }}
                          /&gt;
                        &lt;/div&gt;
                      &lt;/td&gt;
                      &lt;td className="px-4 py-3 text-center"&gt;
                        {(() =&gt; {
                          const totalRunRatePct = calcMonthlyRunRatePercent(
                            monthlyTileData.submitted,
                            monthlyTileData.target,
                            selectedMonth,
                            localFinancialYear
                          );
                          return totalRunRatePct === null ? (
                            &lt;span className="text-xs text-gray-400"&gt;—&lt;/span&gt;
                          ) : (
                            &lt;span
                              className={`inline-flex items-center justify-center px-2 py-0.5 rounded text-xs font-bold ${getRunRateColor(totalRunRatePct)}`}
                            &gt;
                              {Math.round(totalRunRatePct)}%
                            &lt;/span&gt;
                          );
                        })()}
                      &lt;/td&gt;
                    &lt;/tr&gt;
                  &lt;/tfoot&gt;
                &lt;/table&gt;
              &lt;/div&gt;

              &lt;div className="px-4 py-3 border-t border-gray-100 bg-gray-50 text-xs text-gray-500"&gt;
                Showing &lt;span className="font-semibold text-gray-700"&gt;{monthlyTileData.monthName}&lt;/span&gt;.
                Change month using the dashboard month selector.
              &lt;/div&gt;
            &lt;/&gt;
          )}
        &lt;/div&gt;

        {/* Full-year tile */}
        &lt;div className="bg-white rounded-xl shadow-md border tile-brand overflow-hidden flex flex-col"&gt;
          &lt;div className="tile-header px-4 py-1.5"&gt;Self Assessment Data — Full Year&lt;/div&gt;

          &lt;div className="flex-1 overflow-auto"&gt;
            &lt;table className="w-full divide-y"&gt;
              &lt;thead className="bg-gray-50 sticky top-0 z-10"&gt;
                &lt;tr&gt;
                  &lt;th className="px-4 py-3 text-left text-xs font-bold uppercase"&gt;Accountant&lt;/th&gt;
                  &lt;th className="px-4 py-3 text-center text-xs font-bold uppercase"&gt;Target&lt;/th&gt;
                  &lt;th className="px-4 py-3 text-center text-xs font-bold uppercase"&gt;Submitted&lt;/th&gt;
                  &lt;th className="px-4 py-3 text-center text-xs font-bold uppercase"&gt;% Complete&lt;/th&gt;
                  &lt;th className="px-4 py-3 text-left text-xs font-bold uppercase"&gt;Progress&lt;/th&gt;
                  &lt;th className="px-4 py-3 text-center text-xs font-bold uppercase leading-tight"&gt;
                    Run Rate %
                    &lt;div className="text-[9px] font-normal text-gray-400 normal-case tracking-normal mt-0.5"&gt;
                      vs today's expected
                    &lt;/div&gt;
                  &lt;/th&gt;
                &lt;/tr&gt;
              &lt;/thead&gt;

              &lt;tbody&gt;
                {sortedVisibleTeams.map((entry, idx) =&gt; {
                  const pct = getCompletionPercent(entry.submitted, entry.fullYearTarget);

                  const runRatePct = calcRunRatePercent(
                    entry.submitted,
                    entry.fullYearTarget,
                    localFinancialYear,
                    entry.team_id,
                    monthlyData
                  );

                  const progressBarColor = getProgressBarColor(runRatePct, pct);
                  const isSelected = selectedName === entry.name;

                  return (
                    &lt;tr
                      key={entry.team_id}
                      onClick={() =&gt; handleRowClick(entry.name)}
                      className={`cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-blue-100 ring-1 ring-inset ring-blue-400'
                          : idx % 2 === 0 ? 'bg-white hover:bg-gray-50' : 'bg-gray-50/50 hover:bg-gray-100'
                      }`}
                    &gt;
                      &lt;td className="px-4 py-3 font-medium text-gray-900"&gt;{entry.name}&lt;/td&gt;
                      &lt;td className="px-4 py-3 text-center font-semibold text-gray-700"&gt;{entry.fullYearTarget}&lt;/td&gt;
                      &lt;td className="px-4 py-3 text-center font-semibold text-gray-900"&gt;{entry.submitted}&lt;/td&gt;
                      &lt;td className="px-4 py-3 text-center"&gt;
                        &lt;span
                          className={`inline-flex items-center justify-center px-2 py-0.5 rounded text-xs font-bold ${getPctBadgeColor(pct, entry.fullYearTarget)}`}
                        &gt;
                          {entry.fullYearTarget === 0 ? '—' : `${pct.toFixed(1)}%`}
                        &lt;/span&gt;
                      &lt;/td&gt;
                      &lt;td className="px-4 py-3"&gt;
                        &lt;div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden min-w-[80px]"&gt;
                          &lt;div
                            className={`h-full rounded-full transition-all duration-300 ${progressBarColor}`}
                            style={{ width: `${Math.min(pct, 100)}%` }}
                          /&gt;
                        &lt;/div&gt;
                      &lt;/td&gt;
                      &lt;td className="px-4 py-3 text-center"&gt;
                        {runRatePct === null ? (
                          &lt;span className="text-xs text-gray-400"&gt;—&lt;/span&gt;
                        ) : (
                          &lt;span
                            className={`inline-flex items-center justify-center px-2 py-0.5 rounded text-xs font-bold ${getRunRateColor(runRatePct)}`}
                          &gt;
                            {Math.round(runRatePct)}%
                          &lt;/span&gt;
                        )}
                      &lt;/td&gt;
                    &lt;/tr&gt;
                  );
                })}
              &lt;/tbody&gt;

              &lt;tfoot className="bg-gray-100 font-bold sticky bottom-0"&gt;
                &lt;tr&gt;
                  &lt;td className="px-4 py-3 text-gray-900"&gt;Total&lt;/td&gt;
                  &lt;td className="px-4 py-3 text-center text-gray-900"&gt;{totals.fullYearTarget}&lt;/td&gt;
                  &lt;td className="px-4 py-3 text-center text-gray-900"&gt;{totals.submitted}&lt;/td&gt;
                  &lt;td className="px-4 py-3 text-center"&gt;
                    &lt;span
                      className={`inline-flex items-center justify-center px-2 py-0.5 rounded text-xs font-bold ${getPctBadgeColor(totalPercentAchieved, totals.fullYearTarget)}`}
                    &gt;
                      {totals.fullYearTarget === 0 ? '—' : `${totalPercentAchieved.toFixed(1)}%`}
                    &lt;/span&gt;
                  &lt;/td&gt;
                  &lt;td className="px-4 py-3"&gt;
                    &lt;div className="w-full h-2 bg-gray-300 rounded-full overflow-hidden min-w-[80px]"&gt;
                      &lt;div
                        className={`h-full rounded-full transition-all duration-300 ${getProgressBarColor(totalRunRatePct, totalPercentAchieved)}`}
                        style={{ width: `${Math.min(totalPercentAchieved, 100)}%` }}
                      /&gt;
                    &lt;/div&gt;
                  &lt;/td&gt;
                  &lt;td className="px-4 py-3 text-center"&gt;
                    {totalRunRatePct === null ? (
                      &lt;span className="text-xs text-gray-400"&gt;—&lt;/span&gt;
                    ) : (
                      &lt;span
                        className={`inline-flex items-center justify-center px-2 py-0.5 rounded text-xs font-bold ${getRunRateColor(totalRunRatePct)}`}
                      &gt;
                        {Math.round(totalRunRatePct)}%
                      &lt;/span&gt;
                    )}
                  &lt;/td&gt;
                &lt;/tr&gt;
              &lt;/tfoot&gt;
            &lt;/table&gt;
          &lt;/div&gt;

          &lt;div className="px-4 py-3 border-t border-gray-100 bg-gray-50 flex flex-wrap gap-3 text-xs text-gray-500"&gt;
            &lt;span className="font-semibold text-gray-600"&gt;Progress bar colour key:&lt;/span&gt;
            &lt;span className="inline-flex items-center gap-1"&gt;
              &lt;span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block"&gt;&lt;/span&gt;
              ≥95% run rate — on or ahead
            &lt;/span&gt;
            &lt;span className="inline-flex items-center gap-1"&gt;
              &lt;span className="w-2.5 h-2.5 rounded-full bg-orange-500 inline-block"&gt;&lt;/span&gt;
              75–94% — slightly behind
            &lt;/span&gt;
            &lt;span className="inline-flex items-center gap-1"&gt;
              &lt;span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block"&gt;&lt;/span&gt;
              &amp;lt;75% — significantly behind
            &lt;/span&gt;
            &lt;span className="ml-auto text-gray-400 italic"&gt;Click a row to highlight across both tiles&lt;/span&gt;
          &lt;/div&gt;
        &lt;/div&gt;
      &lt;/div&gt;

      &lt;div className="bg-white rounded-xl shadow-md border tile-brand overflow-hidden flex flex-col"&gt;
        &lt;div className="tile-header px-4 py-1.5"&gt;Overall Progress Chart&lt;/div&gt;

        &lt;div className="flex-1 p-4" style={{ minHeight: '420px' }}&gt;
          {loadingMonthly ? (
            &lt;div className="h-full flex items-center justify-center text-gray-500"&gt;
              Loading chart data…
            &lt;/div&gt;
          ) : (
            &lt;SelfAssessmentProgressChart
              teamProgress={chartTeamProgress}
              financialYear={localFinancialYear}
              monthlyData={chartMonthlyData}
              dailyActuals={dailyActuals}
              activeTeamId={activeTeamId}
              onActiveTeamChange={(id) =&gt; {
                setActiveTeamId(id);
                if (id === null) {
                  setSelectedName(null);
                } else {
                  const entry = visibleTeams.find(t =&gt; t.team_id === id);
                  setSelectedName(entry?.name ?? null);
                }
              }}
            /&gt;
          )}
        &lt;/div&gt;
      &lt;/div&gt;
    &lt;/div&gt;
  );
};