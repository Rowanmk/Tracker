import React, { useEffect, useMemo, useState } from 'react';
import {
  BarChart,
  Card,
  DonutChart,
  Flex,
  Grid,
  Legend,
  Metric,
  Text,
  Title,
} from '@tremor/react';
import { supabase } from '../supabase/client';
import { useServices } from '../hooks/useServices';
import { useAuth } from '../context/AuthContext';
import { BAGEL_SERVICE_ID } from '../utils/bagelDays';
import { isAccountantStaff } from '../utils/staff';

type ServiceRow = {
  service_id: number;
  service_name: string;
};

type StaffRow = {
  staff_id: number;
  name: string;
  is_hidden: boolean | null;
  role: string;
};

type ActivityRow = {
  staff_id: number | null;
  service_id: number | null;
  delivered_count: number;
  date: string;
};

type PeriodOption = {
  value: string;
  label: string;
  year: number;
  month: number;
};

type FetchedData = {
  activities: ActivityRow[];
  activeStaff: StaffRow[];
  services: ServiceRow[];
};

type MonthKeyData = {
  key: string;
  year: number;
  month: number;
  label: string;
  longLabel: string;
  total: number;
  byService: Record<number, number>;
};

type LeaderboardRow = {
  staff_id: number;
  name: string;
  total: number;
  byService: Record<number, number>;
  activeDays: number;
  avgJobsPerActiveDay: number;
  priorTotal: number;
  delta: number;
  deltaPct: number | null;
};

type AccountantYoYRow = {
  staff_id: number;
  name: string;
  current: number;
  prior: number;
  delta: number;
  deltaPct: number | null;
};

type InsightSummary = {
  overallYoYPct: number | null;
  topServiceName: string | null;
  topServiceSharePct: number;
  peakMonthLabel: string | null;
  troughMonthLabel: string | null;
  peakVsTroughGap: number;
  monthsAboveAverage: string[];
  topContributorSharePct: number;
  concentrationRisk: boolean;
  stepChangeAccountants: string[];
  highestAvgJobsName: string | null;
  weekdayVsWeekend: {
    weekday: number;
    weekend: number;
    weekdayPct: number;
    weekendPct: number;
  };
};

type ComputedInsights = {
  headerTitle: string;
  totalJobsDelivered: number;
  priorTotalJobsDelivered: number;
  yoyChangeAbs: number;
  yoyChangePct: number | null;
  peakMonth: { label: string; total: number } | null;
  activeDeliveryDays: number;
  avgJobsPerActiveDay: number;
  monthlyServiceData: MonthKeyData[];
  donutData: Array<{
    service_id: number;
    service_name: string;
    total: number;
    pct: number;
    color: string;
  }>;
  overviewInsights: string[];
  teamInsights: string[];
  leaderboard: LeaderboardRow[];
  accountantYoY: AccountantYoYRow[];
  weekdayDistribution: Array<{
    label: string;
    value: number;
  }>;
  totalForCurrentWindowMonthSelection: number;
};

const MONTH_FORMATTER = new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric' });
const LONG_DATE_FORMATTER = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});
const MONTH_LABEL_FORMATTER = new Intl.DateTimeFormat('en-GB', { month: 'short' });
const FULL_MONTH_LABEL_FORMATTER = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' });

const PAGE_SIZE = 1000;

const SERVICE_COLORS = [
  '#001B47',
  '#0060B8',
  '#007EE0',
  '#FF8A2A',
  '#FFB000',
  '#008A00',
  '#7C3AED',
  '#DB2777',
];

const TREMOR_SERVICE_COLORS = ['blue', 'emerald', 'violet'];

const weekdayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const toIsoDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getMonthKey = (year: number, month: number) => `${year}-${String(month).padStart(2, '0')}`;

const getLastCompletedMonthDate = () => {
  const today = new Date();
  return new Date(today.getFullYear(), today.getMonth() - 1, 1);
};

