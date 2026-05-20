import React, { useEffect, useMemo, useState } from 'react';
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

const getBarHeight = (value: number, max: number, chartHeight: number) => {
  if (max <= 0) return 0;
  return (value / max) * chartHeight;
};

const polarToCartesian = (cx: number, cy: number, r: number, angleDeg: number) => {
  const angleRad = ((angleDeg - 90) * Math.PI) / 180.0;
  return {
    x: cx + r * Math.cos(angleRad),
    y: cy + r * Math.sin(angleRad),
  };
};

const describeArc = (cx: number, cy: number, r: number, startAngle: number, endAngle: number) => {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';
  return [`M`, start.x, start.y, `A`, r, r, 0, largeArcFlag, 0, end.x, end.y].join(' ');
};

const getMondayFirstDOW = (dateIso: string) => {
  const date = new Date(`${dateIso}T00:00:00`);
  const raw = date.getDay();
  return raw === 0 ? 6 : raw - 1;
};

const DonutChart: React.FC<{
  data: Array<{ service_name: string; total: number; pct: number; color: string }>;
}> = ({ data }) => {
  const size = 280;
  const strokeWidth = 42;
  const radius = (size - strokeWidth) / 2;
  const center = size / 2;
  let currentAngle = 0;

  return (
    <div className="flex flex-col items-center">
      <svg viewBox={`0 0 ${size} ${size}`} className="w-64 h-64">
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="#E5E7EB"
          strokeWidth={strokeWidth}
        />
        {data.map((segment) => {
          const angle = (segment.pct / 100) * 360;
          const startAngle = currentAngle;
          const endAngle = currentAngle + angle;
          currentAngle += angle;
          if (segment.total <= 0) return null;

          return (
            <path
              key={segment.service_name}
              d={describeArc(center, center, radius, startAngle, endAngle)}
              fill="none"
              stroke={segment.color}
              strokeWidth={strokeWidth}
              strokeLinecap="butt"
            />
          );
        })}
        <circle cx={center} cy={center} r={radius - strokeWidth / 2} fill="white" />
        <text
          x={center}
          y={center - 4}
          textAnchor="middle"
          className="fill-[#001B47]"
          style={{ fontSize: 18, fontWeight: 700 }}
        >
          Service Mix
        </text>
        <text
          x={center}
          y={center + 20}
          textAnchor="middle"
          className="fill-gray-500"
          style={{ fontSize: 12 }}
        >
          12 month total
        </text>
      </svg>

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2 w-full">
        {data.map((segment) => (
          <div key={segment.service_name} className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: segment.color }} />
              <span className="text-sm font-medium text-gray-700 truncate">{segment.service_name}</span>
            </div>
            <span className="text-sm font-bold text-gray-900">{segment.pct.toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
};

const MonthlyStackedBarChart: React.FC<{
  data: MonthKeyData[];
  services: Array<{ service_id: number; service_name: string; color: string }>;
}> = ({ data, services }) => {
  const width = 900;
  const height = 360;
  const chartHeight = 250;
  const chartWidth = 760;
  const left = 56;
  const top = 18;
  const slotWidth = chartWidth / Math.max(data.length, 1);
  const barWidth = Math.min(42, slotWidth * 0.74);
  const maxValue = Math.max(...data.map((month) => month.total), 1);

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-[360px]">
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const y = top + chartHeight - ratio * chartHeight;
          const value = Math.round(maxValue * ratio);
          return (
            <g key={ratio}>
              <text x={left - 8} y={y + 4} textAnchor="end" className="fill-gray-500 text-[10px]">
                {value}
              </text>
              <line x1={left} y1={y} x2={left + chartWidth} y2={y} stroke="#E5E7EB" strokeDasharray={ratio === 0 ? '' : '4 4'} />
            </g>
          );
        })}

        {data.map((month, index) => {
          const x = left + index * slotWidth + (slotWidth - barWidth) / 2;
          let currentY = top + chartHeight;

          return (
            <g key={month.key}>
              {services.map((service) => {
                const value = month.byService[service.service_id] || 0;
                if (value <= 0) return null;
                const segmentHeight = getBarHeight(value, maxValue, chartHeight);
                currentY -= segmentHeight;
                return (
                  <rect
                    key={service.service_id}
                    x={x}
                    y={currentY}
                    width={barWidth}
                    height={segmentHeight}
                    rx={segmentHeight < 8 ? 1 : 2}
                    fill={service.color}
                  >
                    <title>{`${month.longLabel} · ${service.service_name}: ${value}`}</title>
                  </rect>
                );
              })}
              <text x={x + barWidth / 2} y={top + chartHeight + 18} textAnchor="middle" className="fill-gray-600 text-[10px] font-medium">
                {month.label}
              </text>
            </g>
          );
        })}
      </svg>

      <div className="mt-3 flex flex-wrap gap-3">
        {services.map((service) => (
          <div key={service.service_id} className="flex items-center gap-2 text-xs text-gray-600">
            <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: service.color }} />
            <span>{service.service_name}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

const HorizontalStackedLeaderboard: React.FC<{
  rows: LeaderboardRow[];
  services: Array<{ service_id: number; service_name: string; color: string }>;
}> = ({ rows, services }) => {
  const width = 920;
  const rowHeight = 38;
  const left = 150;
  const right = 76;
  const top = 10;
  const chartWidth = width - left - right;
  const height = top + rows.length * rowHeight + 24;
  const maxValue = Math.max(...rows.map((row) => row.total), 1);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto">
      {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
        const x = left + ratio * chartWidth;
        const value = Math.round(maxValue * ratio);
        return (
          <g key={ratio}>
            <line x1={x} y1={top} x2={x} y2={height - 20} stroke="#E5E7EB" strokeDasharray={ratio === 0 ? '' : '4 4'} />
            <text x={x} y={height - 4} textAnchor="middle" className="fill-gray-500 text-[10px]">
              {value}
            </text>
          </g>
        );
      })}

      {rows.map((row, index) => {
        const y = top + index * rowHeight + 8;
        let currentX = left;

        return (
          <g key={row.staff_id}>
            <text x={left - 12} y={y + 12} textAnchor="end" className="fill-gray-700 text-[12px] font-medium">
              {row.name}
            </text>
            {services.map((service) => {
              const value = row.byService[service.service_id] || 0;
              if (value <= 0) return null;
              const segmentWidth = (value / maxValue) * chartWidth;
              const rect = (
                <rect
                  key={service.service_id}
                  x={currentX}
                  y={y}
                  width={segmentWidth}
                  height={16}
                  fill={service.color}
                  rx={2}
                >
                  <title>{`${row.name} · ${service.service_name}: ${value}`}</title>
                </rect>
              );
              currentX += segmentWidth;
              return rect;
            })}
            <text x={left + (row.total / maxValue) * chartWidth + 8} y={y + 12} className="fill-gray-800 text-[12px] font-bold">
              {row.total}
            </text>
          </g>
        );
      })}
    </svg>
  );
};

