import React from "react";
import { useDate } from "../context/DateContext";
import { useAuth } from "../context/AuthContext";
import { FinancialYearSelector } from "./FinancialYearSelector";
import { useDashboardView } from "../context/DashboardViewContext";
import { getFinancialYearMonths } from "../utils/financialYear";

interface GlobalDateSelectorProps {
  showTeamToggle?: boolean;
  showViewModeToggle?: boolean;
}

export const GlobalDateSelector: React.FC<GlobalDateSelectorProps> = ({
  showTeamToggle = false,
  showViewModeToggle = false,
}) => {
  const {
    selectedMonth,
    setSelectedMonth,
    selectedFinancialYear,
    setSelectedFinancialYear,
  } = useDate();
  const { isAdmin } = useAuth();
  const {
    viewMode,
    setViewMode,
  } = useDashboardView();

  const handleViewModeChange = (mode: "percent" | "numbers") => {
    setViewMode(mode);
  };

  const monthData = getFinancialYearMonths();

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
    <div className="sticky top-0 z-50 bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700 transition-all duration-300 ease-in-out">
      <div className="px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex items-center gap-4 flex-wrap">
            {/* Month Selector */}
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Month:
              </label>
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
                className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 hover:border-gray-400 dark:hover:border-gray-500 transition-colors text-sm"
              >
                {monthData.map((m) => (
                  <option key={m.number} value={m.number}>
                    {getMonthName(m.number)}
                  </option>
                ))}
              </select>
            </div>

            {/* Financial Year Selector */}
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Financial Year:
              </label>
              <FinancialYearSelector
                selectedFinancialYear={selectedFinancialYear}
                onFinancialYearChange={setSelectedFinancialYear}
                className="w-auto"
              />
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