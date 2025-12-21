import React from 'react';
    import { FinancialYear, getFinancialYears } from '../utils/financialYear';

    interface FinancialYearSelectorProps {
      selectedFinancialYear: FinancialYear;
      onFinancialYearChange: (fy: FinancialYear) => void;
      className?: string;
    }

    export const FinancialYearSelector: React.FC<FinancialYearSelectorProps> = ({
      selectedFinancialYear,
      onFinancialYearChange,
      className = '',
    }) => {
      const financialYears = getFinancialYears();

      return (
        <div className={className}>
          <select
            value={`${selectedFinancialYear.start}-${selectedFinancialYear.end}`}
            onChange={(e) => {
              const [start, end] = e.target.value.split('-').map(Number);
              const fy = financialYears.find(f => f.start === start && f.end === end);
              if (fy) onFinancialYearChange(fy);
            }}
            className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 hover:border-gray-400 dark:hover:border-gray-500 transition-colors"
          >
            {financialYears.map((fy) => {
              const label = `${fy.start}/${String(fy.end).slice(-2)}`;
              return (
                <option key={`${fy.start}-${fy.end}`} value={`${fy.start}-${fy.end}`}>
                  {label}
                </option>
              );
            })}
          </select>
        </div>
      );
    };