import React, { useEffect, useRef, useState } from 'react';
import { useDate } from '../context/DateContext';
import type { FinancialYear } from '../utils/financialYear';

export interface StaffPerformance {
  staff_id: number;
  name: string;
  total: number;
  target?: number;
}

interface Props {
  staffPerformance: StaffPerformance[];
  workingDays: number;
  workingDaysUpToToday: number;
  month: number;
  financialYear: FinancialYear;

  // REQUIRED CONTEXT
  dashboardMode: 'team' | 'individual';
  currentStaff: { staff_id: number; name: string } | null;
}

export const StaffPerformanceBar: React.FC<Props> = ({
  staffPerformance,
  workingDays,
  workingDaysUpToToday,
  dashboardMode,
  currentStaff,
}) => {
  const selectRef = useRef<HTMLSelectElement>(null);
  const { selectedMonth, selectedYear, setSelectedMonth, setSelectedYear } = useDate();

  const totalDelivered =
    dashboardMode === 'team'
      ? staffPerformance.reduce((sum, s) => sum + s.total, 0)
      : staffPerformance.find(s => s.staff_id === currentStaff?.staff_id)?.total || 0;

  const totalTarget =
    dashboardMode === 'team'
      ? staffPerformance.reduce((sum, s) => sum + (s.target || 0), 0)
      : staffPerformance.find(s => s.staff_id === currentStaff?.staff_id)?.target || 0;

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

  const headerText = `${statusText} | Delivered: ${totalDelivered} | Expected: ${Math.round(expectedByNow)}`;

  return (
    <div className="w-full py-4 bg-[#001B47] rounded-xl flex justify-between items-center px-6">
      {/* Month selector */}
      <div className="flex items-center">
        <select
          ref={selectRef}
          value={`${selectedYear}-${selectedMonth}`}
          onChange={(e) => {
            const [year, month] = e.target.value.split('-').map(Number);
            setSelectedMonth(month);
            setSelectedYear(year);
          }}
          className="bg-white text-gray-900 px-3 py-2 rounded-md shadow-sm text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {Array.from({ length: 12 }).map((_, i) => {
            const d = new Date(selectedYear, i, 1);
            return (
              <option key={i} value={`${d.getFullYear()}-${i + 1}`}>
                {d.toLocaleString('default', { month: 'long', year: 'numeric' })}
              </option>
            );
          })}
        </select>
      </div>

      {/* Centre text */}
      <div className="flex-1 text-center">
        <span className="text-white text-lg font-semibold tracking-wide">
          {headerText}
        </span>
      </div>

      {/* Spacer */}
      <div className="w-[120px]" />
    </div>
  );
};
