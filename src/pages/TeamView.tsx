import React, { useState, useEffect } from 'react';
import { useDate } from '../context/DateContext';
import { useAuth } from '../context/AuthContext';
import { useServices } from '../hooks/useServices';
import { supabase } from '../supabase/client';
import {
  getLast12CompletedMonthsWindow,
  monthYearPairsBetween,
} from '../utils/rollingWindow';
import { getUkBankHolidaySet } from '../utils/bankHolidays';

interface MonthlyPerformance {
  month: number;
  year: number;
  delivered: number;
  target: number;
  percentAchieved: number;
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
}

interface RollingPoint {
  year: number;
  month: number;
  percent: number;
}

export const TeamView: React.FC = () => {
  const { financialYear } = useDate();
  const { selectedTeamId, allStaff, teams } = useAuth();
  const { services, loading: servicesLoading } = useServices();

  const [teamHealthMetrics, setTeamHealthMetrics] = useState<TeamHealthMetrics | null>(null);
  const [rollingChartData, setRollingChartData] = useState<RollingPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isAllTeams = selectedTeamId === "all";
  const selectedTeam = !isAllTeams ? teams.find(t => t.id.toString() === selectedTeamId) : null;

  const fetchAnalyticsData = async () => {
    if (!allStaff.length || !services.length) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { start: rollingStart, end: rollingEnd } = getLast12CompletedMonthsWindow();
      const rollingStartIso = rollingStart.toISOString().slice(0, 10);
      const rollingEndIso = rollingEnd.toISOString().slice(0, 10);

      const bankHolidays = await getUkBankHolidaySet(rollingStart, rollingEnd, 'england-and-wales');

      const filteredStaff = isAllTeams 
        ? allStaff 
        : allStaff.filter(s => s.team_id?.toString() === selectedTeamId);
      
      const staffIds = filteredStaff.map(s => s.staff_id);

      const { data: activities } = await supabase
        .from('dailyactivity')
        .select('date, month, year, delivered_count, staff_id')
        .in('staff_id', staffIds)
        .gte('date', rollingStartIso)
        .lte('date', rollingEndIso);

      const { data: targets } = await supabase
        .from('monthlytargets')
        .select('month, year, target_value, staff_id')
        .in('staff_id', staffIds)
        .gte('year', rollingStart.getFullYear())
        .lte('year', rollingEnd.getFullYear());

      const rollingPairs = monthYearPairsBetween(rollingStart, rollingEnd);
      
      const teamMonthlyPerformance: MonthlyPerformance[] = rollingPairs.map(p => {
        const monthActivities = activities?.filter(a => a.month === p.month && a.year === p.year) || [];
        const monthTargets = targets?.filter(t => t.month === p.month && t.year === p.year) || [];
        
        const delivered = monthActivities.reduce((s, a) => s + a.delivered_count, 0);
        const target = monthTargets.reduce((s, t) => s + t.target_value, 0);
        
        return {
          month: p.month,
          year: p.year,
          delivered,
          target,
          percentAchieved: target > 0 ? (delivered / target) * 100 : 0
        };
      });

      const percentages = teamMonthlyPerformance.filter(m => m.target > 0).map(m => m.percentAchieved);
      const consistencyScore = percentages.length > 1 ? 100 - Math.min(100, (stdDev(percentages) / mean(percentages)) * 100) : 100;
      
      const accurateMonths = teamMonthlyPerformance.filter(m => m.target > 0 && Math.abs(m.percentAchieved - 100) <= 10).length;
      const targetAccuracy = percentages.length > 0 ? (accurateMonths / percentages.length) * 100 : 0;
      
      const overDeliveryIndex = (teamMonthlyPerformance.filter(m => m.percentAchieved > 120).length / Math.max(1, percentages.length)) * 100;

      const bagel = calculateBagelMetricsWindowed(
        activities || [],
        rollingStart,
        rollingEnd,
        bankHolidays
      );

      const deliveredTotal = (activities || []).reduce((s, r) => s + (r.delivered_count || 0), 0);
      const targetTotal = (targets || []).reduce((s, t) => s + (t.target_value || 0), 0);

      setTeamHealthMetrics({
        avgTargetAchieved: targetTotal > 0 ? (deliveredTotal / targetTotal) * 100 : 0,
        teamBagelRate: bagel.frequencyRate,
        longestNoBagelStreak: bagel.longestNoBagelStreak,
        longestBagelStreak: bagel.longestBagelStreak,
        avgBagelDays: bagel.avgPerMonth,
        consistencyScore,
        targetAccuracy,
        overDeliveryIndex,
      });

      const rollingData: RollingPoint[] = rollingPairs.map((end, idx) => {
        const window = teamMonthlyPerformance.slice(Math.max(0, idx - 11), idx + 1);
        const delivered = window.reduce((s, m) => s + m.delivered, 0);
        const target = window.reduce((s, m) => s + m.target, 0);

        return {
          year: end.year,
          month: end.month,
          percent: target > 0 ? (delivered / target) * 100 : 0,
        };
      });

      setRollingChartData(rollingData);

    } catch (e) {
      console.error(e);
      setError('Failed to load analytics');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalyticsData();
  }, [selectedTeamId, allStaff.length, services.length]);

  if (loading || servicesLoading) return <div className="py-6 text-center text-gray-500">Loading analytics…</div>;
  if (error) return <div className="p-4 bg-red-50 border border-red-200">{error}</div>;

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">
        {isAllTeams ? "All Teams Analytics" : `${selectedTeam?.name} Analytics`}
      </h2>

      {teamHealthMetrics && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Metric label="Team Avg % Target" value={`${Math.round(teamHealthMetrics.avgTargetAchieved)}%`} />
            <Metric label="Avg Bagel Days (12m)" value={teamHealthMetrics.avgBagelDays.toFixed(1)} />
            <Metric label="Longest No-Bagel Streak" value={`${teamHealthMetrics.longestNoBagelStreak} days`} />
            <Metric label="Longest Bagel Streak" value={`${teamHealthMetrics.longestBagelStreak} days`} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Metric label="Consistency Score" value={`${Math.round(teamHealthMetrics.consistencyScore)}%`} />
            <Metric label="Target Accuracy" value={`${Math.round(teamHealthMetrics.targetAccuracy)}%`} />
            <Metric label="Over-Delivery Index" value={`${Math.round(teamHealthMetrics.overDeliveryIndex)}%`} />
          </div>
        </>
      )}

      {rollingChartData.length > 0 && (
        <Rolling12MonthPerformanceChart data={rollingChartData} />
      )}
    </div>
  );
};

