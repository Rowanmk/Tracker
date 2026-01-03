import React, { useState, useEffect } from 'react';
import { useDate } from '../context/DateContext';
import { useAuth } from '../context/AuthContext';
import { useServices } from '../hooks/useServices';
import { supabase } from '../supabase/client';
import {
  getLast12CompletedMonthsWindow,
  monthYearPairsBetween,
} from '../utils/rollingWindow';
import { getFinancialYearMonths } from '../utils/financialYear';
import { getUkBankHolidaySet } from '../utils/bankHolidays';

/* =========================
   Types
========================= */

interface MonthlyPerformance {
  month: number;
  year: number;
  delivered: number;
  target: number;
  percentAchieved: number;
}

interface StaffAnalytics {
  staff_id: number;
  name: string;
  monthlyPerformance: MonthlyPerformance[];
  consistencyScore: number;
  targetAccuracy: number;
  overDeliveryIndex: number;
  bagelFrequencyRate: number;
  avgBagelDaysPerMonth: number;
  longestNoBagelStreak: number;
  longestBagelStreak: number;
  bagelClusters: number;
  recoverySpeed: number;
}

interface TeamHealthMetrics {
  avgTargetAchieved: number;
  teamBagelRate: number;
  longestNoBagelStreak: number;
  longestBagelStreak: number;
  avgBagelDays: number;
  consistencyScore: number;
  targetAccuracy: number;
  overDeliveryIndex: number;
  recoverySpeed: number;
}

interface RollingPoint {
  year: number;
  month: number;
  percent: number;
}

/* =========================
   Component
========================= */

