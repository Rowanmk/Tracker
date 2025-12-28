import React, { useState, useEffect } from 'react';
import { useDate } from '../context/DateContext';
import { useAuth } from '../context/AuthContext';
import { useServices } from '../hooks/useServices';
import { useWorkingDays } from '../hooks/useWorkingDays';
import { supabase } from '../supabase/client';
import { getFinancialYearMonths, getFinancialYearDateRange } from '../utils/financialYear';

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
  bagelClusters: number;
  recoverySpeed: number;
  servicesMix: {
    [service: string]: {
      percentages: number[];
      trend: 'increasing' | 'stable' | 'decreasing';
    };
  };
  leaveImpactComparison: {
    withLeave: number;
    withoutLeave: number;
  };
}

interface TeamHealthMetrics {
  avgTargetAchieved: number;
  teamBagelRate: number;
  performanceBands: {
    excellent: number;
    good: number;
    poor: number;
  };
}

export const TeamView: React.FC = () => {
  const { selectedMonth, selectedFinancialYear } = useDate();
  const { allStaff, loading: authLoading } = useAuth();
  const { services, loading: servicesLoading } = useServices();
  const { teamWorkingDays } = useWorkingDays({
    financialYear: selectedFinancialYear,
    month: selectedMonth,
  });

  const [staffAnalytics, setStaffAnalytics] = useState<StaffAnalytics[]>([]);
  const [teamHealthMetrics, setTeamHealthMetrics] = useState<TeamHealthMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedStaffForChart, setSelectedStaffForChart] = useState<number | null>(null);

  const fetchAnalyticsData = async () => {
    if (allStaff.length === 0 || services.length === 0) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { startDate, endDate } = getFinancialYearDateRange(selectedFinancialYear);
      const today = new Date();

      const analyticsPromises = allStaff.map(async (staff) => {
        // Fetch all activities for the financial year
        const { data: activities } = await supabase
          .from('dailyactivity')
          .select('date, day, month, year, service_id, delivered_count')
          .eq('staff_id', staff.staff_id)
          .gte('date', startDate.toISOString().split('T')[0])
          .lte('date', endDate.toISOString().split('T')[0]);

        // Fetch all targets for the financial year
        const { data: targets } = await supabase
          .from('monthlytargets')
          .select('month, year, service_id, target_value')
          .eq('staff_id', staff.staff_id)
          .in('year', [selectedFinancialYear.start, selectedFinancialYear.end]);

        // Fetch staff leave
        const { data: staffLeave } = await supabase
          .from('staff_leave')
          .select('start_date, end_date')
          .eq('staff_id', staff.staff_id)
          .gte('end_date', startDate.toISOString().split('T')[0])
          .lte('start_date', endDate.toISOString().split('T')[0]);

        // Calculate monthly performance
        const monthlyData: Record<number, { delivered: number; target: number; year: number }> = {};
        const monthlyServices: Record<number, Record<string, number>> = {};

        // Initialize months
        const monthData = getFinancialYearMonths();
        monthData.forEach(m => {
          const year = m.number >= 4 ? selectedFinancialYear.start : selectedFinancialYear.end;
          monthlyData[m.number] = { delivered: 0, target: 0, year };
          monthlyServices[m.number] = {};
          services.forEach(s => {
            monthlyServices[m.number][s.service_name] = 0;
          });
        });

        // Aggregate activities by month
        activities?.forEach(activity => {
          if (monthlyData[activity.month]) {
            monthlyData[activity.month].delivered += activity.delivered_count;
            const service = services.find(s => s.service_id === activity.service_id);
            if (service) {
              monthlyServices[activity.month][service.service_name] += activity.delivered_count;
            }
          }
        });

        // Aggregate targets by month
        targets?.forEach(target => {
          if (monthlyData[target.month]) {
            monthlyData[target.month].target += target.target_value;
          }
        });

        // Calculate monthly performance array
        const monthlyPerformance: MonthlyPerformance[] = monthData.map(m => ({
          month: m.number,
          year: monthlyData[m.number].year,
          delivered: monthlyData[m.number].delivered,
          target: monthlyData[m.number].target,
          percentAchieved: monthlyData[m.number].target > 0 
            ? (monthlyData[m.number].delivered / monthlyData[m.number].target) * 100 
            : 0,
        }));

        // Calculate consistency score (lower variation = higher consistency)
        const percentages = monthlyPerformance
          .filter(m => m.target > 0)
          .map(m => m.percentAchieved);
        
        const consistencyScore = percentages.length > 1
          ? 100 - Math.min(100, (standardDeviation(percentages) / mean(percentages)) * 100)
          : 100;

        // Calculate target accuracy (% of months within ±10% of target)
        const accurateMonths = monthlyPerformance.filter(m => 
          m.target > 0 && Math.abs(m.percentAchieved - 100) <= 10
        ).length;
        const targetAccuracy = monthlyPerformance.filter(m => m.target > 0).length > 0
          ? (accurateMonths / monthlyPerformance.filter(m => m.target > 0).length) * 100
          : 0;

        // Calculate over-delivery index
        const overDeliveryMonths = monthlyPerformance.filter(m => m.percentAchieved > 120).length;
        const overDeliveryIndex = monthlyPerformance.filter(m => m.target > 0).length > 0
          ? (overDeliveryMonths / monthlyPerformance.filter(m => m.target > 0).length) * 100
          : 0;

        // Calculate bagel metrics
        const bagelMetrics = calculateBagelMetrics(activities || [], staffLeave || [], startDate, today);

        // Calculate service mix trend
        const servicesMix: StaffAnalytics['servicesMix'] = {};
        services.forEach(service => {
          const monthlyPercentages = monthData.map(m => {
            const monthTotal = monthlyPerformance.find(mp => mp.month === m.number)?.delivered || 0;
            const serviceDelivered = monthlyServices[m.number][service.service_name] || 0;
            return monthTotal > 0 ? (serviceDelivered / monthTotal) * 100 : 0;
          });
          
          const trend = calculateTrend(monthlyPercentages);
          servicesMix[service.service_name] = {
            percentages: monthlyPercentages,
            trend,
          };
        });

        // Calculate leave impact
        const leaveImpactComparison = calculateLeaveImpact(
          monthlyPerformance,
          staffLeave || [],
          startDate,
          endDate
        );

        return {
          staff_id: staff.staff_id,
          name: staff.name,
          monthlyPerformance,
          consistencyScore,
          targetAccuracy,
          overDeliveryIndex,
          bagelFrequencyRate: bagelMetrics.frequencyRate,
          avgBagelDaysPerMonth: bagelMetrics.avgPerMonth,
          longestNoBagelStreak: bagelMetrics.longestStreak,
          bagelClusters: bagelMetrics.clusters,
          recoverySpeed: bagelMetrics.recoverySpeed,
          servicesMix,
          leaveImpactComparison,
        };
      });

      const analytics = await Promise.all(analyticsPromises);
      setStaffAnalytics(analytics);

      // Calculate team health metrics
      const avgTargetAchieved = analytics.length > 0
        ? analytics.reduce((sum, a) => {
            const avg = a.monthlyPerformance.filter(m => m.target > 0).length > 0
              ? a.monthlyPerformance
                  .filter(m => m.target > 0)
                  .reduce((s, m) => s + m.percentAchieved, 0) / 
                a.monthlyPerformance.filter(m => m.target > 0).length
              : 0;
            return sum + avg;
          }, 0) / analytics.length
        : 0;

      const teamBagelRate = analytics.length > 0
        ? analytics.reduce((sum, a) => sum + a.bagelFrequencyRate, 0) / analytics.length
        : 0;

      const performanceBands = {
        excellent: analytics.filter(a => {
          const avg = a.monthlyPerformance.filter(m => m.target > 0).length > 0
            ? a.monthlyPerformance
                .filter(m => m.target > 0)
                .reduce((s, m) => s + m.percentAchieved, 0) / 
              a.monthlyPerformance.filter(m => m.target > 0).length
            : 0;
          return avg >= 100;
        }).length,
        good: analytics.filter(a => {
          const avg = a.monthlyPerformance.filter(m => m.target > 0).length > 0
            ? a.monthlyPerformance
                .filter(m => m.target > 0)
                .reduce((s, m) => s + m.percentAchieved, 0) / 
              a.monthlyPerformance.filter(m => m.target > 0).length
            : 0;
          return avg >= 80 && avg < 100;
        }).length,
        poor: analytics.filter(a => {
          const avg = a.monthlyPerformance.filter(m => m.target > 0).length > 0
            ? a.monthlyPerformance
                .filter(m => m.target > 0)
                .reduce((s, m) => s + m.percentAchieved, 0) / 
              a.monthlyPerformance.filter(m => m.target > 0).length
            : 0;
          return avg < 80;
        }).length,
      };

      setTeamHealthMetrics({
        avgTargetAchieved,
        teamBagelRate,
        performanceBands,
      });
    } catch (err) {
      console.error('Error fetching analytics:', err);
      setError('Failed to load analytics data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalyticsData();
  }, [selectedFinancialYear, allStaff.length, services.length]);

  const calculateRollingAverage = (data: number[], window: number): number[] => {
    const result: number[] = [];
    for (let i = 0; i < data.length; i++) {
      const start = Math.max(0, i - window + 1);
      const slice = data.slice(start, i + 1);
      result.push(slice.reduce((a, b) => a + b, 0) / slice.length);
    }
    return result;
  };

  const getMomentumLabel = (current: number, previous: number): string => {
    const diff = current - previous;
    if (Math.abs(diff) < 2) return 'Flat';
    return diff > 0 ? 'Improving' : 'Declining';
  };

  if (loading || authLoading || servicesLoading) {
    return <div className="py-6 text-center text-gray-500">Loading analytics...</div>;
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-md">
        <p className="text-red-800">⚠️ {error}</p>
      </div>
    );
  }

  const monthData = getFinancialYearMonths();

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
          Team Analytics & Insights
        </h2>
        <p className="text-gray-600 dark:text-gray-400">
          Long-term performance, consistency, planning quality, and zero-delivery risk analysis for {selectedFinancialYear.label}
        </p>
      </div>

      {/* SECTION 1: TEAM HEALTH OVERVIEW */}
      {teamHealthMetrics && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md border border-gray-200 dark:border-gray-700">
            <div className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">Team Avg % Target</div>
            <div className="text-3xl font-bold text-blue-600 dark:text-blue-400">
              {Math.round(teamHealthMetrics.avgTargetAchieved)}%
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-2">
              {teamHealthMetrics.avgTargetAchieved >= 100 ? '✓ On Track' : '⚠ Below Target'}
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md border border-gray-200 dark:border-gray-700">
            <div className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">Team Bagel Rate</div>
            <div className="text-3xl font-bold text-orange-600 dark:text-orange-400">
              {teamHealthMetrics.teamBagelRate.toFixed(1)}%
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-2">
              Zero-delivery days per month
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md border border-gray-200 dark:border-gray-700">
            <div className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">Performance ≥100%</div>
            <div className="text-3xl font-bold text-green-600 dark:text-green-400">
              {teamHealthMetrics.performanceBands.excellent}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-2">
              Staff members
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md border border-gray-200 dark:border-gray-700">
            <div className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">Performance 80-99%</div>
            <div className="text-3xl font-bold text-yellow-600 dark:text-yellow-400">
              {teamHealthMetrics.performanceBands.good}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-2">
              Staff members
            </div>
          </div>
        </div>
      )}

      {/* SECTION 2: INDIVIDUAL PERFORMANCE TRENDS */}
      <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md border border-gray-200 dark:border-gray-700">
        <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-6">
          Individual Performance Trends
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          Monthly % of Target Achieved with 3-month rolling average
        </p>

        <div className="space-y-8">
          {staffAnalytics.map((staff) => {
            const percentages = staff.monthlyPerformance
              .filter(m => m.target > 0)
              .map(m => m.percentAchieved);
            
            const rollingAvg = calculateRollingAverage(percentages, 3);
            const currentRolling = rollingAvg[rollingAvg.length - 1] || 0;
            const previousRolling = rollingAvg[Math.max(0, rollingAvg.length - 4)] || currentRolling;
            const momentum = getMomentumLabel(currentRolling, previousRolling);

            return (
              <div key={staff.staff_id} className="border-b border-gray-200 dark:border-gray-700 pb-6 last:border-b-0">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h4 className="text-lg font-semibold text-gray-900 dark:text-white">{staff.name}</h4>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Current 3-month avg: <span className="font-bold">{currentRolling.toFixed(1)}%</span> • 
                      Momentum: <span className={`font-bold ${
                        momentum === 'Improving' ? 'text-green-600' : 
                        momentum === 'Declining' ? 'text-red-600' : 
                        'text-gray-600'
                      }`}>{momentum}</span>
                    </p>
                  </div>
                  <button
                    onClick={() => setSelectedStaffForChart(selectedStaffForChart === staff.staff_id ? null : staff.staff_id)}
                    className="px-3 py-1 text-sm bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded hover:bg-blue-200 dark:hover:bg-blue-900/50"
                  >
                    {selectedStaffForChart === staff.staff_id ? 'Hide' : 'Show'} Chart
                  </button>
                </div>

                {selectedStaffForChart === staff.staff_id && (
                  <div className="mt-4 h-64 bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
                    <svg viewBox="0 0 800 200" className="w-full h-full">
                      {/* Grid lines */}
                      {[0, 25, 50, 75, 100, 125, 150].map(y => (
                        <line
                          key={`grid-${y}`}
                          x1="40"
                          y1={200 - (y / 150) * 160}
                          x2="780"
                          y2={200 - (y / 150) * 160}
                          stroke="#E5E7EB"
                          strokeWidth="1"
                          opacity="0.3"
                        />
                      ))}

                      {/* Y-axis labels */}
                      {[0, 50, 100, 150].map(y => (
                        <text
                          key={`label-${y}`}
                          x="35"
                          y={200 - (y / 150) * 160 + 4}
                          textAnchor="end"
                          className="text-xs fill-gray-600 dark:fill-gray-400"
                        >
                          {y}%
                        </text>
                      ))}

                      {/* Actual performance line */}
                      <polyline
                        points={percentages
                          .map((p, i) => {
                            const x = 40 + (i / (percentages.length - 1 || 1)) * 740;
                            const y = 200 - (p / 150) * 160;
                            return `${x},${y}`;
                          })
                          .join(' ')}
                        fill="none"
                        stroke="#3B82F6"
                        strokeWidth="2"
                      />

                      {/* Rolling average line */}
                      <polyline
                        points={rollingAvg
                          .map((p, i) => {
                            const x = 40 + (i / (rollingAvg.length - 1 || 1)) * 740;
                            const y = 200 - (p / 150) * 160;
                            return `${x},${y}`;
                          })
                          .join(' ')}
                        fill="none"
                        stroke="#10B981"
                        strokeWidth="2"
                        strokeDasharray="5,5"
                      />

                      {/* 100% target line */}
                      <line
                        x1="40"
                        y1={200 - (100 / 150) * 160}
                        x2="780"
                        y2={200 - (100 / 150) * 160}
                        stroke="#EF4444"
                        strokeWidth="2"
                        strokeDasharray="3,3"
                      />

                      {/* Data points */}
                      {percentages.map((p, i) => (
                        <circle
                          key={`point-${i}`}
                          cx={40 + (i / (percentages.length - 1 || 1)) * 740}
                          cy={200 - (p / 150) * 160}
                          r="3"
                          fill="#3B82F6"
                        />
                      ))}
                    </svg>
                    <div className="flex gap-6 mt-4 text-xs">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-0.5 bg-blue-500"></div>
                        <span>Actual Performance</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-0.5 bg-green-500" style={{ backgroundImage: 'repeating-linear-gradient(90deg, #10B981 0, #10B981 5px, transparent 5px, transparent 10px)' }}></div>
                        <span>3-Month Rolling Avg</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-0.5 bg-red-500" style={{ backgroundImage: 'repeating-linear-gradient(90deg, #EF4444 0, #EF4444 3px, transparent 3px, transparent 6px)' }}></div>
                        <span>100% Target</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* SECTION 3: CONSISTENCY & PLANNING QUALITY */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md border border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Consistency Score</h3>
          <p className="text-xs text-gray-600 dark:text-gray-400 mb-4">
            Lower month-to-month variation = higher consistency
          </p>
          <div className="space-y-3">
            {staffAnalytics
              .sort((a, b) => b.consistencyScore - a.consistencyScore)
              .map((staff) => (
                <div key={staff.staff_id} className="flex justify-between items-center">
                  <span className="text-sm font-medium text-gray-900 dark:text-white">{staff.name}</span>
                  <div className="flex items-center gap-2">
                    <div className="w-24 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500"
                        style={{ width: `${staff.consistencyScore}%` }}
                      ></div>
                    </div>
                    <span className="text-sm font-bold text-gray-900 dark:text-white w-12 text-right">
                      {Math.round(staff.consistencyScore)}
                    </span>
                  </div>
                </div>
              ))}
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md border border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Target Accuracy</h3>
          <p className="text-xs text-gray-600 dark:text-gray-400 mb-4">
            % of months within ±10% of target
          </p>
          <div className="space-y-3">
            {staffAnalytics
              .sort((a, b) => b.targetAccuracy - a.targetAccuracy)
              .map((staff) => (
                <div key={staff.staff_id} className="flex justify-between items-center">
                  <span className="text-sm font-medium text-gray-900 dark:text-white">{staff.name}</span>
                  <div className="flex items-center gap-2">
                    <div className="w-24 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-green-500"
                        style={{ width: `${staff.targetAccuracy}%` }}
                      ></div>
                    </div>
                    <span className="text-sm font-bold text-gray-900 dark:text-white w-12 text-right">
                      {Math.round(staff.targetAccuracy)}%
                    </span>
                  </div>
                </div>
              ))}
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md border border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Over-Delivery Index</h3>
          <p className="text-xs text-gray-600 dark:text-gray-400 mb-4">
            % of months exceeding target by >20%
          </p>
          <div className="space-y-3">
            {staffAnalytics
              .sort((a, b) => b.overDeliveryIndex - a.overDeliveryIndex)
              .map((staff) => (
                <div key={staff.staff_id} className="flex justify-between items-center">
                  <span className="text-sm font-medium text-gray-900 dark:text-white">{staff.name}</span>
                  <div className="flex items-center gap-2">
                    <div className="w-24 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-purple-500"
                        style={{ width: `${Math.min(staff.overDeliveryIndex, 100)}%` }}
                      ></div>
                    </div>
                    <span className="text-sm font-bold text-gray-900 dark:text-white w-12 text-right">
                      {Math.round(staff.overDeliveryIndex)}%
                    </span>
                  </div>
                </div>
              ))}
          </div>
        </div>
      </div>

      {/* SECTION 4: BAGEL DAY & RELIABILITY ANALYTICS */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md border border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Bagel Frequency Rate</h3>
          <p className="text-xs text-gray-600 dark:text-gray-400 mb-4">
            Zero-delivery days ÷ working days (%)
          </p>
          <div className="space-y-3">
            {staffAnalytics
              .sort((a, b) => a.bagelFrequencyRate - b.bagelFrequencyRate)
              .map((staff) => (
                <div key={staff.staff_id} className="flex justify-between items-center">
                  <span className="text-sm font-medium text-gray-900 dark:text-white">{staff.name}</span>
                  <div className="flex items-center gap-2">
                    <div className="w-24 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-red-500"
                        style={{ width: `${Math.min(staff.bagelFrequencyRate, 100)}%` }}
                      ></div>
                    </div>
                    <span className="text-sm font-bold text-gray-900 dark:text-white w-12 text-right">
                      {staff.bagelFrequencyRate.toFixed(1)}%
                    </span>
                  </div>
                </div>
              ))}
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md border border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Avg Bagel Days/Month</h3>
          <p className="text-xs text-gray-600 dark:text-gray-400 mb-4">
            Average zero-delivery days per month
          </p>
          <div className="space-y-3">
            {staffAnalytics
              .sort((a, b) => a.avgBagelDaysPerMonth - b.avgBagelDaysPerMonth)
              .map((staff) => (
                <div key={staff.staff_id} className="flex justify-between items-center">
                  <span className="text-sm font-medium text-gray-900 dark:text-white">{staff.name}</span>
                  <span className="text-sm font-bold text-gray-900 dark:text-white">
                    {staff.avgBagelDaysPerMonth.toFixed(1)} days
                  </span>
                </div>
              ))}
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md border border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Longest No-Bagel Streak</h3>
          <p className="text-xs text-gray-600 dark:text-gray-400 mb-4">
            Consecutive working days with delivery
          </p>
          <div className="space-y-3">
            {staffAnalytics
              .sort((a, b) => b.longestNoBagelStreak - a.longestNoBagelStreak)
              .map((staff) => (
                <div key={staff.staff_id} className="flex justify-between items-center">
                  <span className="text-sm font-medium text-gray-900 dark:text-white">{staff.name}</span>
                  <span className="text-sm font-bold text-green-600 dark:text-green-400">
                    {staff.longestNoBagelStreak} days
                  </span>
                </div>
              ))}
          </div>
        </div>
      </div>

      {/* SECTION 5: SERVICE MIX & WORKLOAD */}
      <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md border border-gray-200 dark:border-gray-700">
        <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-6">
          Service Mix & Workload Composition
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
          How service proportions change over time
        </p>

        <div className="space-y-8">
          {staffAnalytics.map((staff) => (
            <div key={staff.staff_id} className="border-b border-gray-200 dark:border-gray-700 pb-6 last:border-b-0">
              <h4 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">{staff.name}</h4>
              
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {services.map((service) => {
                  const serviceMix = staff.servicesMix[service.service_name];
                  const trend = serviceMix?.trend || 'stable';
                  const trendIcon = trend === 'increasing' ? '↑' : trend === 'decreasing' ? '↓' : '→';
                  const trendColor = trend === 'increasing' ? 'text-green-600' : trend === 'decreasing' ? 'text-red-600' : 'text-gray-600';

                  return (
                    <div key={service.service_id} className="bg-gray-50 dark:bg-gray-700/50 p-4 rounded-lg">
                      <div className="flex justify-between items-center mb-3">
                        <span className="font-semibold text-gray-900 dark:text-white">{service.service_name}</span>
                        <span className={`text-lg font-bold ${trendColor}`}>{trendIcon}</span>
                      </div>
                      <div className="h-32 bg-white dark:bg-gray-700 rounded p-2">
                        <svg viewBox="0 0 100 80" className="w-full h-full">
                          <polyline
                            points={serviceMix?.percentages
                              .map((p, i) => {
                                const x = (i / (serviceMix.percentages.length - 1 || 1)) * 100;
                                const y = 80 - (p / 100) * 80;
                                return `${x},${y}`;
                              })
                              .join(' ')}
                            fill="none"
                            stroke="#3B82F6"
                            strokeWidth="1.5"
                          />
                          {serviceMix?.percentages.map((p, i) => (
                            <circle
                              key={i}
                              cx={(i / (serviceMix.percentages.length - 1 || 1)) * 100}
                              cy={80 - (p / 100) * 80}
                              r="1.5"
                              fill="#3B82F6"
                            />
                          ))}
                        </svg>
                      </div>
                      <div className="text-xs text-gray-600 dark:text-gray-400 mt-2">
                        Current: {serviceMix?.percentages[serviceMix.percentages.length - 1]?.toFixed(1) || 0}%
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Leave Impact */}
              <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                <p className="text-sm font-medium text-blue-900 dark:text-blue-200 mb-2">Leave Impact</p>
                <div className="flex gap-6 text-sm">
                  <div>
                    <span className="text-gray-600 dark:text-gray-400">With Leave: </span>
                    <span className="font-bold text-blue-600 dark:text-blue-400">
                      {staff.leaveImpactComparison.withLeave.toFixed(1)}%
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-600 dark:text-gray-400">Without Leave: </span>
                    <span className="font-bold text-blue-600 dark:text-blue-400">
                      {staff.leaveImpactComparison.withoutLeave.toFixed(1)}%
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* SECTION 6: ADDITIONAL BAGEL METRICS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md border border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Bagel Clusters</h3>
          <p className="text-xs text-gray-600 dark:text-gray-400 mb-4">
            Occurrences of 2+ consecutive zero-delivery days
          </p>
          <div className="space-y-3">
            {staffAnalytics
              .sort((a, b) => a.bagelClusters - b.bagelClusters)
              .map((staff) => (
                <div key={staff.staff_id} className="flex justify-between items-center">
                  <span className="text-sm font-medium text-gray-900 dark:text-white">{staff.name}</span>
                  <span className="text-sm font-bold text-gray-900 dark:text-white">
                    {staff.bagelClusters} clusters
                  </span>
                </div>
              ))}
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md border border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Recovery Speed</h3>
          <p className="text-xs text-gray-600 dark:text-gray-400 mb-4">
            Avg days until next delivery after bagel day
          </p>
          <div className="space-y-3">
            {staffAnalytics
              .sort((a, b) => a.recoverySpeed - b.recoverySpeed)
              .map((staff) => (
                <div key={staff.staff_id} className="flex justify-between items-center">
                  <span className="text-sm font-medium text-gray-900 dark:text-white">{staff.name}</span>
                  <span className="text-sm font-bold text-gray-900 dark:text-white">
                    {staff.recoverySpeed.toFixed(1)} days
                  </span>
                </div>
              ))}
          </div>
        </div>
      </div>

      {/* SECTION 7: DETAILED PERFORMANCE TABLE */}
      <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md border border-gray-200 dark:border-gray-700">
        <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-6">
          Detailed Performance Metrics
        </h3>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-100 dark:bg-gray-700">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-900 dark:text-white uppercase">Staff</th>
                <th className="px-4 py-3 text-center text-xs font-bold text-gray-900 dark:text-white uppercase">Consistency</th>
                <th className="px-4 py-3 text-center text-xs font-bold text-gray-900 dark:text-white uppercase">Target Accuracy</th>
                <th className="px-4 py-3 text-center text-xs font-bold text-gray-900 dark:text-white uppercase">Over-Delivery</th>
                <th className="px-4 py-3 text-center text-xs font-bold text-gray-900 dark:text-white uppercase">Bagel Rate</th>
                <th className="px-4 py-3 text-center text-xs font-bold text-gray-900 dark:text-white uppercase">Longest Streak</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {staffAnalytics.map((staff, idx) => (
                <tr key={staff.staff_id} className={idx % 2 === 0 ? 'bg-white dark:bg-gray-800' : 'bg-gray-50 dark:bg-gray-750'}>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">{staff.name}</td>
                  <td className="px-4 py-3 text-center text-sm font-bold text-blue-600 dark:text-blue-400">
                    {Math.round(staff.consistencyScore)}
                  </td>
                  <td className="px-4 py-3 text-center text-sm font-bold text-green-600 dark:text-green-400">
                    {Math.round(staff.targetAccuracy)}%
                  </td>
                  <td className="px-4 py-3 text-center text-sm font-bold text-purple-600 dark:text-purple-400">
                    {Math.round(staff.overDeliveryIndex)}%
                  </td>
                  <td className="px-4 py-3 text-center text-sm font-bold text-orange-600 dark:text-orange-400">
                    {staff.bagelFrequencyRate.toFixed(1)}%
                  </td>
                  <td className="px-4 py-3 text-center text-sm font-bold text-gray-900 dark:text-white">
                    {staff.longestNoBagelStreak} days
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

// Helper functions
function mean(arr: number[]): number {
  return arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

function standardDeviation(arr: number[]): number {
  const avg = mean(arr);
  const squareDiffs = arr.map(v => Math.pow(v - avg, 2));
  return Math.sqrt(mean(squareDiffs));
}

function calculateTrend(data: number[]): 'increasing' | 'stable' | 'decreasing' {
  if (data.length < 2) return 'stable';
  const recent = data.slice(-3);
  const older = data.slice(0, Math.max(1, data.length - 3));
  const recentAvg = mean(recent);
  const olderAvg = mean(older);
  const diff = recentAvg - olderAvg;
  if (Math.abs(diff) < 2) return 'stable';
  return diff > 0 ? 'increasing' : 'decreasing';
}

function calculateBagelMetrics(
  activities: any[],
  staffLeave: any[],
  startDate: Date,
  today: Date
) {
  const workingDays: Record<string, boolean> = {};
  const deliveryDays: Record<string, boolean> = {};

  // Mark all working days
  let current = new Date(startDate);
  while (current <= today) {
    const dow = current.getDay();
    const dateStr = current.toISOString().split('T')[0];
    
    // Check if on leave
    const onLeave = staffLeave.some(leave => {
      const leaveStart = new Date(leave.start_date);
      const leaveEnd = new Date(leave.end_date);
      return current >= leaveStart && current <= leaveEnd;
    });

    if (dow !== 0 && dow !== 6 && !onLeave) {
      workingDays[dateStr] = true;
    }

    current.setDate(current.getDate() + 1);
  }

  // Mark delivery days
  activities.forEach(activity => {
    if (activity.delivered_count > 0) {
      deliveryDays[activity.date] = true;
    }
  });

  // Calculate metrics
  const totalWorkingDays = Object.keys(workingDays).length;
  const bagelDays = Object.keys(workingDays).filter(d => !deliveryDays[d]).length;
  const frequencyRate = totalWorkingDays > 0 ? (bagelDays / totalWorkingDays) * 100 : 0;

  // Count months with data
  const monthsWithData = new Set(activities.map(a => `${a.year}-${a.month}`)).size;
  const avgPerMonth = monthsWithData > 0 ? bagelDays / monthsWithData : 0;

  // Find longest no-bagel streak
  const sortedDays = Object.keys(workingDays).sort();
  let longestStreak = 0;
  let currentStreak = 0;
  sortedDays.forEach(day => {
    if (deliveryDays[day]) {
      currentStreak++;
      longestStreak = Math.max(longestStreak, currentStreak);
    } else {
      currentStreak = 0;
    }
  });

  // Count bagel clusters (2+ consecutive bagel days)
  let clusters = 0;
  let inCluster = false;
  sortedDays.forEach(day => {
    if (!deliveryDays[day]) {
      if (!inCluster) {
        inCluster = true;
      }
    } else {
      if (inCluster) {
        clusters++;
      }
      inCluster = false;
    }
  });

  // Calculate recovery speed
  let totalRecoveryDays = 0;
  let recoveryCount = 0;
  for (let i = 0; i < sortedDays.length - 1; i++) {
    if (!deliveryDays[sortedDays[i]]) {
      let j = i + 1;
      while (j < sortedDays.length && !deliveryDays[sortedDays[j]]) {
        j++;
      }
      if (j < sortedDays.length) {
        totalRecoveryDays += j - i;
        recoveryCount++;
      }
    }
  }
  const recoverySpeed = recoveryCount > 0 ? totalRecoveryDays / recoveryCount : 0;

  return {
    frequencyRate,
    avgPerMonth,
    longestStreak,
    clusters,
    recoverySpeed,
  };
}

function calculateLeaveImpact(
  monthlyPerformance: MonthlyPerformance[],
  staffLeave: any[],
  startDate: Date,
  endDate: Date
) {
  const monthsWithLeave = new Set<number>();
  const monthsWithoutLeave = new Set<number>();

  staffLeave.forEach(leave => {
    const leaveStart = new Date(leave.start_date);
    const leaveEnd = new Date(leave.end_date);
    
    let current = new Date(leaveStart);
    while (current <= leaveEnd && current <= endDate) {
      const month = current.getMonth() + 1;
      const year = current.getFullYear();
      monthsWithLeave.add(month);
      current.setDate(current.getDate() + 1);
    }
  });

  monthlyPerformance.forEach(mp => {
    if (!monthsWithLeave.has(mp.month)) {
      monthsWithoutLeave.add(mp.month);
    }
  });

  const withLeavePerf = monthlyPerformance
    .filter(mp => monthsWithLeave.has(mp.month) && mp.target > 0)
    .map(mp => mp.percentAchieved);
  
  const withoutLeavePerf = monthlyPerformance
    .filter(mp => monthsWithoutLeave.has(mp.month) && mp.target > 0)
    .map(mp => mp.percentAchieved);

  const withLeaveAvg = withLeavePerf.length > 0 ? mean(withLeavePerf) : 0;
  const withoutLeaveAvg = withoutLeavePerf.length > 0 ? mean(withoutLeavePerf) : 0;

  return {
    withLeave: withLeaveAvg,
    withoutLeave: withoutLeaveAvg,
  };
}