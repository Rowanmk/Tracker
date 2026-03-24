import React, { useState, useEffect } from 'react';
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

const isAccountant = (role: string) => {
  const normalizedRole = (role || '').toLowerCase();
  return normalizedRole === 'staff' || normalizedRole === 'admin';
};

export const TeamView: React.FC = () => {
  const { allStaff, selectedTeamId, loading: authLoading } = useAuth();
  const { services, loading: servicesLoading } = useServices();

  const [statsData, setStatsData] = useState<ServiceStats[]>([]);
  const [activeServiceId, setActiveServiceId] = useState<number | null>(null);
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

        const visibleAccountants = allStaff.filter(s => !s.is_hidden && isAccountant(s.role));

        const filteredStaff =
          selectedTeamId === 'team-view' || selectedTeamId === 'all' || !selectedTeamId
            ? visibleAccountants
            : visibleAccountants.filter(s => String(s.staff_id) === selectedTeamId);

        const staffIds = filteredStaff.map(s => s.staff_id);

        if (staffIds.length === 0) {
          setStatsData([]);
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

        const { data: targets, error: targetsError } = await supabase
          .from('monthlytargets')
          .select('staff_id, month, year, target_value')
          .in('staff_id', staffIds)
          .gte('year', firstMonth.year)
          .lte('year', lastMonth.year);

        if (targetsError) throw targetsError;

        const { data: bankHolidays } = await supabase
          .from('bank_holidays')
          .select('date, region')
          .gte('date', startDateStr)
          .lte('date', endDateStr);

        let finalActivities = activities || [];
        const bagelService = services.find(s => s.service_name === 'Bagel Days');

        if (bagelService && bankHolidays) {
          const [sYear, sMonth, sDay] = startDateStr.split('-').map(Number);
          const localStartDate = new Date(sYear, sMonth - 1, sDay);

          const [eYear, eMonth, eDay] = endDateStr.split('-').map(Number);
          const localEndDate = new Date(eYear, eMonth - 1, eDay);

          const bagels = generateBagelDays(
            finalActivities,
            bankHolidays,
            filteredStaff,
            bagelService.service_id,
            localStartDate,
            localEndDate
          );
          finalActivities = [...finalActivities, ...bagels];
        }

        const displayServices = services;

        const serviceMonthTotals: Record<number, Record<string, number>> = {};
        displayServices.forEach(s => {
          serviceMonthTotals[s.service_id] = {};
        });

        const monthActuals: Record<string, number> = {};

        finalActivities.forEach(a => {
          if (!a.service_id || !a.date) return;
          const service = services.find(s => s.service_id === a.service_id);
          if (!service) return;

          const [yearStr, monthStr] = a.date.split('-');
          const key = `${parseInt(yearStr, 10)}-${parseInt(monthStr, 10)}`;

          if (!serviceMonthTotals[a.service_id]) serviceMonthTotals[a.service_id] = {};
          serviceMonthTotals[a.service_id][key] = (serviceMonthTotals[a.service_id][key] || 0) + (a.delivered_count || 0);

          if (service.service_name !== 'Bagel Days') {
            monthActuals[key] = (monthActuals[key] || 0) + (a.delivered_count || 0);
          }
        });

        const monthTargets: Record<string, number> = {};
        targets?.forEach(t => {
          const key = `${t.year}-${t.month}`;
          monthTargets[key] = (monthTargets[key] || 0) + (t.target_value || 0);
        });

        const processedStats: ServiceStats[] = displayServices.map(service => {
          const monthlyActuals = all24Months.map(m => {
            const key = `${m.year}-${m.month}`;
            return serviceMonthTotals[service.service_id]?.[key] || 0;
          });

          const last12Data: MonthlyData[] = [];

          for (let i = 12; i < 24; i++) {
            const actual = monthlyActuals[i];

            let rollingSum = 0;
            for (let j = i - 11; j <= i; j++) {
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

        const percentData: MonthlyData[] = [];

        for (let i = 12; i < 24; i++) {
          const currentMonth = all24Months[i];
          const currentKey = `${currentMonth.year}-${currentMonth.month}`;
          const currentActual = monthActuals[currentKey] || 0;
          const currentTarget = monthTargets[currentKey] || 0;
          const actualPercent = currentTarget > 0 ? (currentActual / currentTarget) * 100 : 0;

          let rollingActualSum = 0;
          let rollingTargetSum = 0;
          for (let j = i - 11; j <= i; j++) {
            const jMonth = all24Months[j];
            const jKey = `${jMonth.year}-${jMonth.month}`;
            rollingActualSum += monthActuals[jKey] || 0;
            rollingTargetSum += monthTargets[jKey] || 0;
          }
          const rollingAverage = rollingTargetSum > 0 ? (rollingActualSum / rollingTargetSum) * 100 : 0;

          percentData.push({
            year: currentMonth.year,
            month: currentMonth.month,
            actual: Math.round(actualPercent),
            rollingAverage
          });
        }

        processedStats.push({
          service: {
            service_id: -1,
            service_name: '% of Target Achieved'
          },
          data: percentData,
          isPercentage: true
        });

        setStatsData(processedStats);
      } catch {
        setError('Failed to load Stats and Figures');
      } finally {
        setLoading(false);
      }
    };

    void fetchStatsData();
  }, [allStaff, services, selectedTeamId, authLoading, servicesLoading]);

  useEffect(() => {
    if (statsData.length > 0) {
      if (!activeServiceId || !statsData.find(s => s.service.service_id === activeServiceId)) {
        setActiveServiceId(statsData[0].service.service_id);
      }
    }
  }, [statsData, activeServiceId]);

  if (loading || authLoading || servicesLoading) {
    return <div className="py-6 text-center text-gray-500">Loading Stats and Figures…</div>;
  }

  if (error) {
    return <div className="p-4 bg-red-50 border border-red-200 text-red-800 rounded-md">{error}</div>;
  }

  const activeStat = statsData.find(s => s.service.service_id === activeServiceId);

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
            {statsData.map(stat => {
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
                </div>
                <div className="bg-gray-50 dark:bg-gray-700/50 px-4 py-2 rounded-lg border border-gray-100 dark:border-gray-600 text-right">
                  <div className="text-xs text-gray-500 dark:text-gray-400 font-semibold uppercase tracking-wider">
                    Latest Month Actual
                  </div>
                  <div className="text-2xl font-bold text-[#001B47] dark:text-blue-400">
                    {activeStat.data[11].actual}{activeStat.isPercentage ? '%' : ''}
                  </div>
                </div>
              </div>

              <div className="w-full h-[400px]">
                <ServiceComboChart data={activeStat.data} isPercentage={activeStat.isPercentage} />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const ServiceComboChart = ({ data, isPercentage }: { data: MonthlyData[], isPercentage?: boolean }) => {
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

      {[0, 0.25, 0.5, 0.75, 1].map(ratio => {
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