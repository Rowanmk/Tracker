import React, { useState, useEffect, useRef } from 'react';
import { useDate } from '../context/DateContext';
import { useAuth } from '../context/AuthContext';
import { useDashboardView } from '../context/DashboardViewContext';

interface GlobalDateSelectorProps {
  showViewModeToggle?: boolean;
}

interface MonthYearOption {
  month: number;
  year: number;
  label: string;
}

export const StaffPerformanceBar: React.FC<any> = ({
  staffPerformance,
  workingDays,
  workingDaysUpToToday,
}) => {
  const [totalTarget, setTotalTarget] = useState(0);
  const [loading, setLoading] = useState(false);
  const [monthOptions, setMonthOptions] = useState<MonthYearOption[]>([]);
  const selectRef = useRef<HTMLSelectElement>(null);

  const { selectedMonth, setSelectedMonth, selectedYear, setSelectedYear, selectedFinancialYear } = useDate();

  const totalDelivered = staffPerformance.reduce((sum, s) => sum + s.total, 0);

  // Generate continuous month-year list: 24 months back, current, 12 months forward
  useEffect(() => {
    const today = new Date();
    const options: MonthYearOption[] = [];

    const startDate = new Date(today.getFullYear(), today.getMonth() - 24, 1);

    for (let i = 0; i < 37; i++) {
      const date = new Date(startDate.getFullYear(), startDate.getMonth() + i, 1);
      const month = date.getMonth() + 1;
      const year = date.getFullYear();

      const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                         'July', 'August', 'September', 'October', 'November', 'December'];

      options.push({
        month,
        year,
        label: `${monthNames[month - 1]} ${year}`,
      });
    }

    setMonthOptions(options);
  }, []);

  // Scroll the select dropdown to center the current month
  useEffect(() => {
    if (selectRef.current && monthOptions.length > 0) {
      const currentIndex = monthOptions.findIndex(
        opt => opt.month === selectedMonth && opt.year === selectedYear
      );

      if (currentIndex !== -1) {
        // Use setTimeout to ensure the DOM is ready
        setTimeout(() => {
          if (selectRef.current) {
            // Calculate the option height (approximately 20px per option in most browsers)
            const optionHeight = 20;
            const visibleOptions = 8; // Approximate number of visible options
            const scrollPosition = Math.max(0, (currentIndex - Math.floor(visibleOptions / 2)) * optionHeight);
            
            selectRef.current.scrollTop = scrollPosition;
          }
        }, 0);
      }
    }
  }, [selectedMonth, selectedYear, monthOptions]);

  useEffect(() => {
    const fetchTotalTarget = async () => {
      setLoading(true);
      try {
        let combinedTarget = 0;

        for (const staff of staffPerformance) {
          const { loadTargets } = await import('../utils/loadTargets');
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

  const handleMonthChange = (newMonth: number, newYear: number) => {
    setSelectedMonth(newMonth);
    setSelectedYear(newYear);
    setTimeout(() => {
      window.dispatchEvent(new Event('activity-updated'));
    }, 0);
  };

  return (
    <div className="w-full py-4 bg-[#001B47] rounded-xl flex justify-between items-center px-6">
      {/* Left: Month selector dropdown */}
      <div className="flex items-center">
        <select
          ref={selectRef}
          value={`${selectedYear}-${selectedMonth}`}
          onChange={(e) => {
            const [year, month] = e.target.value.split('-').map(Number);
            handleMonthChange(month, year);
          }}
          disabled={loading}
          className="bg-white text-gray-900 px-3 py-2 rounded-md shadow-sm text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed max-h-64 overflow-y-auto"
        >
          {monthOptions.map(({ month, year, label }) => (
            <option key={`${year}-${month}`} value={`${year}-${month}`}>
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