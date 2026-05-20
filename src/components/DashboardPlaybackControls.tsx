import React from "react";

interface DashboardPlaybackControlsProps {
  daysInMonth: number;
  selectedDay: number;
  onDaySelect: (day: number) => void;
  month?: number;
  year?: number;
}

export const DashboardPlaybackControls: React.FC<DashboardPlaybackControlsProps> = ({
  daysInMonth,
  selectedDay,
  onDaySelect,
  month,
  year,
}) => {
  const safeDaysInMonth = Math.max(1, daysInMonth);
  const clampedSelectedDay = Math.max(1, Math.min(safeDaysInMonth, selectedDay));
  const progressPercent =
    safeDaysInMonth > 1 ? ((clampedSelectedDay - 1) / (safeDaysInMonth - 1)) * 100 : 100;

  const currentDate = new Date();
  const currentDay = currentDate.getDate();
  const currentMonth = currentDate.getMonth() + 1;
  const currentYear = currentDate.getFullYear();

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md border border-gray-200 dark:border-gray-700 p-4 transition-all duration-300 ease-in-out">
      <div className="flex flex-row items-center gap-2 sm:gap-4 w-full">
        <div className="flex-1 flex items-center gap-0.5 sm:gap-1 w-full">
          {Array.from({ length: safeDaysInMonth }, (_, index) => {
            const day = index + 1;
            const isActive = day === clampedSelectedDay;

            let isWeekend = false;
            let isToday = false;

            if (month && year) {
              const date = new Date(year, month - 1, day);
              const dayOfWeek = date.getDay();
              isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
              isToday = day === currentDay && month === currentMonth && year === currentYear;
            }

            let buttonClasses = "flex-1 h-9 rounded-sm sm:rounded-md text-[10px] sm:text-xs md:text-sm font-bold border transition-all duration-200 flex items-center justify-center min-w-0 px-0 ";
            if (isActive) {
              buttonClasses += "bg-[#001B47] text-white border-[#001B47]";
            } else if (isToday) {
              buttonClasses += "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-900/30";
            } else if (isWeekend) {
              buttonClasses += "bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800 hover:bg-red-100 dark:hover:bg-red-900/40";
            } else {
              buttonClasses += "bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600";
            }

            return (
              <button
                key={day}
                onClick={() => onDaySelect(day)}
                className={buttonClasses}
                aria-pressed={isActive}
                aria-current={isToday ? "date" : undefined}
                aria-label={`Show dashboard for day ${day}`}
              >
                {day}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-4 px-1">
        <div className="relative h-2 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
          <div
            className="absolute inset-y-0 left-0 bg-[#001B47] rounded-full transition-[width] duration-100 ease-linear"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>
    </div>
  );
};