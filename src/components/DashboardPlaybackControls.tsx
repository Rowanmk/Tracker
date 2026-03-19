import React from "react";

interface DashboardPlaybackControlsProps {
  daysInMonth: number;
  selectedDay: number;
  isPlaying: boolean;
  isPaused: boolean;
  playbackProgress: number;
  maxPlayableDay: number;
  onDaySelect: (day: number) => void;
  onPlayPause: () => void;
  onReset: () => void;
  month?: number;
  year?: number;
}

export const DashboardPlaybackControls: React.FC<DashboardPlaybackControlsProps> = ({
  daysInMonth,
  selectedDay,
  isPlaying,
  isPaused,
  playbackProgress,
  maxPlayableDay,
  onDaySelect,
  onPlayPause,
  onReset,
  month,
  year,
}) => {
  const safeDaysInMonth = Math.max(1, daysInMonth);
  const clampedProgress = Math.max(1, Math.min(safeDaysInMonth, playbackProgress));
  const clampedSelectedDay = Math.max(1, Math.min(safeDaysInMonth, selectedDay));
  const cappedPlayableDay = Math.max(1, Math.min(safeDaysInMonth, maxPlayableDay));
  const progressPercent =
    safeDaysInMonth > 1 ? ((clampedProgress - 1) / (safeDaysInMonth - 1)) * 100 : 100;

  const playLabel = isPlaying ? "Pause" : isPaused ? "Resume" : "Play";

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md border border-gray-200 dark:border-gray-700 p-4 transition-all duration-300 ease-in-out">
      <div className="flex flex-row items-center gap-2 sm:gap-4 w-full">
        <div className="flex-1 flex items-center gap-0.5 sm:gap-1 w-full">
          {Array.from({ length: safeDaysInMonth }, (_, index) => {
            const day = index + 1;
            const isActive = day === clampedSelectedDay;
            const isDisabled = day > cappedPlayableDay;

            let isWeekend = false;
            if (month && year) {
              const date = new Date(year, month - 1, day);
              const dayOfWeek = date.getDay();
              isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
            }

            let buttonClasses = "flex-1 h-9 rounded-sm sm:rounded-md text-[10px] sm:text-xs md:text-sm font-bold border transition-all duration-200 flex items-center justify-center min-w-0 px-0 ";
            if (isActive) {
              buttonClasses += "bg-[#001B47] text-white border-[#001B47]";
            } else if (isDisabled) {
              buttonClasses += "bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 border-gray-200 dark:border-gray-700 cursor-not-allowed";
            } else if (isWeekend) {
              buttonClasses += "bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800 hover:bg-red-100 dark:hover:bg-red-900/40";
            } else {
              buttonClasses += "bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600";
            }

            return (
              <button
                key={day}
                onClick={() => !isDisabled && onDaySelect(day)}
                className={buttonClasses}
                aria-pressed={isActive}
                aria-label={`Show dashboard for day ${day}`}
                disabled={isDisabled}
              >
                {day}
              </button>
            );
          })}
        </div>

        <div className="flex items-center justify-end gap-2 shrink-0">
          <button
            onClick={onPlayPause}
            className={`h-10 w-10 rounded-md border flex items-center justify-center transition-colors ${
              isPlaying
                ? "bg-[#001B47] text-white border-[#001B47]"
                : "bg-white dark:bg-gray-700 text-[#001B47] dark:text-white border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600"
            }`}
            aria-label={isPlaying ? "Pause month animation" : isPaused ? "Resume month animation" : "Play month animation"}
            title={playLabel}
          >
            {isPlaying ? (
              <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current" aria-hidden="true">
                <rect x="6" y="5" width="4" height="14" rx="1" />
                <rect x="14" y="5" width="4" height="14" rx="1" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current ml-0.5" aria-hidden="true">
                <path d="M8 5.5v13l10-6.5-10-6.5Z" />
              </svg>
            )}
          </button>

          <button
            onClick={onReset}
            className="h-10 w-10 rounded-md border flex items-center justify-center transition-colors bg-white dark:bg-gray-700 text-[#001B47] dark:text-white border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600"
            aria-label="Reset month animation"
            title="Reset"
          >
            <svg viewBox="0 0 24 24" className="w-5 h-5 stroke-current fill-none" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v6h6" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 20v-6h-6" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 9a8 8 0 0 0-13.66-3.66L4 10M4 15a8 8 0 0 0 13.66 3.66L20 14" />
            </svg>
          </button>
        </div>
      </div>

      <div className="mt-4 px-1">
        <div className="relative h-2 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
          <div
            className="absolute inset-y-0 left-0 bg-[#001B47] rounded-full transition-none"
            style={{ width: `${progressPercent}%` }}
          />
          <div
            className="absolute top-1/2 -translate-y-1/2 h-4 w-4 rounded-full bg-[#001B47] border-2 border-white dark:border-gray-800 shadow-sm transition-none"
            style={{ left: `calc(${progressPercent}% - 8px)` }}
          />
        </div>
      </div>
    </div>
  );
};