const Metric = ({ label, value }: { label: string; value: string }) => (
  <div className="bg-white p-6 rounded-xl border shadow-sm">
    <div className="text-sm text-gray-500 mb-1">{label}</div>
    <div className="text-3xl font-bold text-[#001B47]">{value}</div>
  </div>
);

const mean = (a: number[]) => a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0;
const stdDev = (a: number[]) => {
  const m = mean(a);
  return Math.sqrt(mean(a.map((v) => (v - m) ** 2)));
};

const Rolling12MonthPerformanceChart = ({ data }: { data: RollingPoint[] }) => {
  const VIEWBOX_HEIGHT = 260;
  const BASELINE_Y = 220;
  const TOP_MARGIN = 20;
  const BAR_AREA_HEIGHT = BASELINE_Y - TOP_MARGIN;
  const BAR_WIDTH = 28;
  const GAP = 14;
  const CHART_WIDTH = data.length * (BAR_WIDTH + GAP) + 60;

  const getBarColor = (v: number) => v >= 100 ? '#008A00' : v >= 90 ? '#FF8A2A' : '#FF3B30';

  return (
    <div className="bg-white rounded-xl border p-6 shadow-sm">
      <h3 className="text-lg font-semibold mb-4">Rolling 12-Month % of Target Achieved</h3>
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${CHART_WIDTH} ${VIEWBOX_HEIGHT}`} className="h-64 min-w-full">
          <line x1={40} y1={BASELINE_Y} x2={40} y2={TOP_MARGIN} stroke="#9CA3AF" />
          <line x1={40} y1={BASELINE_Y} x2={CHART_WIDTH - 10} y2={BASELINE_Y} stroke="#001B47" strokeWidth="2" />
          <line x1={40} x2={CHART_WIDTH - 10} y1={BASELINE_Y - BAR_AREA_HEIGHT} y2={BASELINE_Y - BAR_AREA_HEIGHT} stroke="#6B7280" strokeDasharray="6,4" />

          {data.map((d, i) => {
            const x = 40 + i * (BAR_WIDTH + GAP) + GAP;
            const h = Math.min(d.percent, 120) / 100 * BAR_AREA_HEIGHT;
            return (
              <g key={`${d.year}-${d.month}`}>
                <rect x={x} y={BASELINE_Y - h} width={BAR_WIDTH} height={h} rx={4} fill={getBarColor(d.percent)} />
                <text x={x + BAR_WIDTH / 2} y={BASELINE_Y - h - 6} textAnchor="middle" className="text-xs font-bold fill-gray-700">{Math.round(d.percent)}%</text>
                <text x={x + BAR_WIDTH / 2} y={BASELINE_Y + 14} textAnchor="middle" className="text-xs fill-gray-600">
                  {new Date(d.year, d.month - 1).toLocaleString('en-GB', { month: 'short' })}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
};

function calculateBagelMetricsWindowed(activities: any[], start: Date, end: Date, bankHolidays: Set<string>) {
  const working: string[] = [];
  const deliveredByDate = new Set<string>();

  const d = new Date(start);
  while (d <= end) {
    const iso = d.toISOString().slice(0, 10);
    const wd = d.getDay();
    if (wd !== 0 && wd !== 6 && !bankHolidays.has(iso)) working.push(iso);
    d.setDate(d.getDate() + 1);
  }

  activities.forEach(a => { if (a.delivered_count > 0) deliveredByDate.add(a.date); });

  let bagelDays = 0;
  let longestNoBagel = 0;
  let longestBagel = 0;
  let nb = 0;
  let b = 0;

  working.forEach((day) => {
    if (deliveredByDate.has(day)) {
      nb++; b = 0;
      longestNoBagel = Math.max(longestNoBagel, nb);
    } else {
      b++; nb = 0;
      longestBagel = Math.max(longestBagel, b);
      bagelDays++;
    }
  });

  return {
    frequencyRate: working.length ? (bagelDays / working.length) * 100 : 0,
    avgPerMonth: bagelDays / 12,
    longestNoBagelStreak: longestNoBagel,
    longestBagelStreak: longestBagel,
  };
}