export const TeamView: React.FC = () => {
  const { financialYear } = useDate();
  const { allStaff, loading: authLoading } = useAuth();
  const { services, loading: servicesLoading } = useServices();

  const [staffAnalytics, setStaffAnalytics] = useState<StaffAnalytics[]>([]);
  const [teamHealthMetrics, setTeamHealthMetrics] =
    useState<TeamHealthMetrics | null>(null);
  const [rollingChartData, setRollingChartData] = useState<RollingPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /* =========================
     Main fetch
  ========================= */

  const fetchAnalyticsData = async () => {
    if (!allStaff.length || !services.length) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      /* ---- Rolling 12 completed months ---- */
      const { start: rollingStart, end: rollingEnd } =
        getLast12CompletedMonthsWindow();

      const rollingStartIso = rollingStart.toISOString().slice(0, 10);
      const rollingEndIso = rollingEnd.toISOString().slice(0, 10);

      let bankHolidays: Set<string> = new Set();
      try {
        bankHolidays = await getUkBankHolidaySet(
          rollingStart,
          rollingEnd,
          'england-and-wales'
        );
      } catch {
        bankHolidays = new Set();
      }

      /* =========================
         STAFF-LEVEL ANALYTICS
      ========================= */

      const staffResults = await Promise.all(
        allStaff.map(async (staff) => {
          const { data: activities } = await supabase
            .from('dailyactivity')
            .select('date, month, year, delivered_count')
            .eq('staff_id', staff.staff_id)
            .gte('date', rollingStartIso)
            .lte('date', rollingEndIso);

          const { data: targets } = await supabase
            .from('monthlytargets')
            .select('month, year, target_value')
            .eq('staff_id', staff.staff_id)
            .gte('year', rollingStart.getFullYear())
            .lte('year', rollingEnd.getFullYear());

          const { data: staffLeave } = await supabase
            .from('staff_leave')
            .select('start_date, end_date')
            .eq('staff_id', staff.staff_id)
            .gte('end_date', rollingStartIso)
            .lte('start_date', rollingEndIso);

          const months = getFinancialYearMonths();
          const monthlyData: Record<
            number,
            { delivered: number; target: number; year: number }
          > = {};

          months.forEach((m) => {
            const year = m.number >= 4 ? financialYear.start : financialYear.end;
            monthlyData[m.number] = { delivered: 0, target: 0, year };
          });

          (activities || []).forEach((a) => {
            if (monthlyData[a.month]) {
              monthlyData[a.month].delivered += a.delivered_count;
            }
          });

          (targets || []).forEach((t) => {
            if (monthlyData[t.month]) {
              monthlyData[t.month].target += t.target_value;
            }
          });

          const monthlyPerformance: MonthlyPerformance[] = months.map((m) => {
            const d = monthlyData[m.number];
            return {
              month: m.number,
              year: d.year,
              delivered: d.delivered,
              target: d.target,
              percentAchieved:
                d.target > 0 ? (d.delivered / d.target) * 100 : 0,
            };
          });

          const percentages = monthlyPerformance
            .filter((m) => m.target > 0)
            .map((m) => m.percentAchieved);

          const consistencyScore =
            percentages.length > 1
              ? 100 -
                Math.min(
                  100,
                  (stdDev(percentages) / mean(percentages)) * 100
                )
              : 100;

          const accurateMonths = monthlyPerformance.filter(
            (m) =>
              m.target > 0 && Math.abs(m.percentAchieved - 100) <= 10
          ).length;

          const targetAccuracy =
            monthlyPerformance.filter((m) => m.target > 0).length > 0
              ? (accurateMonths /
                  monthlyPerformance.filter((m) => m.target > 0).length) *
                100
              : 0;

          const overDeliveryIndex =
            (monthlyPerformance.filter((m) => m.percentAchieved > 120).length /
              Math.max(
                1,
                monthlyPerformance.filter((m) => m.target > 0).length
              )) *
            100;

          const bagel = calculateBagelMetricsWindowed(
            activities || [],
            staffLeave || [],
            rollingStart,
            rollingEnd,
            bankHolidays
          );

          return {
            staff_id: staff.staff_id,
            name: staff.name,
            monthlyPerformance,
            consistencyScore,
            targetAccuracy,
            overDeliveryIndex,
            bagelFrequencyRate: bagel.frequencyRate,
            avgBagelDaysPerMonth: bagel.avgPerMonth,
            longestNoBagelStreak: bagel.longestNoBagelStreak,
            longestBagelStreak: bagel.longestBagelStreak,
            bagelClusters: bagel.clusters,
            recoverySpeed: bagel.recoverySpeed,
          };
        })
      );

      setStaffAnalytics(staffResults);

      /* =========================
         TEAM AGGREGATES
      ========================= */

      const teamConsistency =
  staffResults.reduce(
    (s: number, a: StaffAnalytics) => s + a.consistencyScore,
    0
  ) / staffResults.length;

const teamTargetAccuracy =
  staffResults.reduce(
    (s: number, a: StaffAnalytics) => s + a.targetAccuracy,
    0
  ) / staffResults.length;

const teamOverDelivery =
  staffResults.reduce(
    (s: number, a: StaffAnalytics) => s + a.overDeliveryIndex,
    0
  ) / staffResults.length;

const avgBagelDays =
  staffResults.reduce(
    (s: number, a: StaffAnalytics) => s + a.avgBagelDaysPerMonth,
    0
  ) / staffResults.length;

      /* =========================
         TEAM DELIVERY + TARGETS
      ========================= */

      const { data: teamActivities } = await supabase
        .from('dailyactivity')
        .select('date, delivered_count')
        .gte('date', rollingStartIso)
        .lte('date', rollingEndIso);

      const { data: teamTargets } = await supabase
        .from('monthlytargets')
        .select('month, year, target_value')
        .gte('year', rollingStart.getFullYear())
        .lte('year', rollingEnd.getFullYear());

      const rollingPairs = monthYearPairsBetween(rollingStart, rollingEnd);
      const pairSet = new Set(rollingPairs.map((p) => `${p.year}-${p.month}`));

      const deliveredTotal =
        (teamActivities || []).reduce(
          (s, r) => s + (r.delivered_count || 0),
          0
        );

      const targetTotal =
        (teamTargets || [])
          .filter((t) => pairSet.has(`${t.year}-${t.month}`))
          .reduce((s, t) => s + (t.target_value || 0), 0);

      const avgTargetAchieved =
        targetTotal > 0 ? (deliveredTotal / targetTotal) * 100 : 0;

      /* =========================
         ROLLING 12-MONTH CHART
      ========================= */

      const monthlyDelivered = new Map<string, number>();
      const monthlyTarget = new Map<string, number>();

      (teamActivities || []).forEach((a) => {
        const d = new Date(a.date);
        const key = `${d.getFullYear()}-${d.getMonth() + 1}`;
        monthlyDelivered.set(
          key,
          (monthlyDelivered.get(key) || 0) + a.delivered_count
        );
      });

      (teamTargets || [])
        .filter((t) => pairSet.has(`${t.year}-${t.month}`))
        .forEach((t) => {
          const key = `${t.year}-${t.month}`;
          monthlyTarget.set(
            key,
            (monthlyTarget.get(key) || 0) + t.target_value
          );
        });

      const rollingData: RollingPoint[] = rollingPairs.map((end, idx) => {
        const window = rollingPairs.slice(Math.max(0, idx - 11), idx + 1);

        let delivered = 0;
        let target = 0;

        window.forEach((p) => {
          const key = `${p.year}-${p.month}`;
          delivered += monthlyDelivered.get(key) || 0;
          target += monthlyTarget.get(key) || 0;
        });

        return {
          year: end.year,
          month: end.month,
          percent: target > 0 ? (delivered / target) * 100 : 0,
        };
      });

      setRollingChartData(rollingData);

      /* =========================
         FINAL TEAM METRICS
      ========================= */

      setTeamHealthMetrics({
        avgTargetAchieved,
        teamBagelRate: avgBagelDays * 12 > 0 ? avgBagelDays : 0,
        longestNoBagelStreak: Math.max(
          ...staffResults.map((s) => s.longestNoBagelStreak)
        ),
        longestBagelStreak: Math.max(
          ...staffResults.map((s) => s.longestBagelStreak)
        ),
        avgBagelDays,
        consistencyScore: teamConsistency,
        targetAccuracy: teamTargetAccuracy,
        overDeliveryIndex: teamOverDelivery,
        recoverySpeed: 0,
      });
    } catch (e) {
      console.error(e);
      setError('Failed to load analytics');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalyticsData();
  }, [allStaff.length, services.length]);

  if (loading || authLoading || servicesLoading) {
    return <div className="py-6 text-center text-gray-500">Loading analytics…</div>;
  }

  if (error) {
    return <div className="p-4 bg-red-50 border border-red-200">{error}</div>;
  }

  /* =========================
     UI
  ========================= */

  return (
    <div className="space-y-6">
      {teamHealthMetrics && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Metric label="Team Avg % Target" value={`${Math.round(teamHealthMetrics.avgTargetAchieved)}%`} />
            <Metric label="Avg Bagel Days (12m)" value={teamHealthMetrics.avgBagelDays.toFixed(1)} />
            <Metric label="Longest No-Bagel Streak" value={`${teamHealthMetrics.longestNoBagelStreak} days`} />
            <Metric label="Longest Bagel Streak" value={`${teamHealthMetrics.longestBagelStreak} days`} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Metric label="Consistency Score" value={`${Math.round(teamHealthMetrics.consistencyScore)}%`} />
            <Metric label="Target Accuracy" value={`${Math.round(teamHealthMetrics.targetAccuracy)}%`} />
            <Metric label="Over-Delivery Index" value={`${Math.round(teamHealthMetrics.overDeliveryIndex)}%`} />
            <Metric label="Avg Recovery Speed" value="—" />
          </div>
        </>
      )}

      {rollingChartData.length > 0 && (
        <Rolling12MonthPerformanceChart data={rollingChartData} />
      )}
    </div>
  );
};

