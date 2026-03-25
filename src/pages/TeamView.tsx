import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useServices } from '../hooks/useServices';
import { supabase } from '../supabase/client';
import { generateBagelDays } from '../utils/bagelDays';

interface MonthlyData {
  year: number;
  month: number;
  actual: number;
  rollingAverage: number;
}

interface ServiceStats {
  service: {
    service_id: number;
    service_name: string;
  };
  data: MonthlyData[];
  isPercentage?: boolean;
}

interface AccountantRankingRow {
  staff_id: number;
  name: string;
  rollingAverage: number;
}

type ActivityRow = {
  staff_id: number | null;
  service_id: number | null;
  date: string;
  delivered_count: number;
};

type TargetRow = {
  staff_id: number | null;
  month: number;
  year: number;
  target_value: number;
};

type BankHolidayRow = {
  date: string;
  region: string;
};

type StaffForBagels = {
  staff_id: number;
  home_region?: string | null;
};

const isAccountant = (role: string) => {
  const normalizedRole = (role || '').toLowerCase();
  return normalizedRole === 'staff' || normalizedRole === 'admin';
};

const getMonthKey = (year: number, month: number) => `${year}-${month}`;

const getLastTwelveAverage = (values: number[]) => {
  if (values.length < 12) return 0;
  const lastTwelve = values.slice(values.length - 12);
  const sum = lastTwelve.reduce((total, value) => total + value, 0);
  return sum / 12;
};

const getLastTwelvePercent = (
  months: Array<{ year: number; month: number }>,
  actualMap: Record<string, number>,
  targetMap: Record<string, number>
) => {
  if (months.length < 12) return 0;

  const lastTwelve = months.slice(months.length - 12);
  const actualSum = lastTwelve.reduce(
    (total, month) => total + (actualMap[getMonthKey(month.year, month.month)] || 0),
    0
  );
  const targetSum = lastTwelve.reduce(
    (total, month) => total + (targetMap[getMonthKey(month.year, month.month)] || 0),
    0
  );

  return targetSum > 0 ? (actualSum / targetSum) * 100 : 0;
};

const buildPerStaffBagelMonthTotals = (
  rawActivities: ActivityRow[],
  allMonths: Array<{ year: number; month: number }>,
  bankHolidays: BankHolidayRow[],
  staffList: StaffForBagels[],
  bagelServiceId: number,
  startDate: Date,
  endDate: Date
) => {
  const generatedBagels = generateBagelDays(
    rawActivities,
    bankHolidays,
    staffList,
    bagelServiceId,
    startDate,
    endDate
  ) as ActivityRow[];

  const monthlyByStaff = new Map<number, Record<string, number>>();

  staffList.forEach((staff) => {
    const monthTotals: Record<string, number> = {};
    allMonths.forEach(({ year, month }) => {
      monthTotals[getMonthKey(year, month)] = 0;
    });
    monthlyByStaff.set(staff.staff_id, monthTotals);
  });

  generatedBagels.forEach((activity) => {
    if (!activity.date || activity.staff_id == null) return;
    const [yearStr, monthStr] = activity.date.split('-');
    const monthKey = getMonthKey(parseInt(yearStr, 10), parseInt(monthStr, 10));
    const current = monthlyByStaff.get(activity.staff_id);
    if (!current) return;
    current[monthKey] = (current[monthKey] || 0) + (activity.delivered_count || 0);
  });

  return monthlyByStaff;
};