const HorizontalBarChart: React.FC<{
  rows: Array<{ label: string; value: number }>;
  color?: string;
}> = ({ rows, color = '#0060B8' }) => {
  const width = 900;
  const rowHeight = 34;
  const top = 12;
  const left = 160;
  const right = 70;
  const chartWidth = width - left - right;
  const height = top + rows.length * rowHeight + 18;
  const maxValue = Math.max(...rows.map((row) => row.value), 1);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto">
      {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
        const x = left + ratio * chartWidth;
        return (
          <line
            key={ratio}
            x1={x}
            y1={top}
            x2={x}
            y2={height - 14}
            stroke="#E5E7EB"
            strokeDasharray={ratio === 0 ? '' : '4 4'}
          />
        );
      })}

      {rows.map((row, index) => {
        const y = top + index * rowHeight + 6;
        const barWidth = (row.value / maxValue) * chartWidth;
        return (
          <g key={row.label}>
            <text x={left - 12} y={y + 11} textAnchor="end" className="fill-gray-700 text-[12px] font-medium">
              {row.label}
            </text>
            <rect x={left} y={y} width={barWidth} height={16} rx={3} fill={color} />
            <text x={left + barWidth + 8} y={y + 12} className="fill-gray-800 text-[12px] font-bold">
              {row.value.toFixed(1)}
            </text>
          </g>
        );
      })}
    </svg>
  );
};

