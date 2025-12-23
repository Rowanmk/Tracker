import React from 'react';
    import { FinancialYear, getFinancialYearMonths } from '../utils/financialYear';
    import { FinancialYearSelector } from './FinancialYearSelector';

    interface PageSubHeaderProps {
      title: string;
      year?: number;
      onYearChange?: (year: number) => void;
      month?: number;
      onMonthChange?: (month: number) => void;
      financialYear?: FinancialYear;
      onFinancialYearChange?: (fy: FinancialYear) => void;
      showFinancialYear?: boolean;
    }

    export const PageSubHeader: React.FC<PageSubHeaderProps> = ({
      title,
      year,
      onYearChange,
      month,
      onMonthChange,
      financialYear,
      onFinancialYearChange,
      showFinancialYear = false
    }) => {
      const currentYear = new Date().getFullYear();
      const years = Array.from({ length: 16 }, (_, i) => currentYear - 10 + i);

      const monthData = getFinancialYearMonths();

      return (
        <div className="mb-6 border-b pb-4">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between">
            <h2 className="text-xl lg:text-2xl font-semibold text-gray-900 dark:text-white mb-3 lg:mb-0">
              {title}
            </h2>
          </div>

          <div className="flex justify-between items-center mt-4">
            <div className="flex gap-2 flex-wrap">
              {monthData.map((monthInfo) => {
                const isActive = monthInfo.number === month;
                return (
                  <button
                    key={monthInfo.number}
                    onClick={() => onMonthChange?.(monthInfo.number)}
                    className={
                      `px-3 py-1 rounded-md text-sm font-medium 
                      border transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 ${isActive ? 
                        "bg-blue-600 text-white border-blue-600 hover:bg-blue-700" : 
                        "bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600"}`
                    }
                  >
                    {monthInfo.name}
                  </button>
                );
              })}
            </div>
            
            <div className="flex gap-4 items-end">
              {showFinancialYear && financialYear && onFinancialYearChange ? (
                <FinancialYearSelector
                  selectedFinancialYear={financialYear}
                  onFinancialYearChange={onFinancialYearChange}
                />
              ) : (
                year !== undefined && onYearChange && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Year
                    </label>
                    <select
                      value={year}
                      onChange={(e) => onYearChange(parseInt(e.target.value))}
                      className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 hover:border-gray-400 dark:hover:border-gray-500 transition-colors"
                    >
                      {years.map((y) => (
                        <option key={y} value={y}>{y}</option>
                      ))}
                    </select>
                  </div>
                )
              )}
            </div>
          </div>
        </div>
      );
    };