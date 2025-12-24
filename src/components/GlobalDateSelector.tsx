import React from "react";
import { useDate } from "../context/DateContext";
import { useDashboardView } from "../context/DashboardViewContext";

interface GlobalDateSelectorProps {
  showViewModeToggle?: boolean;
}

export const GlobalDateSelector: React.FC<GlobalDateSelectorProps> = ({
  showViewModeToggle = false,
}) => {
  const { derivedFinancialYear, selectedMonth, selectedYear } = useDate();
  const { viewMode, setViewMode } = useDashboardView();

  const handleViewModeChange = (mode: "percent" | "numbers") => {
    setViewMode(mode);
  };

  const getMonthName = (monthNum: number) => {
    const months = ['January', 'February', 'March', 'April', 'May', 'June',
                   'July', 'August', 'September', 'October', 'November', 'December'];
    return months[monthNum - 1];
  };

  const ValueModeToggle = () => (
    <div className="flex items-center space-x-1 bg-gray-100 dark:bg-gray-700 rounded-full p-1">
      <button
        onClick={() => handleViewModeChange("percent")}
        className={`px-4 py-2 rounded-md font-bold ${
          viewMode === "percent"
            ? "bg-[#001B47] text-white"
            : "bg-white text-gray-800"
        }`}
      >
        % View
      </button>
      <button
        onClick={() => handleViewModeChange("numbers")}
        className={`px-4 py-2 rounded-md font-bold ${
          viewMode === "numbers"
            ? "bg-[#001B47] text-white"
            : "bg-white text-gray-800"
        }`}
      >
        Numbers View
      </button>
    </div>
  );

  return (
    <div className="sticky top-0 z-40 bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700 transition-all duration-300 ease-in-out">
      <div className="px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex items-center gap-4 flex-wrap">
            {/* Display Current Selection */}
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {getMonthName(selectedMonth)} {selectedYear}
              </span>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                (FY {derivedFinancialYear.label})
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {showViewModeToggle && <ValueModeToggle />}
          </div>
        </div>
      </div>
    </div>
  );
};