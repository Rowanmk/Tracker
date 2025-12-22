import React, { useState, useEffect } from 'react';
import { useDate } from '../context/DateContext';
import { useAuth } from '../context/AuthContext';
import { useDashboardView } from '../context/DashboardViewContext';
import { loadTargets } from '../utils/loadTargets';
import type { FinancialYear } from '../utils/financialYear';

interface StaffPerformanceBarProps {
  staffPerformance: Array<{
    staff_id: number;
    name: string;
    services: { [key: string]: number };
    total: number;
    target: number;
    achieved_percent: number;
    historicalAverage: number;
    previousMonthRatio?: number;
  }>;
  dashboardMode?: "team" | "individual";
  currentStaff?: { staff_id: number; name: string } | null;
  workingDays: number;
  workingDaysUpToToday: number;
  month: number;
  financialYear: FinancialYear;
}

export const StaffPerformanceBar: React.FC<StaffPerformanceBarProps> = ({
  staffPerformance,
  workingDays,
  workingDaysUpToToday,
}) => {
  const [totalTarget, setTotalTarget] = useState(0);
  const [loading, setLoading] = useState(false);

  const { selectedMonth, setSelectedMonth, selectedFinancialYear } = useDate();

  const totalDelivered = staffPerformance.reduce((sum, s) => sum + s.total, 0);

  useEffect(() => {
    const fetchTotalTarget = async () => {
      setLoading(true);
      try {
        let combinedTarget = 0;

        for (const staff of staffPerformance) {
          const { totalTarget: staffTarget } = await loadTargets(selectedMonth, selectedFinancialYear, staff.staff_id);
          combinedTarget += staffTarget;
        }

        setTotalTarget(combinedTarget);
      } catch (error) {
        console.error('Error fetching total target:', error);
        setTotalTarget(0);
      } finally {
        setLoading(false);
      }
    };

    if (staffPerformance.length > 0) {
      fetchTotalTarget();
    }
  }, [selectedMonth, selectedFinancialYear, staffPerformance.length]);

  const expectedByNow = workingDays > 0 ? (totalTarget / workingDays) * workingDaysUpToToday : 0;
  const variance = totalDelivered - expectedByNow;
  const isAhead = variance >= 0;

  const getVarianceText = () => {
    if (Math.abs(variance) < 0.5) return 'On track';
    return isAhead 
      ? `Ahead by ${Math.round(Math.abs(variance))} items`
      : `Behind by ${Math.round(Math.abs(variance))} items`;
  };

  const statusText = `${getVarianceText()} | Delivered: ${totalDelivered} | Expected: ${Math.round(expectedByNow)}`;

  const getMonthName = (monthNum: number) => {
    const months = ['January', 'February', 'March', 'April', 'May', 'June',
                   'July', 'August', 'September', 'October', 'November', 'December'];
    return months[monthNum - 1];
  };

  const getMonthsForFinancialYear = () => {
    const months = [];
    for (let m = 4; m <= 12; m++) {
      months.push({ value: m, label: `${getMonthName(m)} ${selectedFinancialYear.start}` });
    }
    for (let m = 1; m <= 3; m++) {
      months.push({ value: m, label: `${getMonthName(m)} ${selectedFinancialYear.end}` });
    }
    return months;
  };

  const handleMonthChange = (newMonth: number) => {
    setSelectedMonth(newMonth);
    setTimeout(() => {
      window.dispatchEvent(new Event('activity-updated'));
    }, 0);
  };

  if (loading) {
    return (
      <div className="w-full py-4 bg-[#001B47] rounded-xl flex justify-center items-center">
        <span className="text-white text-lg font-semibold tracking-wide">
          Loading performance data...
        </span>
      </div>
    );
  }

  return (
    <div className="w-full py-4 bg-[#001B47] rounded-xl flex justify-between items-center px-6">
      {/* Left: Month selector dropdown */}
      <div className="flex items-center">
        <select
          value={selectedMonth}
          onChange={(e) => handleMonthChange(parseInt(e.target.value))}
          disabled={loading}
          className="bg-white text-gray-900 px-3 py-2 rounded-md shadow-sm text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {getMonthsForFinancialYear().map(({ value, label }) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {/* Centre: Status text */}
      <div className="flex-1 text-center">
        <span className="text-white text-lg font-semibold tracking-wide">
          {statusText}
        </span>
      </div>

      {/* Right: Empty space for layout consistency */}
      <div className="flex items-center space-x-3">
        {/* View mode selector removed */}
      </div>
    </div>
  );
};