/* =========================
   Components & helpers
========================= */

const Metric = ({ label, value }: { label: string; value: string }) => (
  <div className="bg-white p-6 rounded-xl border">
    <div className="text-sm text-gray-500 mb-1">{label}</div>
    <div className="text-3xl font-bold">{value}</div>
  </div>
);

const mean = (a: number[]) =>
  a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0;

const stdDev = (a: number[]) => {
  const m = mean(a);
  return Math.sqrt(mean(a.map((v) => (v - m) ** 2)));
};

/* =========================
   Rolling Chart
========================= */

const Rolling12MonthPerformanceChart = ({
  data,
}: {
  data: RollingPoint[];
}) => {
  const VIEWBOX_HEIGHT = 260;
  const BASELINE_Y = 220;
  const TOP_MARGIN = 20;
  const BAR_AREA_HEIGHT = BASELINE_Y - TOP_MARGIN;

  const BAR_WIDTH = 28;
  const GAP = 14;
  const CHART_WIDTH = data.length * (BAR_WIDTH + GAP) + 60;

  const getBarColor = (v: number) =>
    v >= 100 ? '#008A00' : v >= 90 ? '#FF8A2A' : '#FF3B30';

  return (
    <div className="bg-white rounded-xl border p-6">
      <h3 className="text-lg font-semibold mb-4">
        Rolling 12-Month % of Target Achieved
      </h3>

      <svg viewBox={`0 0 ${CHART_WIDTH} ${VIEWBOX_HEIGHT}`} className="w-full h-64">
        <line x1={40} y1={BASELINE_Y} x2={40} y2={TOP_MARGIN} stroke="#9CA3AF" />
        <line x1={40} y1={BASELINE_Y} x2={CHART_WIDTH - 10} y2={BASELINE_Y} stroke="#001B47" strokeWidth="2" />

        <line
          x1={40}
          x2={CHART_WIDTH - 10}
          y1={BASELINE_Y - BAR_AREA_HEIGHT}
          y2={BASELINE_Y - BAR_AREA_HEIGHT}
          stroke="#6B7280"
          strokeDasharray="6,4"
        />

        {data.map((d, i) => {
          const x = 40 + i * (BAR_WIDTH + GAP) + GAP;
          const h = Math.min(d.percent, 120) / 100 * BAR_AREA_HEIGHT;

          return (
            <g key={`${d.year}-${d.month}`}>
              <rect
                x={x}
                y={BASELINE_Y - h}
                width={BAR_WIDTH}
                height={h}
                rx={4}
                fill={getBarColor(d.percent)}
              />
              <text
                x={x + BAR_WIDTH / 2}
                y={BASELINE_Y - h - 6}
                textAnchor="middle"
                className="text-xs font-bold fill-gray-700"
              >
                {Math.round(d.percent)}%
              </text>
              <text
                x={x + BAR_WIDTH / 2}
                y={BASELINE_Y + 14}
                textAnchor="middle"
                className="text-xs fill-gray-600"
              >
                {new Date(d.year, d.month - 1).toLocaleString('en-GB', {
                  month: 'short',
                })}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};

/* =========================
   Bagel logic
========================= */

function calculateBagelMetricsWindowed(
  activities: any[],
  staffLeave: any[],
  start: Date,
  end: Date,
  bankHolidays: Set<string>
) {
  const working: string[] = [];
  const delivered = new Set<string>();

  const leaveRanges = (staffLeave || []).map((l) => ({
    s: new Date(l.start_date),
    e: new Date(l.end_date),
  }));

  const onLeave = (d: Date) => leaveRanges.some((r) => d >= r.s && d <= r.e);

  const d = new Date(start);
  while (d <= end) {
    const iso = d.toISOString().slice(0, 10);
    const wd = d.getDay();
    if (wd !== 0 && wd !== 6 && !bankHolidays.has(iso) && !onLeave(d)) {
      working.push(iso);
    }
    d.setDate(d.getDate() + 1);
  }

  (activities || []).forEach((a) => {
    if (a.delivered_count > 0) delivered.add(a.date);
  });

  let bagelDays = 0;
  let longestNoBagel = 0;
  let longestBagel = 0;
  let nb = 0;
  let b = 0;

  working.forEach((day) => {
    if (delivered.has(day)) {
      nb++;
      b = 0;
      longestNoBagel = Math.max(longestNoBagel, nb);
    } else {
      b++;
      nb = 0;
      longestBagel = Math.max(longestBagel, b);
      bagelDays++;
    }
  });

  return {
    totalWorkingDays: working.length,
    bagelDays,
    frequencyRate: working.length ? (bagelDays / working.length) * 100 : 0,
    avgPerMonth: bagelDays / 12,
    longestNoBagelStreak: longestNoBagel,
    longestBagelStreak: longestBagel,
    clusters: 0,
    recoverySpeed: 0,
  };
}
