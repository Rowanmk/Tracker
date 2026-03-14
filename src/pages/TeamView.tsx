import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useServices } from '../hooks/useServices';
import { supabase } from '../supabase/client';

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
}

export const TeamView: React.FC = () => {
  const { allStaff, selectedTeamId, loading: authLoading } = useAuth();
  const { services, loading: servicesLoading } = useServices();

  const [statsData, setStatsData] = useState<ServiceStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
        // Determine the 24-month window to calculate a 12-month rolling average for the last 12 completed months
        const end = new Date();
        end.setDate(0); // Last day of the previous month
        end.setHours(23, 59, 59, 999);

        const start24 = new Date(end.getFullYear(), end.getMonth() - 23, 1);
        start24.setHours(0, 0, 0, 0);

        // Filter staff based on selected team
        const filteredStaff = selectedTeamId === "all" || !selectedTeamId
          ? allStaff.filter(s => !s.is_hidden)
          : allStaff.filter(s => !s.is_hidden && String(s.team_id) === selectedTeamId);

        const staffIds = filteredStaff.map(s => s.staff_id);

        if (staffIds.length === 0) {
          setStatsData([]);
          setLoading(false);
          return;
        }

        // Fetch daily activities for the 24-month window
        const { data: activities, error: fetchError } = await supabase
          .from('dailyactivity')
          .select('service_id, date, delivered_count')
          .in('staff_id', staffIds)
          .gte('date', start24.toISOString().slice(0, 10))
          .lte('date', end.toISOString().slice(0, 10));

        if (fetchError) throw fetchError;

        // Group activities by service and YYYY-MM
        const serviceMonthTotals: Record<number, Record<string, number>> = {};
        services.forEach(s => {
          serviceMonthTotals[s.service_id] = {};
        });

        activities?.forEach(a => {
          if (!a.service_id) return;
          const d = new Date(a.date);
          const key = `${d.getFullYear()}-${d.getMonth() + 1}`;
          if (!serviceMonthTotals[a.service_id]) serviceMonthTotals[a.service_id] = {};
          serviceMonthTotals[a.service_id][key] = (serviceMonthTotals[a.service_id][key] || 0) + a.delivered_count;
        });

        // Build an array of the 24 months in chronological order
        const all24Months: Array<{ year: number; month: number }> = [];
        const curr24 = new Date(start24);
        while (curr24 <= end) {
          all24Months.push({ year: curr24.getFullYear(), month: curr24.getMonth() + 1 });
          curr24.setMonth(curr24.getMonth() + 1);
        }

        // Calculate actuals and rolling averages for the last 12 months
        const processedStats = services.map(service => {
          const monthlyActuals = all24Months.map(m => {
            const key = `${m.year}-${m.month}`;
            return serviceMonthTotals[service.service_id]?.[key] || 0;
          });

          const last12Data: MonthlyData[] = [];
          
          // The last 12 months are indices 12 to 23 in the 24-month array
          for (let i = 12; i < 24; i++) {
            const actual = monthlyActuals[i];
            
            // Rolling average is the sum of the current month and the 11 preceding months
            let rollingSum = 0;
            for (let j = i - 11; j &lt;= i; j++) {
              rollingSum += monthlyActuals[j];
            }
            const rollingAverage = rollingSum / 12;

            last12Data.push({
              year: all24Months[i].year,
              month: all24Months[i].month,
              actual,
              rollingAverage
            });
          }

          return {
            service,
            data: last12Data
          };
        });

        setStatsData(processedStats);
      } catch (err) {
        console.error(err);
        setError('Failed to load stats and figures');
      } finally {
        setLoading(false);
      }
    };

    fetchStatsData();
  }, [allStaff, services, selectedTeamId, authLoading, servicesLoading]);

  if (loading || authLoading || servicesLoading) {
    return <div className="py-6 text-center text-gray-500">Loading stats and figures…</div>;
  }

  if (error) {
    return <div className="p-4 bg-red-50 border border-red-200 text-red-800 rounded-md">{error}</div>;
  }

  return (
    <div className="space-y-6">
      <div className="page-header">
        <h2 className="page-title">Stats and figures</h2>
        <p className="page-subtitle">12-month performance actuals and rolling averages</p>
      </div>

      {statsData.length === 0 ? (
        <div className="py-10 text-center text-gray-500 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
          No data available for the selected team.
        </div>
      ) : (
        <div className="space-y-8">
          {statsData.map(stat => {
            const latestMonth = stat.data[11];
            
            return (
              <div key={stat.service.service_id} className="flex flex-col lg:flex-row gap-6">
                {/* Left Tile: Measure Summary */}
                <div className="w-full lg:w-1/4 bg-white dark:bg-gray-800 rounded-xl shadow-md border border-gray-200 dark:border-gray-700 p-6 flex flex-col justify-center items-center text-center transition-all duration-300">
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                    {stat.service.service_name}
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                    Performance Overview
                  </p>
                  
                  <div className="w-full space-y-6">
                    <div className="bg-gray-50 dark:bg-gray-700/50 p-4 rounded-lg">
                      <div className="text-3xl font-extrabold text-[#001B47] dark:text-blue-400">
                        {latestMonth.actual}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider mt-1 font-semibold">
                        Latest Month Actual
                      </div>
                    </div>
                    
                    <div className="bg-orange-50 dark:bg-orange-900/20 p-4 rounded-lg">
                      <div className="text-2xl font-bold text-[#FF8A2A]">
                        {latestMonth.rollingAverage.toFixed(1)}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider mt-1 font-semibold">
                        Current 12m Avg
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right Graph: Bar & Line Chart */}
                <div className="w-full lg:w-3/4 bg-white dark:bg-gray-800 rounded-xl shadow-md border border-gray-200 dark:border-gray-700 p-6 transition-all duration-300">
                  <ServiceComboChart data={stat.data} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

const ServiceComboChart = ({ data }: { data: MonthlyData[] }) => {
  const VIEWBOX_WIDTH = 800;
  const VIEWBOX_HEIGHT = 320;
  const PADDING_TOP = 40;
  const PADDING_BOTTOM = 40;
  const PADDING_LEFT = 50;
  const PADDING_RIGHT = 20;

  const CHART_WIDTH = VIEWBOX_WIDTH - PADDING_LEFT - PADDING_RIGHT;
  const CHART_HEIGHT = VIEWBOX_HEIGHT - PADDING_TOP - PADDING_BOTTOM;

  const maxY = Math.max(...data.map(d => Math.max(d.actual, d.rollingAverage)), 10) * 1.15;

  const getX = (index: number) => PADDING_LEFT + (index * (CHART_WIDTH / 12)) + (CHART_WIDTH / 24);
  const getY = (val: number) => PADDING_TOP + CHART_HEIGHT - (val / maxY) * CHART_HEIGHT;

  const barWidth = (CHART_WIDTH / 12) * 0.5;

  const linePoints = data.map((d, i) => `${getX(i)},${getY(d.rollingAverage)}`).join(' ');

  return (
    <svg viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`} className="w-full h-full min-h-[280px]">
      {/* Legend */}
      <g transform={`translate(${PADDING_LEFT}, 15)`}>
        <rect x="0" y="0" width="12" height="12" fill="#001B47" rx="2" className="dark:fill-blue-500" />
        <text x="18" y="10" className="text-xs fill-gray-600 dark:fill-gray-300 font-medium">Actual Delivered</text>
        
        <line x1="130" y1="6" x2="150" y2="6" stroke="#FF8A2A" strokeWidth="3" />
        <circle cx="140" cy="6" r="4" fill="#FF8A2A" />
        <text x="158" y="10" className="text-xs fill-gray-600 dark:fill-gray-300 font-medium">12-Month Rolling Average</text>
      </g>

      {/* Grid lines */}
      {[0, 0.25, 0.5, 0.75, 1].map(ratio => {
        const y = PADDING_TOP + CHART_HEIGHT - (ratio * CHART_HEIGHT);
        const val = Math.round(ratio * maxY);
        return (
          <g key={ratio}>
            <text x={PADDING_LEFT - 10} y={y + 4} textAnchor="end" className="text-[10px] fill-gray-500 dark:fill-gray-400">
              {val}
            </text>
            <line 
              x1={PADDING_LEFT} 
              y1={y} 
              x2={VIEWBOX_WIDTH - PADDING_RIGHT} 
              y2={y} 
              stroke="#E5E7EB" 
              className="dark:stroke-gray-700" 
              strokeDasharray={ratio === 0 ? "" : "4 4"} 
            />
          </g>
        );
      })}

      {/* Bars */}
      {data.map((d, i) => {
        const x = getX(i);
        const y = getY(d.actual);
        const height = PADDING_TOP + CHART_HEIGHT - y;
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
              <title>Actual: {d.actual}</title>
            </rect>
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

      {/* Line */}
      <polyline
        points={linePoints}
        fill="none"
        stroke="#FF8A2A"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="transition-all duration-500 ease-out"
      />

      {/* Line Dots */}
      {data.map((d, i) => (
        <circle
          key={`dot-${i}`}
          cx={getX(i)}
          cy={getY(d.rollingAverage)}
          r={4}
          fill="#FF8A2A"
          stroke="#fff"
          strokeWidth="2"
          className="dark:stroke-gray-800 transition-all duration-500 ease-out"
        >
          <title>Rolling Avg: {d.rollingAverage.toFixed(1)}</title>
        </circle>
      ))}
    </svg>
  );
};