export const TeamView: React.FC = () => {
  const { allStaff, selectedTeamId, loading: authLoading } = useAuth();
  const { services, loading: servicesLoading } = useServices();

  const [statsData, setStatsData] = useState<ServiceStats[]>([]);
  const [activeServiceId, setActiveServiceId] = useState<number | null>(null);
  const [accountantRankings, setAccountantRankings] = useState<AccountantRankingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isTeamViewMode = selectedTeamId === 'team-view' || selectedTeamId === 'all' || !selectedTeamId;
  const selectedStaffId = !isTeamViewMode ? Number(selectedTeamId) : null;

  useEffect(() => {
    const fetchStatsData = async () => {
      if (authLoading || servicesLoading) return;
      if (!allStaff.length || !services.length) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const today = new Date();
        const lastCompletedMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);

        const all24Months: Array<{ year: number; month: number }> = [];
        const startMonth = new Date(lastCompletedMonth.getFullYear(), lastCompletedMonth.getMonth() - 23, 1);

        const curr = new Date(startMonth);
        for (let i = 0; i < 24; i++) {
          all24Months.push({ year: curr.getFullYear(), month: curr.getMonth() + 1 });
          curr.setMonth(curr.getMonth() + 1);
        }

        const firstMonth = all24Months[0];
        const lastMonth = all24Months[23];

        const startDateStr = `${firstMonth.year}-${String(firstMonth.month).padStart(2, '0')}-01`;
        const lastDayOfLastMonth = new Date(lastMonth.year, lastMonth.month, 0).getDate();
        const endDateStr = `${lastMonth.year}-${String(lastMonth.month).padStart(2, '0')}-${String(lastDayOfLastMonth).padStart(2, '0')}`;

        const visibleAccountants = allStaff.filter((s) => !s.is_hidden && isAccountant(s.role));

        const filteredStaff =
          selectedTeamId === 'team-view' || selectedTeamId === 'all' || !selectedTeamId
            ? visibleAccountants
            : visibleAccountants.filter((s) => String(s.staff_id) === selectedTeamId);

        const staffIds = filteredStaff.map((s) => s.staff_id);
        const allVisibleAccountantIds = visibleAccountants.map((s) => s.staff_id);

        if (staffIds.length === 0) {
          setStatsData([]);
          setAccountantRankings([]);
          setLoading(false);
          return;
        }

        const { data: activities, error: fetchError } = await supabase
          .from('dailyactivity')
          .select('staff_id, service_id, date, delivered_count')
          .in('staff_id', staffIds)
          .gte('date', startDateStr)
          .lte('date', endDateStr);

        if (fetchError) throw fetchError;

        const { data: rankingActivities, error: rankingFetchError } = await supabase
          .from('dailyactivity')
          .select('staff_id, service_id, date, delivered_count')
          .in('staff_id', allVisibleAccountantIds)
          .gte('date', startDateStr)
          .lte('date', endDateStr);

        if (rankingFetchError) throw rankingFetchError;

        const { data: targets, error: targetsError } = await supabase
          .from('monthlytargets')
          .select('staff_id, month, year, target_value')
          .in('staff_id', staffIds)
          .gte('year', firstMonth.year)
          .lte('year', lastMonth.year);

        if (targetsError) throw targetsError;

        const { data: allTargets, error: allTargetsError } = await supabase
          .from('monthlytargets')
          .select('staff_id, month, year, target_value')
          .in('staff_id', allVisibleAccountantIds)
          .gte('year', firstMonth.year)
          .lte('year', lastMonth.year);

        if (allTargetsError) throw allTargetsError;

        const { data: bankHolidays } = await supabase
          .from('bank_holidays')
          .select('date, region')
          .gte('date', startDateStr)
          .lte('date', endDateStr);

        let finalActivities: ActivityRow[] = (activities || []) as ActivityRow[];
        let finalRankingActivities: ActivityRow[] = (rankingActivities || []) as ActivityRow[];
        const rawRankingActivities: ActivityRow[] = (rankingActivities || []) as ActivityRow[];
        const bagelService = services.find((s) => s.service_name === 'Bagel Days');

        const [sYear, sMonth, sDay] = startDateStr.split('-').map(Number);
        const localStartDate = new Date(sYear, sMonth - 1, sDay);

        const [eYear, eMonth, eDay] = endDateStr.split('-').map(Number);
        const localEndDate = new Date(eYear, eMonth - 1, eDay);

        if (bagelService && bankHolidays) {
          const bagels = generateBagelDays(
            finalActivities,
            bankHolidays,
            filteredStaff,
            bagelService.service_id,
            localStartDate,
            localEndDate
          ) as ActivityRow[];
          finalActivities = [...finalActivities, ...bagels];

          const rankingBagels = generateBagelDays(
            finalRankingActivities,
            bankHolidays,
            visibleAccountants,
            bagelService.service_id,
            localStartDate,
            localEndDate
          ) as ActivityRow[];
          finalRankingActivities = [...finalRankingActivities, ...rankingBagels];
        }

        const displayServices = services;
        const monthActuals: Record<string, number> = {};
        const monthTargets: Record<string, number> = {};

        (targets as TargetRow[] | null)?.forEach((target) => {
          const key = getMonthKey(target.year, target.month);
          monthTargets[key] = (monthTargets[key] || 0) + (target.target_value || 0);
        });

        finalActivities.forEach((activity) => {
          if (!activity.date || activity.service_id == null) return;
          const service = services.find((s) => s.service_id === activity.service_id);
          if (!service || service.service_name === 'Bagel Days') return;

          const [yearStr, monthStr] = activity.date.split('-');
          const key = getMonthKey(parseInt(yearStr, 10), parseInt(monthStr, 10));
          monthActuals[key] = (monthActuals[key] || 0) + (activity.delivered_count || 0);
        });

        const processedStats: ServiceStats[] = displayServices.map((service) => {
          const serviceMonthTotals: Record<string, number> = {};

          if (service.service_name === 'Bagel Days') {
            const bagelUsersByDate = new Map<string, Set<number>>();
            finalActivities.forEach((activity) => {
              if (
                activity.service_id !== service.service_id ||
                !activity.date ||
                activity.staff_id == null
              ) {
                return;
              }

              if (!bagelUsersByDate.has(activity.date)) {
                bagelUsersByDate.set(activity.date, new Set<number>());
              }

              bagelUsersByDate.get(activity.date)?.add(activity.staff_id);
            });

            const fullSelectedStaffCount = filteredStaff.length;

            all24Months.forEach(({ year, month }) => {
              const daysInMonth = new Date(year, month, 0).getDate();
              let monthBagelDays = 0;

              for (let day = 1; day <= daysInMonth; day++) {
                const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const bagelUsersForDate = bagelUsersByDate.get(dateStr);

                if (bagelUsersForDate && bagelUsersForDate.size === fullSelectedStaffCount) {
                  monthBagelDays += 1;
                }
              }

              serviceMonthTotals[getMonthKey(year, month)] = monthBagelDays;
            });
          } else {
            finalActivities.forEach((activity) => {
              if (!activity.date || activity.service_id !== service.service_id) return;

              const [yearStr, monthStr] = activity.date.split('-');
              const key = getMonthKey(parseInt(yearStr, 10), parseInt(monthStr, 10));
              serviceMonthTotals[key] = (serviceMonthTotals[key] || 0) + (activity.delivered_count || 0);
            });
          }

          const monthlyActuals = all24Months.map((month) => serviceMonthTotals[getMonthKey(month.year, month.month)] || 0);

          const last12Data: MonthlyData[] = [];
          for (let i = 12; i < 24; i++) {
            const actual = monthlyActuals[i];
            const rollingAverage = monthlyActuals.slice(i - 11, i + 1).reduce((sum, value) => sum + value, 0) / 12;

            last12Data.push({
              year: all24Months[i].year,
              month: all24Months[i].month,
              actual,
              rollingAverage,
            });
          }

          return {
            service,
            data: last12Data,
          };
        });

        const percentData: MonthlyData[] = [];

        for (let i = 12; i < 24; i++) {
          const currentMonth = all24Months[i];
          const currentKey = getMonthKey(currentMonth.year, currentMonth.month);
          const currentActual = monthActuals[currentKey] || 0;
          const currentTarget = monthTargets[currentKey] || 0;
          const actualPercent = currentTarget > 0 ? (currentActual / currentTarget) * 100 : 0;

          const rollingMonths = all24Months.slice(i - 11, i + 1);
          const rollingActualSum = rollingMonths.reduce(
            (sum, month) => sum + (monthActuals[getMonthKey(month.year, month.month)] || 0),
            0
          );
          const rollingTargetSum = rollingMonths.reduce(
            (sum, month) => sum + (monthTargets[getMonthKey(month.year, month.month)] || 0),
            0
          );
          const rollingAverage = rollingTargetSum > 0 ? (rollingActualSum / rollingTargetSum) * 100 : 0;

          percentData.push({
            year: currentMonth.year,
            month: currentMonth.month,
            actual: actualPercent,
            rollingAverage,
          });
        }

        processedStats.push({
          service: {
            service_id: -1,
            service_name: '% of Target Achieved',
          },
          data: percentData,
          isPercentage: true,
        });

        const resolvedActiveMetricId =
          activeServiceId && processedStats.some((stat) => stat.service.service_id === activeServiceId)
            ? activeServiceId
            : processedStats[0]?.service.service_id ?? null;

        const perStaffBagelMonthTotals =
          bagelService && bankHolidays
            ? buildPerStaffBagelMonthTotals(
                rawRankingActivities,
                all24Months,
                bankHolidays as BankHolidayRow[],
                visibleAccountants,
                bagelService.service_id,
                localStartDate,
                localEndDate
              )
            : new Map<number, Record<string, number>>();

        const rankingRows: AccountantRankingRow[] = visibleAccountants
          .map((staffMember) => {
            const monthlyAllActuals: Record<string, number> = {};
            const monthlyTargetsByStaff: Record<string, number> = {};
            const monthlyActualsByServiceId: Record<number, Record<string, number>> = {};

            finalRankingActivities.forEach((activity) => {
              if (activity.staff_id !== staffMember.staff_id || !activity.date || activity.service_id == null) {
                return;
              }

              const [yearStr, monthStr] = activity.date.split('-');
              const monthKey = getMonthKey(parseInt(yearStr, 10), parseInt(monthStr, 10));
              const service = services.find((item) => item.service_id === activity.service_id);

              if (!service || service.service_name === 'Bagel Days') {
                return;
              }

              monthlyAllActuals[monthKey] = (monthlyAllActuals[monthKey] || 0) + (activity.delivered_count || 0);

              if (!monthlyActualsByServiceId[activity.service_id]) {
                monthlyActualsByServiceId[activity.service_id] = {};
              }

              monthlyActualsByServiceId[activity.service_id][monthKey] =
                (monthlyActualsByServiceId[activity.service_id][monthKey] || 0) + (activity.delivered_count || 0);
            });

            (allTargets as TargetRow[] | null)?.forEach((target) => {
              if (target.staff_id !== staffMember.staff_id) return;
              const key = getMonthKey(target.year, target.month);
              monthlyTargetsByStaff[key] = (monthlyTargetsByStaff[key] || 0) + (target.target_value || 0);
            });

            let rollingAverage = 0;

            if (resolvedActiveMetricId === -1) {
              rollingAverage = getLastTwelvePercent(all24Months, monthlyAllActuals, monthlyTargetsByStaff);
            } else {
              const activeService = services.find((service) => service.service_id === resolvedActiveMetricId);

              if (activeService?.service_name === 'Bagel Days') {
                const bagelTotalsForStaff = perStaffBagelMonthTotals.get(staffMember.staff_id) || {};
                const monthlySeries = all24Months.map(
                  (month) => bagelTotalsForStaff[getMonthKey(month.year, month.month)] || 0
                );
                rollingAverage = getLastTwelveAverage(monthlySeries);
              } else if (resolvedActiveMetricId != null) {
                const serviceMonthTotals = monthlyActualsByServiceId[resolvedActiveMetricId] || {};
                const monthlySeries = all24Months.map(
                  (month) => serviceMonthTotals[getMonthKey(month.year, month.month)] || 0
                );
                rollingAverage = getLastTwelveAverage(monthlySeries);
              }
            }

            return {
              staff_id: staffMember.staff_id,
              name: staffMember.name,
              rollingAverage,
            };
          })
          .sort((a, b) => b.rollingAverage - a.rollingAverage);

        setStatsData(processedStats);
        setAccountantRankings(rankingRows);
      } catch {
        setError('Failed to load Stats and Figures');
      } finally {
        setLoading(false);
      }
    };

    void fetchStatsData();
  }, [allStaff, services, selectedTeamId, authLoading, servicesLoading, activeServiceId]);

  useEffect(() => {
    if (statsData.length > 0) {
      if (!activeServiceId || !statsData.find((s) => s.service.service_id === activeServiceId)) {
        setActiveServiceId(statsData[0].service.service_id);
      }
    }
  }, [statsData, activeServiceId]);

  const activeStat = useMemo(
    () => statsData.find((s) => s.service.service_id === activeServiceId),
    [statsData, activeServiceId]
  );

  if (loading || authLoading || servicesLoading) {
    return <div className="py-6 text-center text-gray-500">Loading Stats and Figures…</div>;
  }

  if (error) {
    return <div className="p-4 bg-red-50 border border-red-200 text-red-800 rounded-md">{error}</div>;
  }

  return (
    <div className="space-y-6">
      <div className="page-header">
        <h2 className="page-title">Stats and Figures</h2>
        <p className="page-subtitle">12-month performance actuals and rolling averages</p>
      </div>

      {statsData.length === 0 ? (
        <div className="py-10 text-center text-gray-500 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
          No data available for the selected accountant.
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {statsData.map((stat) => {
              const latestMonth = stat.data[11];
              const isActive = activeServiceId === stat.service.service_id;

              return (
                <button
                  key={stat.service.service_id}
                  onClick={() => setActiveServiceId(stat.service.service_id)}
                  className={`p-5 rounded-xl border text-left transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#001B47] ${
                    isActive
                      ? 'bg-[#001B47] border-[#001B47] shadow-lg transform scale-[1.02] z-10'
                      : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-[#001B47] hover:shadow-md'
                  }`}
                >
                  <h3 className={`text-lg font-bold mb-2 truncate ${isActive ? 'text-white' : 'text-gray-900 dark:text-white'}`}>
                    {stat.service.service_name}
                  </h3>
                  <div className="flex items-end gap-2">
                    <span className={`text-3xl font-extrabold ${isActive ? 'text-[#FF8A2A]' : 'text-[#001B47] dark:text-blue-400'}`}>
                      {latestMonth.rollingAverage.toFixed(1)}{stat.isPercentage ? '%' : ''}
                    </span>
                    <span className={`text-xs font-semibold uppercase tracking-wider mb-1 ${isActive ? 'text-gray-300' : 'text-gray-500 dark:text-gray-400'}`}>
                      12m Avg
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          {activeStat && (
            <div className="grid grid-cols-1 xl:grid-cols-[60%_40%] gap-6 items-stretch">
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md border border-gray-200 dark:border-gray-700 p-6 transition-all duration-300 animate-fade-in">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
                  <div>
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                      {activeStat.service.service_name} Performance
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                      Monthly actuals vs 12-month rolling average
                    </p>
                    {activeStat.service.service_name === '% of Target Achieved' && (
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                        * Monthly bars: (Monthly Deliveries / Monthly Target). Line: (12-Month Deliveries Sum / 12-Month Target Sum).
                      </p>
                    )}
                    {activeStat.service.service_name === 'Bagel Days' && (
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                        * Bagel Days count working days where no selected user recorded any actuals on that day.
                      </p>
                    )}
                  </div>
                  <div className="bg-gray-50 dark:bg-gray-700/50 px-4 py-2 rounded-lg border border-gray-100 dark:border-gray-600 text-right">
                    <div className="text-xs text-gray-500 dark:text-gray-400 font-semibold uppercase tracking-wider">
                      Latest Month Actual
                    </div>
                    <div className="text-2xl font-bold text-[#001B47] dark:text-blue-400">
                      {activeStat.data[11].actual.toFixed(1).replace(/\.0$/, '')}{activeStat.isPercentage ? '%' : ''}
                    </div>
                  </div>
                </div>

                <div className="w-full h-[400px]">
                  <ServiceComboChart data={activeStat.data} isPercentage={activeStat.isPercentage} />
                </div>
              </div>

              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md border border-gray-200 dark:border-gray-700 p-6 transition-all duration-300 animate-fade-in">
                <div className="mb-6">
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                    Accountant Ranking
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    12-month rolling average at the end of last month
                  </p>
                </div>

                <div className="w-full h-[400px]">
                  <AccountantRankingChart
                    data={accountantRankings}
                    isPercentage={activeStat.isPercentage}
                    selectedStaffId={selectedStaffId}
                    isTeamViewMode={isTeamViewMode}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const ServiceComboChart = ({ data, isPercentage }: { data: MonthlyData[]; isPercentage?: boolean }) => {
  const VIEWBOX_WIDTH = 800;
  const VIEWBOX_HEIGHT = 320;
  const PADDING_TOP = 40;
  const PADDING_BOTTOM = 40;
  const PADDING_LEFT = 50;
  const PADDING_RIGHT = 20;

  const CHART_WIDTH = VIEWBOX_WIDTH - PADDING_LEFT - PADDING_RIGHT;
  const CHART_HEIGHT = VIEWBOX_HEIGHT - PADDING_TOP - PADDING_BOTTOM;

  const maxY = Math.max(...data.map((d) => Math.max(d.actual, d.rollingAverage)), 10) * 1.15;

  const getX = (index: number) => PADDING_LEFT + (index * (CHART_WIDTH / 12)) + (CHART_WIDTH / 24);
  const getY = (val: number) => PADDING_TOP + CHART_HEIGHT - (val / maxY) * CHART_HEIGHT;

  const barWidth = (CHART_WIDTH / 12) * 0.5;

  const linePoints = data.map((d, i) => `${getX(i)},${getY(d.rollingAverage)}`).join(' ');

  const formatValue = (value: number, asPercentage?: boolean) => {
    return `${Math.round(value)}${asPercentage ? '%' : ''}`;
  };

  return (
    <svg viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`} className="w-full h-full min-h-[280px]">
      <g transform={`translate(${PADDING_LEFT}, 15)`}>
        <rect x="0" y="0" width="12" height="12" fill="#001B47" rx="2" className="dark:fill-blue-500" />
        <text x="18" y="10" className="text-xs fill-gray-600 dark:fill-gray-300 font-medium">Actual Delivered</text>

        <line x1="130" y1="6" x2="150" y2="6" stroke="#FF8A2A" strokeWidth="3" />
        <circle cx="140" cy="6" r="4" fill="#FF8A2A" />
        <text x="158" y="10" className="text-xs fill-gray-600 dark:fill-gray-300 font-medium">12-Month Rolling Average</text>
      </g>

      {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
        const y = PADDING_TOP + CHART_HEIGHT - (ratio * CHART_HEIGHT);
        const val = Math.round(ratio * maxY);
        return (
          <g key={ratio}>
            <text x={PADDING_LEFT - 10} y={y + 4} textAnchor="end" className="text-[10px] fill-gray-500 dark:fill-gray-400">
              {val}{isPercentage ? '%' : ''}
            </text>
            <line
              x1={PADDING_LEFT}
              y1={y}
              x2={VIEWBOX_WIDTH - PADDING_RIGHT}
              y2={y}
              stroke="#E5E7EB"
              className="dark:stroke-gray-700"
              strokeDasharray={ratio === 0 ? '' : '4 4'}
            />
          </g>
        );
      })}

      {data.map((d, i) => {
        const x = getX(i);
        const y = getY(d.actual);
        const height = PADDING_TOP + CHART_HEIGHT - y;
        const valueLabelY = Math.max(14, y - 8);

        return (
          <g key={`bar-${i}`}>
            <rect
              x={x - barWidth / 2}
              y={y}
              width={barWidth}
              height={height}
              fill="#001B47"
              rx={4}
              className="transition-all duration-500 ease-out dark:fill-blue-500"
            >
              <title>Actual: {d.actual}{isPercentage ? '%' : ''}</title>
            </rect>
            <text
              x={x}
              y={valueLabelY}
              textAnchor="middle"
              className="text-[10px] font-bold fill-gray-700 dark:fill-gray-200"
            >
              {formatValue(d.actual, isPercentage)}
            </text>
            <text
              x={x}
              y={VIEWBOX_HEIGHT - 15}
              textAnchor="middle"
              className="text-[10px] font-medium fill-gray-600 dark:fill-gray-400"
            >
              {new Date(d.year, d.month - 1).toLocaleString('en-GB', { month: 'short', year: '2-digit' })}
            </text>
          </g>
        );
      })}

      <polyline
        points={linePoints}
        fill="none"
        stroke="#FF8A2A"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="transition-all duration-500 ease-out"
      />

      {data.map((d, i) => {
        const pointX = getX(i);
        const pointY = getY(d.rollingAverage);
        const labelY = Math.max(14, pointY - 10);

        return (
          <g key={`dot-group-${i}`}>
            <text
              x={pointX}
              y={labelY}
              textAnchor="middle"
              className="text-[10px] font-bold fill-[#FF8A2A]"
            >
              {formatValue(d.rollingAverage, isPercentage)}
            </text>
            <circle
              cx={pointX}
              cy={pointY}
              r={4}
              fill="#FF8A2A"
              stroke="#fff"
              strokeWidth="2"
              className="dark:stroke-gray-800 transition-all duration-500 ease-out"
            >
              <title>Rolling Avg: {d.rollingAverage.toFixed(1)}{isPercentage ? '%' : ''}</title>
            </circle>
          </g>
        );
      })}
    </svg>
  );
};

const AccountantRankingChart = ({
  data,
  isPercentage,
  selectedStaffId,
  isTeamViewMode,
}: {
  data: AccountantRankingRow[];
  isPercentage?: boolean;
  selectedStaffId: number | null;
  isTeamViewMode: boolean;
}) => {
  const VIEWBOX_WIDTH = 560;
  const VIEWBOX_HEIGHT = 420;
  const PADDING_TOP = 20;
  const PADDING_BOTTOM = 24;
  const PADDING_LEFT = 150;
  const PADDING_RIGHT = 60;

  const CHART_WIDTH = VIEWBOX_WIDTH - PADDING_LEFT - PADDING_RIGHT;
  const CHART_HEIGHT = VIEWBOX_HEIGHT - PADDING_TOP - PADDING_BOTTOM;

  const maxValue = Math.max(...data.map((item) => item.rollingAverage), 1) * 1.1;
  const rowHeight = CHART_HEIGHT / Math.max(data.length, 1);
  const barHeight = Math.min(26, rowHeight * 0.62);

  const getBarColor = (row: AccountantRankingRow) => {
    if (isTeamViewMode) {
      return '#001B47';
    }

    if (selectedStaffId && row.staff_id === selectedStaffId) {
      return '#FF8A2A';
    }

    return '#D1D5DB';
  };

  const getLabelColor = (row: AccountantRankingRow) => {
    if (isTeamViewMode) {
      return 'fill-gray-700 dark:fill-gray-200';
    }

    if (selectedStaffId && row.staff_id === selectedStaffId) {
      return 'fill-[#001B47] dark:fill-white';
    }

    return 'fill-gray-400 dark:fill-gray-500';
  };

  const formatValue = (value: number) => `${value.toFixed(1)}${isPercentage ? '%' : ''}`;

  return (
    <svg viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`} className="w-full h-full min-h-[320px]">
      {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
        const x = PADDING_LEFT + ratio * CHART_WIDTH;
        const value = maxValue * ratio;

        return (
          <g key={ratio}>
            <line
              x1={x}
              y1={PADDING_TOP}
              x2={x}
              y2={VIEWBOX_HEIGHT - PADDING_BOTTOM}
              stroke="#E5E7EB"
              className="dark:stroke-gray-700"
              strokeDasharray={ratio === 0 ? '' : '4 4'}
            />
            <text
              x={x}
              y={VIEWBOX_HEIGHT - 8}
              textAnchor="middle"
              className="text-[10px] fill-gray-500 dark:fill-gray-400"
            >
              {formatValue(value)}
            </text>
          </g>
        );
      })}

      {data.map((row, index) => {
        const y = PADDING_TOP + index * rowHeight + rowHeight / 2;
        const barWidth = (row.rollingAverage / maxValue) * CHART_WIDTH;
        const isSelected = selectedStaffId === row.staff_id;
        const showStrongEmphasis = isTeamViewMode || isSelected;

        return (
          <g key={row.staff_id}>
            <text
              x={PADDING_LEFT - 10}
              y={y + 4}
              textAnchor="end"
              className={`text-[12px] font-medium ${getLabelColor(row)}`}
            >
              {row.name}
            </text>

            <rect
              x={PADDING_LEFT}
              y={y - barHeight / 2}
              width={barWidth}
              height={barHeight}
              rx={4}
              fill={getBarColor(row)}
              opacity={showStrongEmphasis ? 1 : 0.9}
            />

            <text
              x={Math.min(PADDING_LEFT + barWidth + 8, VIEWBOX_WIDTH - PADDING_RIGHT + 4)}
              y={y + 4}
              textAnchor="start"
              className={`text-[12px] font-bold ${showStrongEmphasis ? 'fill-gray-800 dark:fill-gray-100' : 'fill-gray-500 dark:fill-gray-400'}`}
            >
              {formatValue(row.rollingAverage)}
            </text>
          </g>
        );
      })}
    </svg>
  );
};