const buildPeriodOptions = (): PeriodOption[] => {
  const start = new Date(2024, 0, 1);
  const end = getLastCompletedMonthDate();
  const options: PeriodOption[] = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);

  while (cursor <= end) {
    options.push({
      value: getMonthKey(cursor.getFullYear(), cursor.getMonth() + 1),
      label: MONTH_FORMATTER.format(cursor),
      year: cursor.getFullYear(),
      month: cursor.getMonth() + 1,
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return options;
};

const getMonthRange = (endYear: number, endMonth: number, monthsCount: number) => {
  const months: Array<{ year: number; month: number; start: Date; end: Date; key: string }> = [];
  const endCursor = new Date(endYear, endMonth - 1, 1);

  for (let i = monthsCount - 1; i >= 0; i -= 1) {
    const current = new Date(endCursor.getFullYear(), endCursor.getMonth() - i, 1);
    const start = new Date(current.getFullYear(), current.getMonth(), 1);
    const end = new Date(current.getFullYear(), current.getMonth() + 1, 0);
    months.push({
      year: current.getFullYear(),
      month: current.getMonth() + 1,
      start,
      end,
      key: getMonthKey(current.getFullYear(), current.getMonth() + 1),
    });
  }

  return months;
};

const formatNumber = (value: number) => value.toLocaleString('en-GB');

const formatPct = (value: number | null, digits = 1) => {
  if (value === null || Number.isNaN(value)) return '—';
  return `${value >= 0 ? '+' : ''}${value.toFixed(digits)}%`;
};

const formatDeltaNumber = (value: number) => `${value >= 0 ? '+' : ''}${formatNumber(value)}`;

const getMondayFirstDOW = (dateIso: string) => {
  const date = new Date(`${dateIso}T00:00:00`);
  const raw = date.getDay();
  return raw === 0 ? 6 : raw - 1;
};

const TremorInsightCard: React.FC<{ title?: string; className?: string; children: React.ReactNode }> = ({
  title,
  className = '',
  children,
}) => (
  <Card className={`annual-card border-0 shadow-sm ring-1 ring-slate-200/80 ${className}`}>
    {title ? <Title className="text-slate-900">{title}</Title> : null}
    <div className={title ? 'mt-4' : ''}>{children}</div>
  </Card>
);

const KpiCard: React.FC<{
  label: string;
  value: string;
  subValue?: string;
}> = ({ label, value, subValue }) => (
  <Card className="annual-card border-0 shadow-sm ring-1 ring-slate-200/80">
    <Text className="text-slate-500">{label}</Text>
    <Metric className="mt-3 text-slate-950 break-words">{value}</Metric>
    <Text className="mt-3 min-h-[2.5rem] text-slate-500">{subValue || ' '}</Text>
  </Card>
);

export const AnnualSummary: React.FC = () => {
  const { allStaff } = useAuth();
  const { services: loadedServices } = useServices();

  const periodOptions = useMemo(() => buildPeriodOptions(), []);
  const defaultPeriod = periodOptions[periodOptions.length - 1]?.value || '';
  const [selectedPeriod, setSelectedPeriod] = useState(defaultPeriod);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fetchedData, setFetchedData] = useState<FetchedData>({
    activities: [],
    activeStaff: [],
    services: [],
  });

  useEffect(() => {
    const fetchAllData = async () => {
      setLoading(true);
      setError(null);

      try {
        const activeStaff = allStaff
          .filter((staffMember) => !staffMember.is_hidden && isAccountantStaff(staffMember))
          .map((staffMember) => ({
            staff_id: staffMember.staff_id,
            name: staffMember.name,
            is_hidden: staffMember.is_hidden,
            role: staffMember.role,
          }));

        const baseServices = loadedServices
          .filter((service) => service.service_id !== BAGEL_SERVICE_ID)
          .map((service) => ({
            service_id: service.service_id,
            service_name: service.service_name,
          }))
          .sort((a, b) => a.service_name.localeCompare(b.service_name));

        if (activeStaff.length === 0 || baseServices.length === 0) {
          setFetchedData({
            activities: [],
            activeStaff,
            services: baseServices,
          });
          setLoading(false);
          return;
        }

        let from = 0;
        let hasMore = true;
        const activities: ActivityRow[] = [];
        const activeStaffIds = activeStaff.map((staff) => staff.staff_id);

        while (hasMore) {
          const { data, error: fetchError } = await supabase
            .from('dailyactivity')
            .select('staff_id, service_id, delivered_count, date')
            .in('staff_id', activeStaffIds)
            .order('activity_id', { ascending: true })
            .range(from, from + PAGE_SIZE - 1);

          if (fetchError) {
            throw fetchError;
          }

          const pageRows = (data || []) as ActivityRow[];
          if (pageRows.length === 0) {
            hasMore = false;
          } else {
            activities.push(...pageRows.filter((row) => row.service_id !== BAGEL_SERVICE_ID));
            if (pageRows.length < PAGE_SIZE) {
              hasMore = false;
            } else {
              from += PAGE_SIZE;
            }
          }
        }

        setFetchedData({
          activities,
          activeStaff,
          services: baseServices,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load Delivery Insights data.');
      } finally {
        setLoading(false);
      }
    };

    void fetchAllData();
  }, [allStaff, loadedServices]);

  const computed = useMemo<ComputedInsights | null>(() => {
    if (!selectedPeriod || fetchedData.services.length === 0 || fetchedData.activeStaff.length === 0) {
      return null;
    }

    const [selectedYearStr, selectedMonthStr] = selectedPeriod.split('-');
    const selectedYear = Number(selectedYearStr);
    const selectedMonth = Number(selectedMonthStr);

    if (Number.isNaN(selectedYear) || Number.isNaN(selectedMonth)) {
      return null;
    }

    const currentWindowMonths = getMonthRange(selectedYear, selectedMonth, 12);
    const currentWindowStart = currentWindowMonths[0].start;
    const currentWindowEnd = currentWindowMonths[currentWindowMonths.length - 1].end;
    const priorWindowStart = new Date(currentWindowStart.getFullYear(), currentWindowStart.getMonth() - 12, 1);
    const priorWindowEnd = new Date(currentWindowEnd.getFullYear(), currentWindowEnd.getMonth() - 12 + 1, 0);

    const currentStartIso = toIsoDate(currentWindowStart);
    const currentEndIso = toIsoDate(currentWindowEnd);
    const priorStartIso = toIsoDate(priorWindowStart);
    const priorEndIso = toIsoDate(priorWindowEnd);

    const serviceColorMap = new Map<number, string>();
    fetchedData.services.forEach((service, index) => {
      serviceColorMap.set(service.service_id, SERVICE_COLORS[index % SERVICE_COLORS.length]);
    });

    const currentMonthMap = new Map(
      currentWindowMonths.map((month) => [
        month.key,
        {
          key: month.key,
          year: month.year,
          month: month.month,
          label: MONTH_LABEL_FORMATTER.format(month.start),
          longLabel: FULL_MONTH_LABEL_FORMATTER.format(month.start),
          total: 0,
          byService: {} as Record<number, number>,
        },
      ])
    );

    const deliveredByCurrentKey = new Map<string, number>();
    const deliveredByPriorKey = new Map<string, number>();
    const activeCurrentDateSet = new Set<string>();
    const weekdayTotals = Array.from({ length: 7 }, () => 0);
    const currentTotalsByService = new Map<number, number>();
    const currentTotalsByStaff = new Map<number, number>();
    const priorTotalsByStaff = new Map<number, number>();
    const currentByStaffByService = new Map<number, Record<number, number>>();
    const currentActiveDatesByStaff = new Map<number, Set<string>>();

    fetchedData.activeStaff.forEach((staff) => {
      currentTotalsByStaff.set(staff.staff_id, 0);
      priorTotalsByStaff.set(staff.staff_id, 0);
      currentByStaffByService.set(staff.staff_id, {});
      currentActiveDatesByStaff.set(staff.staff_id, new Set<string>());
    });

    fetchedData.services.forEach((service) => {
      currentTotalsByService.set(service.service_id, 0);
    });

    fetchedData.activities.forEach((activity) => {
      if (
        activity.staff_id == null ||
        activity.service_id == null ||
        !activity.date ||
        !currentTotalsByStaff.has(activity.staff_id)
      ) {
        return;
      }

      const count = activity.delivered_count || 0;
      if (count <= 0) return;

      if (activity.date >= currentStartIso && activity.date <= currentEndIso) {
        const dateObj = new Date(`${activity.date}T00:00:00`);
        const monthKey = getMonthKey(dateObj.getFullYear(), dateObj.getMonth() + 1);
        const monthEntry = currentMonthMap.get(monthKey);
        if (monthEntry) {
          monthEntry.total += count;
          monthEntry.byService[activity.service_id] = (monthEntry.byService[activity.service_id] || 0) + count;
        }

        const deliveredCurrentKey = `${activity.staff_id}|${activity.service_id}`;
        deliveredByCurrentKey.set(deliveredCurrentKey, (deliveredByCurrentKey.get(deliveredCurrentKey) || 0) + count);

        currentTotalsByService.set(activity.service_id, (currentTotalsByService.get(activity.service_id) || 0) + count);
        currentTotalsByStaff.set(activity.staff_id, (currentTotalsByStaff.get(activity.staff_id) || 0) + count);

        const staffServiceMap = currentByStaffByService.get(activity.staff_id) || {};
        staffServiceMap[activity.service_id] = (staffServiceMap[activity.service_id] || 0) + count;
        currentByStaffByService.set(activity.staff_id, staffServiceMap);

        activeCurrentDateSet.add(activity.date);
        currentActiveDatesByStaff.get(activity.staff_id)?.add(activity.date);
        weekdayTotals[getMondayFirstDOW(activity.date)] += count;
      }

      if (activity.date >= priorStartIso && activity.date <= priorEndIso) {
        const deliveredPriorKey = `${activity.staff_id}|${activity.service_id}`;
        deliveredByPriorKey.set(deliveredPriorKey, (deliveredByPriorKey.get(deliveredPriorKey) || 0) + count);
        priorTotalsByStaff.set(activity.staff_id, (priorTotalsByStaff.get(activity.staff_id) || 0) + count);
      }
    });

    const monthlyServiceData = currentWindowMonths.map((month) => currentMonthMap.get(month.key)!).filter(Boolean);
    const totalJobsDelivered = monthlyServiceData.reduce((sum, month) => sum + month.total, 0);
    const priorTotalJobsDelivered = Array.from(priorTotalsByStaff.values()).reduce((sum, value) => sum + value, 0);
    const yoyChangeAbs = totalJobsDelivered - priorTotalJobsDelivered;
    const yoyChangePct = priorTotalJobsDelivered > 0 ? (yoyChangeAbs / priorTotalJobsDelivered) * 100 : null;

    const peakMonth = monthlyServiceData.reduce<MonthKeyData | null>((best, month) => {
      if (!best || month.total > best.total) return month;
      return best;
    }, null);

    const troughMonth = monthlyServiceData.reduce<MonthKeyData | null>((lowest, month) => {
      if (!lowest || month.total < lowest.total) return month;
      return lowest;
    }, null);

    const activeDeliveryDays = activeCurrentDateSet.size;
    const avgJobsPerActiveDay = activeDeliveryDays > 0 ? totalJobsDelivered / activeDeliveryDays : 0;
    const monthlyAverage = monthlyServiceData.length > 0 ? totalJobsDelivered / monthlyServiceData.length : 0;

    const donutData = fetchedData.services
      .map((service) => {
        const total = currentTotalsByService.get(service.service_id) || 0;
        return {
          service_id: service.service_id,
          service_name: service.service_name,
          total,
          pct: totalJobsDelivered > 0 ? (total / totalJobsDelivered) * 100 : 0,
          color: serviceColorMap.get(service.service_id) || '#001B47',
        };
      })
      .filter((item) => item.total > 0)
      .sort((a, b) => b.total - a.total);

    const leaderboard = fetchedData.activeStaff
      .map<LeaderboardRow>((staff) => {
        const total = currentTotalsByStaff.get(staff.staff_id) || 0;
        const priorTotal = priorTotalsByStaff.get(staff.staff_id) || 0;
        const activeDays = currentActiveDatesByStaff.get(staff.staff_id)?.size || 0;
        const avg = activeDays > 0 ? total / activeDays : 0;
        const delta = total - priorTotal;
        const deltaPct = priorTotal > 0 ? (delta / priorTotal) * 100 : total > 0 ? 100 : null;

        return {
          staff_id: staff.staff_id,
          name: staff.name,
          total,
          byService: currentByStaffByService.get(staff.staff_id) || {},
          activeDays,
          avgJobsPerActiveDay: avg,
          priorTotal,
          delta,
          deltaPct,
        };
      })
      .sort((a, b) => b.total - a.total);

    const accountantYoY = leaderboard.map<AccountantYoYRow>((row) => ({
      staff_id: row.staff_id,
      name: row.name,
      current: row.total,
      prior: row.priorTotal,
      delta: row.delta,
      deltaPct: row.deltaPct,
    }));

    const topService = donutData[0] || null;
    const monthsAboveAverage = monthlyServiceData
      .filter((month) => month.total >= monthlyAverage * 1.25)
      .map((month) => month.longLabel);

    const topContributor = leaderboard[0] || null;
    const topContributorSharePct = totalJobsDelivered > 0 && topContributor ? (topContributor.total / totalJobsDelivered) * 100 : 0;
    const highestAvgJobs = [...leaderboard].sort((a, b) => b.avgJobsPerActiveDay - a.avgJobsPerActiveDay)[0] || null;

    const weekdayTotal = weekdayTotals.slice(0, 5).reduce((sum, value) => sum + value, 0);
    const weekendTotal = weekdayTotals.slice(5).reduce((sum, value) => sum + value, 0);
    const weekdayVsWeekend = {
      weekday: weekdayTotal,
      weekend: weekendTotal,
      weekdayPct: totalJobsDelivered > 0 ? (weekdayTotal / totalJobsDelivered) * 100 : 0,
      weekendPct: totalJobsDelivered > 0 ? (weekendTotal / totalJobsDelivered) * 100 : 0,
    };

    const stepChangeAccountants = leaderboard
      .filter((row) => row.deltaPct !== null && row.deltaPct > 100)
      .map((row) => row.name);

    const insights: InsightSummary = {
      overallYoYPct: yoyChangePct,
      topServiceName: topService?.service_name || null,
      topServiceSharePct: topService?.pct || 0,
      peakMonthLabel: peakMonth?.longLabel || null,
      troughMonthLabel: troughMonth?.longLabel || null,
      peakVsTroughGap: peakMonth && troughMonth ? peakMonth.total - troughMonth.total : 0,
      monthsAboveAverage,
      topContributorSharePct,
      concentrationRisk: topContributorSharePct > 30,
      stepChangeAccountants,
      highestAvgJobsName: highestAvgJobs?.name || null,
      weekdayVsWeekend,
    };

    const overviewInsights = [
      `Overall delivery was ${formatPct(insights.overallYoYPct)} versus the prior 12-month window.`,
      insights.topServiceName
        ? `${insights.topServiceName} was the biggest service at ${insights.topServiceSharePct.toFixed(1)}% of all jobs.`
        : 'No service mix insight available.',
      insights.peakMonthLabel && insights.troughMonthLabel
        ? `${insights.peakMonthLabel} outperformed ${insights.troughMonthLabel} by ${formatNumber(insights.peakVsTroughGap)} jobs.`
        : 'No peak/trough comparison available.',
      insights.monthsAboveAverage.length > 0
        ? `Months at least 25% above the 12-month monthly average: ${insights.monthsAboveAverage.join(', ')}.`
        : 'No months exceeded the 12-month monthly average by 25% or more.',
    ];

    const teamInsights = [
      topContributor
        ? `${topContributor.name} contributed ${topContributorSharePct.toFixed(1)}% of total volume${insights.concentrationRisk ? ', which is a concentration risk.' : '.'}`
        : 'No top contributor identified.',
      insights.stepChangeAccountants.length > 0
        ? `Step-change growth came from ${insights.stepChangeAccountants.join(', ')} (>100% YoY).`
        : 'No accountants posted >100% YoY growth.',
      insights.highestAvgJobsName
        ? `${insights.highestAvgJobsName} had the highest average jobs per active day.`
        : 'No average jobs/day leader identified.',
      `Weekday vs weekend split was ${insights.weekdayVsWeekend.weekdayPct.toFixed(1)}% weekday and ${insights.weekdayVsWeekend.weekendPct.toFixed(1)}% weekend.`,
    ];

    const headerTitle = `Accounts Team Delivery Insights · 12 months to ${LONG_DATE_FORMATTER.format(currentWindowEnd)}`;

    return {
      headerTitle,
      totalJobsDelivered,
      priorTotalJobsDelivered,
      yoyChangeAbs,
      yoyChangePct,
      peakMonth: peakMonth ? { label: peakMonth.longLabel, total: peakMonth.total } : null,
      activeDeliveryDays,
      avgJobsPerActiveDay,
      monthlyServiceData,
      donutData,
      overviewInsights,
      teamInsights,
      leaderboard,
      accountantYoY,
      weekdayDistribution: weekdayLabels.map((label, index) => ({
        label,
        value: weekdayTotals[index] || 0,
      })),
      totalForCurrentWindowMonthSelection: totalJobsDelivered,
    };
  }, [selectedPeriod, fetchedData]);

  const printableServiceLegend = useMemo(
    () =>
      fetchedData.services.map((service, index) => ({
        service_id: service.service_id,
        service_name: service.service_name,
        color: SERVICE_COLORS[index % SERVICE_COLORS.length],
      })),
    [fetchedData.services]
  );

  const selectedPeriodLabel = periodOptions.find((option) => option.value === selectedPeriod)?.label || '';

  const monthlyBarData = useMemo(() => {
    return computed
      ? computed.monthlyServiceData.map((month) => {
          const row: Record<string, string | number> = {
            month: month.label,
          };

          printableServiceLegend.forEach((service) => {
            row[service.service_name] = month.byService[service.service_id] || 0;
          });

          return row;
        })
      : [];
  }, [computed, printableServiceLegend]);

  const donutChartData = useMemo(
    () =>
      computed?.donutData.map((segment) => ({
        name: segment.service_name,
        value: segment.total,
      })) || [],
    [computed]
  );

  const legendCategories = useMemo(
    () => printableServiceLegend.map((service) => service.service_name),
    [printableServiceLegend]
  );

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return <div className="py-6 text-center text-gray-500">Loading delivery insights…</div>;
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-md">
        <p className="text-red-800">⚠️ {error}</p>
      </div>
    );
  }

  if (!computed) {
    return (
      <div className="py-6 text-center text-gray-500">
        No delivery insight data available.
      </div>
    );
  }

  return (
    <div className="space-y-6 annual-summary-delivery-insights">
      <style>
        {`
          @media print {
            @page {
              size: A4 portrait;
              margin: 10mm;
            }

            body {
              background: #ffffff !important;
            }

            header,
            nav,
            .annual-summary-controls,
            .annual-summary-screen-only,
            .page-header,
            .print-hide,
            .print\\:hidden {
              display: none !important;
            }

            main {
              padding: 0 !important;
              margin: 0 !important;
              width: 100% !important;
            }

            .annual-summary-print-root {
              width: 100% !important;
              max-width: none !important;
            }

            .annual-page {
              min-height: auto !important;
              page-break-after: always;
              break-after: page;
            }

            .annual-page:last-child {
              page-break-after: auto;
              break-after: auto;
            }

            .annual-page-break {
              page-break-before: always;
              break-before: page;
            }

            .annual-card,
            .annual-summary-delivery-insights .tr-card,
            .annual-summary-delivery-insights [data-testid="tremor-card"] {
              break-inside: avoid;
              page-break-inside: avoid;
              box-shadow: none !important;
              overflow: visible !important;
            }

            .annual-page-grid-2 {
              grid-template-columns: 1fr 1fr !important;
            }

            .annual-page-grid-4 {
              grid-template-columns: 1fr 1fr 1fr 1fr !important;
            }

            .annual-chart-print-fix {
              min-height: 230px !important;
              height: 230px !important;
              overflow: visible !important;
            }

            .annual-chart-print-fix svg,
            .annual-chart-print-fix canvas {
              max-height: 230px !important;
            }

            .annual-summary-delivery-insights .recharts-wrapper,
            .annual-summary-delivery-insights .recharts-surface {
              overflow: visible !important;
            }
          }
        `}
      </style>

      <div className="annual-summary-controls flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
        <div className="flex flex-col sm:flex-row gap-4 sm:items-end">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Reporting period ends
            </label>
            <select
              value={selectedPeriod}
              onChange={(e) => setSelectedPeriod(e.target.value)}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-w-[180px]"
            >
              {periodOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <button
          type="button"
          onClick={handlePrint}
          className="self-start lg:self-auto px-4 py-2 bg-[#001B47] text-white rounded-md font-bold hover:bg-[#00245F] transition"
        >
          Print to PDF
        </button>
      </div>

      <div className="page-header">
        <h2 className="page-title">Annual Summary</h2>
        <p className="page-subtitle">{computed.headerTitle}</p>
      </div>

      <div className="annual-summary-print-root space-y-8">
        <section className="annual-page space-y-6">
          <Card className="annual-card border-0 shadow-sm ring-1 ring-slate-200/80 bg-slate-50/70">
            <Text className="text-slate-500">Delivery Insights Overview</Text>
            <Title className="mt-3 text-slate-950">{computed.headerTitle}</Title>
            <Text className="mt-2 text-slate-500">Reporting period ends {selectedPeriodLabel}</Text>
          </Card>

          <Grid numItems={1} numItemsMd={2} numItemsLg={4} className="gap-4 annual-page-grid-4">
            <KpiCard
              label="Total jobs delivered"
              value={formatNumber(computed.totalJobsDelivered)}
              subValue={`YoY delta ${formatDeltaNumber(computed.yoyChangeAbs)} · ${formatPct(computed.yoyChangePct, 1)}`}
            />
            <KpiCard
              label="Year-on-year"
              value={`${formatDeltaNumber(computed.yoyChangeAbs)} · ${formatPct(computed.yoyChangePct, 1)}`}
              subValue={`Prior 12m: ${formatNumber(computed.priorTotalJobsDelivered)}`}
            />
            <KpiCard
              label="Peak month"
              value={computed.peakMonth ? computed.peakMonth.label : '—'}
              subValue={computed.peakMonth ? `${formatNumber(computed.peakMonth.total)} jobs` : 'No data'}
            />
            <KpiCard
              label="Active delivery days"
              value={formatNumber(computed.activeDeliveryDays)}
              subValue={`Avg ${computed.avgJobsPerActiveDay.toFixed(1)} jobs/day`}
            />
          </Grid>

          <Grid numItems={1} numItemsLg={3} className="gap-6 annual-page-grid-2">
            <div className="lg:col-span-2">
              <TremorInsightCard title="Monthly deliveries by service">
                <div className="annual-chart-print-fix h-[360px]">
                  <BarChart
                    className="h-full"
                    data={monthlyBarData}
                    index="month"
                    categories={legendCategories}
                    colors={TREMOR_SERVICE_COLORS}
                    stack
                    showLegend={false}
                    showTooltip
                    showAnimation={false}
                    showGridLines
                    yAxisWidth={1}
                    showYAxis={false}
                    showXAxis
                    valueFormatter={(value) => formatNumber(Number(value))}
                    layout="vertical"
                  />
                </div>
              </TremorInsightCard>
            </div>

            <TremorInsightCard title="Service mix">
              <div className="annual-chart-print-fix flex flex-col items-center justify-center">
                <DonutChart
                  className="mx-auto h-64"
                  data={donutChartData}
                  category="value"
                  index="name"
                  colors={TREMOR_SERVICE_COLORS}
                  valueFormatter={(value) => formatNumber(Number(value))}
                  showTooltip
                  showAnimation={false}
                />
                <Legend
                  className="mt-6 justify-center"
                  categories={legendCategories}
                  colors={TREMOR_SERVICE_COLORS}
                />
              </div>
            </TremorInsightCard>
          </Grid>

          <TremorInsightCard title="What jumped out">
            <ul className="space-y-3">
              {computed.overviewInsights.map((insight) => (
                <li key={insight} className="flex items-start gap-3 text-sm text-slate-700">
                  <span className="mt-1.5 h-2 w-2 rounded-full bg-blue-500 shrink-0" />
                  <span>{insight}</span>
                </li>
              ))}
            </ul>
          </TremorInsightCard>
        </section>

        <section className="annual-page annual-page-break space-y-6">
          <Card className="annual-card border-0 shadow-sm ring-1 ring-slate-200/80 bg-slate-50/70">
            <Text className="text-slate-500">Team & Rhythm</Text>
            <Title className="mt-3 text-slate-950">{computed.headerTitle}</Title>
            <Text className="mt-2 text-slate-500">Page 2 · Team contribution, cadence and talking points</Text>
          </Card>

          <TremorInsightCard title="Team leaderboard">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase text-slate-500">Accountant</th>
                    <th className="px-4 py-3 text-right text-xs font-bold uppercase text-slate-500">Current 12m</th>
                    <th className="px-4 py-3 text-right text-xs font-bold uppercase text-slate-500">Prior 12m</th>
                    <th className="px-4 py-3 text-right text-xs font-bold uppercase text-slate-500">Δ</th>
                    <th className="px-4 py-3 text-right text-xs font-bold uppercase text-slate-500">Δ %</th>
                    <th className="px-4 py-3 text-right text-xs font-bold uppercase text-slate-500">Avg / Active Day</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {computed.leaderboard.map((row) => {
                    const highlightClass =
                      row.deltaPct !== null && row.deltaPct > 50
                        ? 'bg-green-50/60'
                        : row.deltaPct !== null && row.deltaPct < -25
                        ? 'bg-red-50/60'
                        : '';
                    return (
                      <tr key={row.staff_id} className={highlightClass}>
                        <td className="px-4 py-3 font-medium text-slate-900">{row.name}</td>
                        <td className="px-4 py-3 text-right text-slate-700">{formatNumber(row.total)}</td>
                        <td className="px-4 py-3 text-right text-slate-700">{formatNumber(row.priorTotal)}</td>
                        <td className={`px-4 py-3 text-right font-bold ${row.delta >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                          {formatDeltaNumber(row.delta)}
                        </td>
                        <td className={`px-4 py-3 text-right font-bold ${row.deltaPct !== null && row.deltaPct >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                          {row.deltaPct === null ? '—' : `${row.deltaPct >= 0 ? '+' : ''}${row.deltaPct.toFixed(1)}%`}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-700">{row.avgJobsPerActiveDay.toFixed(1)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </TremorInsightCard>

          <TremorInsightCard title="Year-on-year per accountant">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase text-slate-500">Accountant</th>
                    <th className="px-4 py-3 text-right text-xs font-bold uppercase text-slate-500">Current 12m</th>
                    <th className="px-4 py-3 text-right text-xs font-bold uppercase text-slate-500">Prior 12m</th>
                    <th className="px-4 py-3 text-right text-xs font-bold uppercase text-slate-500">Δ</th>
                    <th className="px-4 py-3 text-right text-xs font-bold uppercase text-slate-500">Δ %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {computed.accountantYoY.map((row) => {
                    const highlightClass =
                      row.deltaPct !== null && row.deltaPct > 50
                        ? 'bg-green-50/60'
                        : row.deltaPct !== null && row.deltaPct < -25
                        ? 'bg-red-50/60'
                        : '';
                    return (
                      <tr key={row.staff_id} className={highlightClass}>
                        <td className="px-4 py-3 font-medium text-slate-900">{row.name}</td>
                        <td className="px-4 py-3 text-right text-slate-700">{formatNumber(row.current)}</td>
                        <td className="px-4 py-3 text-right text-slate-700">{formatNumber(row.prior)}</td>
                        <td className={`px-4 py-3 text-right font-bold ${row.delta >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                          {formatDeltaNumber(row.delta)}
                        </td>
                        <td className={`px-4 py-3 text-right font-bold ${row.deltaPct !== null && row.deltaPct >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                          {row.deltaPct === null ? '—' : `${row.deltaPct >= 0 ? '+' : ''}${row.deltaPct.toFixed(1)}%`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </TremorInsightCard>

          <Grid numItems={1} numItemsLg={2} className="gap-6 annual-page-grid-2">
            <TremorInsightCard title="Average jobs per active day">
              <div className="annual-chart-print-fix h-[320px]">
                <BarChart
                  className="h-full"
                  data={computed.leaderboard.map((row) => ({
                    accountant: row.name,
                    'Avg jobs/day': Number(row.avgJobsPerActiveDay.toFixed(1)),
                  }))}
                  index="accountant"
                  categories={['Avg jobs/day']}
                  colors={['blue']}
                  showLegend={false}
                  showTooltip
                  showAnimation={false}
                  valueFormatter={(value) => Number(value).toFixed(1)}
                  yAxisWidth={42}
                />
              </div>
            </TremorInsightCard>

            <TremorInsightCard title="Weekday distribution">
              <div className="annual-chart-print-fix h-[320px]">
                <BarChart
                  className="h-full"
                  data={computed.weekdayDistribution.map((row) => ({
                    day: row.label,
                    Delivered: row.value,
                  }))}
                  index="day"
                  categories={['Delivered']}
                  colors={['amber']}
                  showLegend={false}
                  showTooltip
                  showAnimation={false}
                  valueFormatter={(value) => formatNumber(Number(value))}
                  yAxisWidth={42}
                />
              </div>
            </TremorInsightCard>
          </Grid>

          <TremorInsightCard title="Insights & talking points">
            <ul className="space-y-3">
              {computed.teamInsights.map((insight) => (
                <li key={insight} className="flex items-start gap-3 text-sm text-slate-700">
                  <span className="mt-1.5 h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
                  <span>{insight}</span>
                </li>
              ))}
            </ul>
          </TremorInsightCard>
        </section>
      </div>
    </div>
  );
};