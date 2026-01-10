import React, { useEffect, useRef, useState } from 'react';
import { useDate } from '../context/DateContext';
import { loadTargets } from '../utils/loadTargets';

interface StaffPerformance {
  staff_id: number;
  name: string;
  total: number;
}

interface MonthYearOption {
  month: number;
  year: number;
  label: string;
}

interface Props {
  staffPerformance: StaffPerformance[];
  workingDays: number;
  workingDaysUpToToday: number;
}

export const StaffPerformanceBar: React.FC<Props> = ({
  staffPerformance,
  workingDays,
  workingDaysUpToToday,
}) => {
  const [totalTarget, setTotalTarget] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);
  const [monthOptions, setMonthOptions] = useState<MonthYearOption[]>([]);
  const selectRef = useRef<HTMLSelectElement>(null);

  const {
    selectedMonth,
    selectedYear,
    setSelectedMonth,
    setSelectedYear,
    selectedFinancialYear,
  } = useDate();

  const totalDelivered = staffPerformance.reduce(
    (sum: number, s: StaffPerformance) => sum + s.total,
    0
  );

  /* ---------- Month dropdown ---------- */
  useEffect(() => {
    const today = new Date();
    const options: MonthYearOption[] = [];
    const startDate = new Date(today.getFullYear(), today.getMonth() - 24, 1);

    for (let i = 0; i < 37; i++) {
      const date = new Date(startDate.getFullYear(), startDate.getMonth() + i, 1);
      const month = date.getMonth() + 1;
      const year = date.getFullYear();

      const monthNames = [
        'January','February','March','April','May','June',
        'July','August','September','October','November','December'
      ];

      options.push({
        month,
        year,
        label: `${monthNames[month - 1]} ${year}`,
      });
    }

    setMonthOptions(options);
  }, []);

  /* ---------- Targets ---------- */
  useEffect(() => {
    const fetchTargets = async () => {
      setLoading(true);
      let combined = 0;

      for (const staff of staffPerformance) {
        const { totalTarget } = await loadTargets(
          selectedMonth,
          selectedFinancialYear,
          staff.staff_id
        );
        combined += totalTarget;
      }

      setTotalTarget(combined);
      setLoading(false);
    };

    if (staffPerformance.length > 0) {
      fetchTargets();
    }
  }, [staffPerformance, selectedMonth, selectedFinancialYear]);

  const expectedByNow =
    workingDays > 0
      ? (totalTarget / workingDays) * workingDaysUpToToday
      : 0;

  const variance = totalDelivered - expectedByNow;

  const statusText =
    Math.abs(variance) < 0.5
      ? 'On track'
      : variance > 0
      ? `Ahead by ${Math.round(variance)} items`
      : `Behind by ${Math.abs(Math.round(variance))} items`;

  return (
    <div className="w-full py-4 bg-[#001B47] rounded-xl flex items-center px-6">
      <select
        ref={selectRef}
        value={`${selectedYear}-${selectedMonth}`}
        disabled={loading}
        onChange={e => {
          const [y, m] = e.target.value.split('-').map(Number);
          setSelectedMonth(m);
          setSelectedYear(y);
          window.dispatchEvent(new Event('activity-updated'));
        }}
        className="bg-white px-3 py-2 rounded-md text-sm font-medium"
      >
        {monthOptions.map(opt => (
          <option key={`${opt.year}-${opt.month}`} value={`${opt.year}-${opt.month}`}>
            {opt.label}
          </option>
        ))}
      </select>

      <div className="flex-1 text-center text-white text-lg font-semibold">
        {statusText} | Delivered: {totalDelivered} | Expected: {Math.round(expectedByNow)}
      </div>
    </div>
  );
};