const WeekdayBarChart: React.FC<{
  rows: Array<{ label: string; value: number }>;
}> = ({ rows }) => {
  const width = 760;
  const height = 300;
  const left = 40;
  const top = 12;
  const chartHeight = 220;
  const chartWidth = 680;
  const slotWidth = chartWidth / Math.max(rows.length, 1);
  const barWidth = Math.min(54, slotWidth * 0.62);
  const maxValue = Math.max(...rows.map((row) => row.value), 1);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-[300px]">
      {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
        const y = top + chartHeight - ratio * chartHeight;
        const value = Math.round(maxValue * ratio);
        return (
          <g key={ratio}>
            <text x={left - 8} y={y + 4} textAnchor="end" className="fill-gray-500 text-[10px]">
              {value}
            </text>
            <line x1={left} y1={y} x2={left + chartWidth} y2={y} stroke="#E5E7EB" strokeDasharray={ratio === 0 ? '' : '4 4'} />
          </g>
        );
      })}

      {rows.map((row, index) => {
        const x = left + index * slotWidth + (slotWidth - barWidth) / 2;
        const barHeight = getBarHeight(row.value, maxValue, chartHeight);
        const y = top + chartHeight - barHeight;

        return (
          <g key={row.label}>
            <rect x={x} y={y} width={barWidth} height={barHeight} rx={4} fill="#FF8A2A" />
            <text x={x + barWidth / 2} y={y - 6} textAnchor="middle" className="fill-gray-700 text-[11px] font-bold">
              {row.value}
            </text>
            <text x={x + barWidth / 2} y={top + chartHeight + 18} textAnchor="middle" className="fill-gray-600 text-[10px] font-medium">
              {row.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
};

const ReportCard: React.FC<{ title?: string; className?: string; children: React.ReactNode }> = ({
  title,
  className = '',
  children,
}) => (
  <div className={`bg-white rounded-xl shadow-md border border-gray-200 tile-brand overflow-hidden ${className}`}>
    {title ? <div className="tile-header px-4 py-2">{title}</div> : null}
    <div className="p-4">{children}</div>
  </div>
);

const KpiTile: React.FC<{
  label: string;
  value: string;
  subValue?: string;
}> = ({ label, value, subValue }) => (
  <div className="bg-white rounded-xl shadow-md border border-gray-200 tile-brand overflow-hidden">
    <div className="tile-header px-4 py-2">{label}</div>
    <div className="min-h-[132px] p-4 flex flex-col justify-between">
      <div className="flex-1 flex items-center">
        <div className="text-3xl md:text-[2rem] leading-tight font-extrabold text-[#001B47] break-words">
          {value}
        </div>
      </div>
      <div className="pt-3 min-h-[44px] flex items-end">
        {subValue ? <div className="text-sm text-gray-500 leading-snug">{subValue}</div> : <div />}
      </div>
    </div>
  </div>
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

            .tile-brand,
            .annual-card {
              break-inside: avoid;
              page-break-inside: avoid;
              box-shadow: none !important;
            }

            .annual-page-grid-2 {
              grid-template-columns: 1fr 1fr !important;
            }

            .annual-page-grid-4 {
              grid-template-columns: 1fr 1fr 1fr 1fr !important;
            }

            .annual-tight-svg {
              height: auto !important;
              max-height: 230px !important;
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
          <div className="bg-white rounded-xl shadow-md border border-gray-200 tile-brand overflow-hidden">
            <div className="tile-header px-4 py-2">Delivery Insights Overview</div>
            <div className="p-4">
              <h3 className="text-2xl font-bold text-[#001B47]">{computed.headerTitle}</h3>
              <p className="mt-2 text-sm text-gray-500">Reporting period ends {selectedPeriodLabel}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 annual-page-grid-4">
            <KpiTile
              label="Total jobs delivered"
              value={formatNumber(computed.totalJobsDelivered)}
            />
            <KpiTile
              label="Year-on-year change"
              value={`${formatDeltaNumber(computed.yoyChangeAbs)} · ${formatPct(computed.yoyChangePct, 1)}`}
              subValue={`Prior 12m: ${formatNumber(computed.priorTotalJobsDelivered)}`}
            />
            <KpiTile
              label="Peak month"
              value={computed.peakMonth ? `${computed.peakMonth.label}` : '—'}
              subValue={computed.peakMonth ? `${formatNumber(computed.peakMonth.total)} jobs` : 'No data'}
            />
            <KpiTile
              label="Active delivery days"
              value={formatNumber(computed.activeDeliveryDays)}
              subValue={`Avg ${computed.avgJobsPerActiveDay.toFixed(1)} jobs/day`}
            />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-[2fr_1fr] gap-6 annual-page-grid-2">
            <ReportCard title="Monthly deliveries by service" className="annual-card">
              <div className="annual-tight-svg">
                <MonthlyStackedBarChart data={computed.monthlyServiceData} services={printableServiceLegend} />
              </div>
            </ReportCard>

            <ReportCard title="Service mix" className="annual-card">
              <DonutChart data={computed.donutData} />
            </ReportCard>
          </div>

          <ReportCard title="What jumped out" className="annual-card">
            <ul className="space-y-3">
              {computed.overviewInsights.map((insight) => (
                <li key={insight} className="flex items-start gap-3 text-sm text-gray-700">
                  <span className="mt-1 w-2 h-2 rounded-full bg-[#FF8A2A] shrink-0" />
                  <span>{insight}</span>
                </li>
              ))}
            </ul>
          </ReportCard>
        </section>

        <section className="annual-page annual-page-break space-y-6">
          <div className="bg-white rounded-xl shadow-md border border-gray-200 tile-brand overflow-hidden">
            <div className="tile-header px-4 py-2">Team & Rhythm</div>
            <div className="p-4">
              <h3 className="text-2xl font-bold text-[#001B47]">{computed.headerTitle}</h3>
              <p className="mt-2 text-sm text-gray-500">Page 2 · Team contribution, cadence and talking points</p>
            </div>
          </div>

          <ReportCard title="Team leaderboard" className="annual-card">
            <HorizontalStackedLeaderboard rows={computed.leaderboard} services={printableServiceLegend} />
          </ReportCard>

          <ReportCard title="Year-on-year per accountant" className="annual-card">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase text-gray-500">Accountant</th>
                    <th className="px-4 py-3 text-right text-xs font-bold uppercase text-gray-500">Current 12m</th>
                    <th className="px-4 py-3 text-right text-xs font-bold uppercase text-gray-500">Prior 12m</th>
                    <th className="px-4 py-3 text-right text-xs font-bold uppercase text-gray-500">Δ</th>
                    <th className="px-4 py-3 text-right text-xs font-bold uppercase text-gray-500">Δ %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {computed.accountantYoY.map((row) => {
                    const highlightClass =
                      row.deltaPct !== null && row.deltaPct > 50
                        ? 'bg-green-50'
                        : row.deltaPct !== null && row.deltaPct < -25
                        ? 'bg-red-50'
                        : '';
                    return (
                      <tr key={row.staff_id} className={highlightClass}>
                        <td className="px-4 py-3 font-medium text-gray-900">{row.name}</td>
                        <td className="px-4 py-3 text-right text-gray-700">{formatNumber(row.current)}</td>
                        <td className="px-4 py-3 text-right text-gray-700">{formatNumber(row.prior)}</td>
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
          </ReportCard>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 annual-page-grid-2">
            <ReportCard title="Average jobs per active day" className="annual-card">
              <HorizontalBarChart
                rows={computed.leaderboard.map((row) => ({
                  label: row.name,
                  value: row.avgJobsPerActiveDay,
                }))}
                color="#0060B8"
              />
            </ReportCard>

            <ReportCard title="Weekday distribution" className="annual-card">
              <WeekdayBarChart rows={computed.weekdayDistribution} />
            </ReportCard>
          </div>

          <ReportCard title="Insights & talking points" className="annual-card">
            <ul className="space-y-3">
              {computed.teamInsights.map((insight) => (
                <li key={insight} className="flex items-start gap-3 text-sm text-gray-700">
                  <span className="mt-1 w-2 h-2 rounded-full bg-[#0060B8] shrink-0" />
                  <span>{insight}</span>
                </li>
              ))}
            </ul>
          </ReportCard>
        </section>
      </div>
    </div>
  );
};