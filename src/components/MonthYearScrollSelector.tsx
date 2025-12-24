import React, { useRef, useEffect } from 'react';
import { useDate } from '../context/DateContext';

interface MonthYearOption {
  month: number;
  year: number;
  label: string;
}

export const MonthYearScrollSelector: React.FC = () => {
  const { selectedMonth, selectedYear, setSelectedMonth, setSelectedYear } = useDate();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const selectedOptionRef = useRef<HTMLButtonElement>(null);

  // Generate list of months: 24 months back, current, 12 months forward
  const generateMonthList = (): MonthYearOption[] => {
    const today = new Date();
    const options: MonthYearOption[] = [];

    // Start from 24 months ago
    const startDate = new Date(today.getFullYear(), today.getMonth() - 24, 1);

    // Generate 37 months (24 back + current + 12 forward)
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

    return options;
  };

  const monthList = generateMonthList();

  const handleSelectMonth = (month: number, year: number) => {
    setSelectedMonth(month);
    setSelectedYear(year);
  };

  // Auto-scroll to selected month
  useEffect(() => {
    if (selectedOptionRef.current && scrollContainerRef.current) {
      selectedOptionRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'center',
      });
    }
  }, [selectedMonth, selectedYear]);

  return (
    <div className="sticky top-0 z-50 bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700 transition-all duration-300 ease-in-out">
      <div className="px-4 py-4 sm:px-6 lg:px-8">
        <div
          ref={scrollContainerRef}
          className="flex gap-2 overflow-x-auto"
          style={{
            scrollBehavior: 'smooth',
            WebkitOverflowScrolling: 'touch',
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
          }}
        >
          {monthList.map((option) => {
            const isSelected = option.month === selectedMonth && option.year === selectedYear;

            return (
              <button
                key={`${option.year}-${option.month}`}
                ref={isSelected ? selectedOptionRef : null}
                onClick={() => handleSelectMonth(option.month, option.year)}
                className={`flex-shrink-0 px-4 py-2 rounded-lg font-medium text-sm transition-all duration-200 whitespace-nowrap ${
                  isSelected
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>

      <style>{`
        div::-webkit-scrollbar {
          display: none;
        }
      `}</style>
    </div>
  );
};