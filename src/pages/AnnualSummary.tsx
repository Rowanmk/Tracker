import React, { useState, useEffect } from 'react';
import { useDate } from '../context/DateContext';
import { useAuth } from '../context/AuthContext';
import { useServices } from '../hooks/useServices';
import { useWorkingDays } from '../hooks/useWorkingDays';
import { PerformancePrediction } from '../components/PerformancePrediction';
import { supabase } from '../supabase/client';
import { getFinancialYearDateRange, getFinancialYearMonths } from '../utils/financialYear';

interface AnnualData {
  staff_id: number;
  name: string;
  months: {
    [key: number]: {
      total: number;
      services: {
        [key: string]: number;
      };
    };
  };
  totalDeliveries: number;
  busiestDay: { day: number; count: number } | null;
  averageMonthlyDeliveries: number;
}

const getRolling12MonthRange = (month: number, year: number) => {
  const endDate = new Date(year, month - 1, 1);
  endDate.setMonth(endDate.getMonth() + 1);
  endDate.setDate(0); // end of previous month

  const startDate = new Date(endDate);
  startDate.setMonth(startDate.getMonth() - 11);
  startDate.setDate(1);

  return { startDate, endDate };
};

export const AnnualSummary: React.FC = () => {
  const { selectedMonth, selectedFinancialYear } = useDate();
  const { allStaff, currentStaff, isAdmin, selectedStaffId, loading: authLoading } = useAuth();
  const { services, loading: servicesLoading } = useServices();

  const [annualData, setAnnualData] = useState<AnnualData[]>([]);
  const [showServiceBreakdown, setShowServiceBreakdown] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const currentMonth = selectedMonth;
  const currentYear =
    selectedMonth >= 4
      ? selectedFinancialYear.start
      : selectedFinancialYear.end;

  const { workingDays, workingDaysUpToToday } = useWorkingDays({
    financialYear: selectedFinancialYear,
    month: selectedMonth,
  });

  const fetchAnnualData = async () => {
    try {
      setLoading(true);

      const { startDate, endDate } = getFinancialYearDateRange(selectedFinancialYear);
      const { startDate: rollingStart, endDate: rollingEnd } =
        getRolling12MonthRange(selectedMonth, currentYear);

      const rows = await Promise.all(
        allStaff.map(async staff => {
          const { data: fyActivities } = await supabase
            .from('dailyactivity')
            .select('month, day, service_id, delivered_count, date')
            .eq('staff_id', staff.staff_id)
            .gte('date', startDate.toISOString().slice(0, 10))
            .lte('date', endDate.toISOString().slice(0, 10));

          const { data: rollingActivities } = await supabase
            .from('dailyactivity')
            .select('delivered_count')
            .eq('staff_id', staff.staff_id)
            .gte('date', rollingStart.toISOString().slice(0, 10))
            .lte('date', rollingEnd.toISOString().slice(0, 10));

          const months: AnnualData['months'] = {};
          for (let m = 1; m <= 12; m++) {
            months[m] = { total: 0, services: {} };
            services.forEach(s => (months[m].services[s.service_name] = 0));
          }

          const dailyTotals: Record<number, number> = {};

          fyActivities?.forEach(a => {
            if (!a.service_id) return;
            months[a.month].total += a.delivered_count;
            months[a.month].services[
              services.find(s => s.service_id === a.service_id)?.service_name || ''
            ] += a.delivered_count;

            dailyTotals[a.day] = (dailyTotals[a.day] || 0) + a.delivered_count;
          });

          const busiestDay = Object.entries(dailyTotals).reduce(
            (m, [d, c]) => (c > m.count ? { day: +d, count: c } : m),
            { day: 0, count: 0 }
          );

          return {
            staff_id: staff.staff_id,
            name: staff.name,
            months,
            totalDeliveries: Object.values(months).reduce((s, m) => s + m.total, 0),
            busiestDay: busiestDay.count ? busiestDay : null,
            averageMonthlyDeliveries:
              (rollingActivities?.reduce((s, a) => s + a.delivered_count, 0) || 0) / 12,
          };
        })
      );

      setAnnualData(rows);
    } catch {
      setError('Failed to load annual summary data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnnualData();
  }, [selectedFinancialYear, selectedMonth, allStaff.length, services.length]);

  const monthData = getFinancialYearMonths(selectedFinancialYear);

  const displayStaff =
    isAdmin && selectedStaffId
      ? allStaff.find(s => s.staff_id.toString() === selectedStaffId) || currentStaff
      : currentStaff;

  const getCurrentMonthData = () => {
    if (!displayStaff) return { currentDelivered: 0, historicalAverage: 0 };

    const staffData = annualData.find(s => s.staff_id === displayStaff.staff_id);
    if (!staffData) return { currentDelivered: 0, historicalAverage: 0 };

    return {
      currentDelivered: staffData.months[currentMonth]?.total || 0,
      historicalAverage: staffData.averageMonthlyDeliveries,
    };
  };

  const { currentDelivered, historicalAverage } = getCurrentMonthData();

  if (loading || authLoading || servicesLoading) {
    return <div className="py-6 text-center text-gray-500">Loading annual summary…</div>;
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-md">
        <p className="text-red-800">⚠️ {error}</p>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">
        Annual Summary
      </h2>

      {displayStaff && (
        <div className="mb-8">
          <PerformancePrediction
            currentDelivered={currentDelivered}
            target={0}
            workingDays={workingDays}
            workingDaysUpToToday={workingDaysUpToToday}
            historicalAverage={historicalAverage}
            staffName={displayStaff.name}
          />
        </div>
      )}

      <div className="flex items-center mb-6">
        <button
          onClick={() => setShowServiceBreakdown(!showServiceBreakdown)}
          className="btn-primary"
        >
          {showServiceBreakdown ? 'Show Totals' : 'Show Service Breakdown'}
        </button>
      </div>

      <div className="overflow-x-auto bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-100 dark:bg-gray-700">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-bold uppercase">Staff</th>
              {monthData.map(m => (
                <th key={m.number} className="px-4 py-3 text-center text-xs font-bold uppercase">
                  {m.name}
                </th>
              ))}
              <th className="px-4 py-3 text-center text-xs font-bold uppercase">FY Total</th>
            </tr>
          </thead>
          <tbody>
            {annualData.map((staff, idx) => (
              <tr
                key={staff.staff_id}
                className={idx % 2 === 0 ? 'bg-white dark:bg-gray-800' : 'bg-gray-50 dark:bg-gray-700'}
              >
                <td className="px-4 py-3 font-medium">{staff.name}</td>
                {monthData.map(m => (
                  <td key={m.number} className="px-4 py-3 text-center">
                    {showServiceBreakdown
                      ? services.map(s => (
                          <div key={s.service_id} className="text-xs">
                            {s.service_name}: {staff.months[m.number].services[s.service_name]}
                          </div>
                        ))
                      : staff.months[m.number].total}
                  </td>
                ))}
                <td className="px-4 py-3 font-bold text-center">
                  {staff.totalDeliveries}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
