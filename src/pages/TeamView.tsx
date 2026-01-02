import React, { useState, useEffect } from 'react';
import { useDate } from '../context/DateContext';
import { useAuth } from '../context/AuthContext';
import { useServices } from '../hooks/useServices';
import { supabase } from '../supabase/client';
import { getFinancialYearMonths } from '../utils/financialYear';
import { getLast12CompletedMonthsWindow, monthYearPairsBetween } from '../utils/rollingWindow';
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
  avgTargetAchieved: number; // rolling 12m, volume-weighted
  teamBagelRate: number;     // rolling 12m, bagel ÷ working
  longestNoBagelStreak: number;
  longestBagelStreak: number;
}

/* =========================
   Component
========================= */

export const TeamView: React.FC = () => {
  const { selectedFinancialYear } = useDate();
  const { allStaff, loading: authLoading } = useAuth();
  const { services, loading: servicesLoading } = useServices();

  const [staffAnalytics, setStaffAnalytics] = useState<StaffAnalytics[]>([]);
  const [teamHealthMetrics, setTeamHealthMetrics] = useState<TeamHealthMetrics | null>(null);
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
      /* ---- Rolling 12-month window (completed months only) ---- */
      const { start: rollingStart, end: rollingEnd } = getLast12CompletedMonthsWindow();
      const rollingStartIso = rollingStart.toISOString().slice(0, 10);
      const rollingEndIso = rollingEnd.toISOString().slice(0, 10);

      const bankHolidays = await getUkBankHolidaySet(
        rollingStart,
        rollingEnd,
        'england-and-wales'
      );

      /* =========================================================
         STAFF-LEVEL ANALYTICS (used for tables & charts)
         NOTE: Monthly visuals remain FY-based by design
      ========================================================= */

      const staffResults = await Promise.all(
        allStaff.map(async (staff) => {
          // --- Activities (rolling window) ---
          const { data: activities } = await supabase
            .from('dailyactivity')
            .select('date, month, year, service_id, delivered_count')
            .eq('staff_id', staff.staff_id)
            .gte('date', rollingStartIso)
            .lte('date', rollingEndIso);

          // --- Targets (rolling window, filtered later) ---
          const startYear = rollingStart.getFullYear();
          const endYear = rollingEnd.getFullYear();

          const { data: targets } = await supabase
            .from('monthlytargets')
            .select('month, year, service_id, target_value')
            .eq('staff_id', staff.staff_id)
            .gte('year', startYear)
            .lte('year', endYear);

          // --- Leave (rolling window) ---
          const { data: staffLeave } = await supabase
            .from('staff_leave')
            .select('start_date, end_date')
            .eq('staff_id', staff.staff_id)
            .gte('end_date', rollingStartIso)
            .lte('start_date', rollingEndIso);

          /* ---------- FY-based monthly performance (visuals only) ---------- */
          const months = getFinancialYearMonths();
          const monthlyData: Record<number, { delivered: number; target: number; year: number }> = {};

          months.forEach(m => {
            const year = m.number >= 4 ? selectedFinancialYear.start : selectedFinancialYear.end;
            monthlyData[m.number] = { delivered: 0, target: 0, year };
          });

          (activities || []).forEach(a => {
            if (monthlyData[a.month]) {
              monthlyData[a.month].delivered += a.delivered_count;
            }
          });

          (targets || []).forEach(t => {
            if (monthlyData[t.month]) {
              monthlyData[t.month].target += t.target_value;
            }
          });

          const monthlyPerformance: MonthlyPerformance[] = months.map(m => {
            const d = monthlyData[m.number];
            return {
              month: m.number,
              year: d.year,
              delivered: d.delivered,
              target: d.target,
              percentAchieved: d.target > 0 ? (d.delivered / d.target) * 100 : 0,
            };
          });

          /* ---------- Consistency & accuracy ---------- */
          const percentages = monthlyPerformance.filter(m => m.target > 0).map(m => m.percentAchieved);
          const consistencyScore =
            percentages.length > 1
              ? 100 - Math.min(100, (stdDev(percentages) / mean(percentages)) * 100)
              : 100;

          const accurateMonths = monthlyPerformance.filter(
            m => m.target > 0 && Math.abs(m.percentAchieved - 100) <= 10
          ).length;

          const targetAccuracy =
            monthlyPerformance.filter(m => m.target > 0).length > 0
              ? (accurateMonths / monthlyPerformance.filter(m => m.target > 0).length) * 100
              : 0;

          const overDeliveryIndex =
            monthlyPerformance.filter(m => m.percentAchieved > 120).length /
            Math.max(1, monthlyPerformance.filter(m => m.target > 0).length) *
            100;

          /* ---------- Bagel metrics (rolling window, definitive) ---------- */
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

      /* =========================================================
         TEAM HEADLINE METRICS (rolling 12 completed months ONLY)
      ========================================================= */

      // --- Delivered (volume-weighted) ---
      const { data: teamActivities } = await supabase
        .from('dailyactivity')
        .select('staff_id, date, delivered_count')
        .gte('date', rollingStartIso)
        .lte('date', rollingEndIso);

      const teamDeliveredTotal =
        (teamActivities || []).reduce((s, r) => s + (r.delivered_count || 0), 0);

      // --- Targets (filtered by rolling months) ---
      const rollingPairs = monthYearPairsBetween(rollingStart, rollingEnd);
      const pairSet = new Set(rollingPairs.map(p => `${p.year}-${p.month}`));

      const { data: teamTargets } = await supabase
        .from('monthlytargets')
        .select('month, year, target_value')
        .gte('year', rollingStart.getFullYear())
        .lte('year', rollingEnd.getFullYear());

      const teamTargetTotal =
        (teamTargets || [])
          .filter(t => pairSet.has(`${t.year}-${t.month}`))
          .reduce((s, t) => s + (t.target_value || 0), 0);

      const avgTargetAchieved =
        teamTargetTotal > 0 ? (teamDeliveredTotal / teamTargetTotal) * 100 : 0;

      // --- Bagel aggregation (weighted by working days) ---
      let teamBagelDays = 0;
      let teamWorkingDays = 0;
      let teamLongestNoBagel = 0;
      let teamLongestBagel = 0;

      staffResults.forEach(s => {
        teamBagelDays += s.avgBagelDaysPerMonth * 12;
        teamWorkingDays += (s.avgBagelDaysPerMonth * 12) / (s.bagelFrequencyRate / 100 || 1);
        teamLongestNoBagel = Math.max(teamLongestNoBagel, s.longestNoBagelStreak);
        teamLongestBagel = Math.max(teamLongestBagel, s.longestBagelStreak);
      });

      const teamBagelRate =
        teamWorkingDays > 0 ? (teamBagelDays / teamWorkingDays) * 100 : 0;

      setTeamHealthMetrics({
        avgTargetAchieved,
        teamBagelRate,
        longestNoBagelStreak: teamLongestNoBagel,
        longestBagelStreak: teamLongestBagel,
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
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Metric label="Team Avg % Target" value={`${Math.round(teamHealthMetrics.avgTargetAchieved)}%`} />
          <Metric label="Team Bagel Rate" value={`${teamHealthMetrics.teamBagelRate.toFixed(1)}%`} />
          <Metric label="Longest No-Bagel Streak" value={`${teamHealthMetrics.longestNoBagelStreak} days`} />
          <Metric label="Longest Bagel Streak" value={`${teamHealthMetrics.longestBagelStreak} days`} />
        </div>
      )}
    </div>
  );
};

/* =========================
   Small helpers
========================= */

const Metric = ({ label, value }: { label: string; value: string }) => (
  <div className="bg-white p-6 rounded-xl border">
    <div className="text-sm text-gray-500 mb-1">{label}</div>
    <div className="text-3xl font-bold">{value}</div>
  </div>
);

const mean = (a: number[]) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);

const stdDev = (a: number[]) => {
  const m = mean(a);
  return Math.sqrt(mean(a.map(v => (v - m) ** 2)));
};

/* =========================
   Bagel logic (authoritative)
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

  const leaveRanges = (staffLeave || []).map(l => ({
    s: new Date(l.start_date),
    e: new Date(l.end_date),
  }));

  const onLeave = (d: Date) => leaveRanges.some(r => d >= r.s && d <= r.e);

  const d = new Date(start);
  while (d <= end) {
    const iso = d.toISOString().slice(0, 10);
    const wd = d.getDay();
    if (wd !== 0 && wd !== 6 && !bankHolidays.has(iso) && !onLeave(d)) {
      working.push(iso);
    }
    d.setDate(d.getDate() + 1);
  }

  (activities || []).forEach(a => {
    if (a.delivered_count > 0) delivered.add(a.date);
  });

  let bagelDays = 0;
  let longestNoBagel = 0;
  let longestBagel = 0;
  let nb = 0;
  let b = 0;

  working.forEach(day => {
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
