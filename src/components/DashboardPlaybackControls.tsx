import React from "react";

interface DashboardPlaybackControlsProps {
  daysInMonth: number;
  selectedDay: number;
  isPlaying: boolean;
  playbackProgress: number;
  onDaySelect: (day: number) => void;
  onTogglePlay: () => void;
}

export const DashboardPlaybackControls: React.FC<DashboardPlaybackControlsProps> = ({
  daysInMonth,
  selectedDay,
  isPlaying,
  playbackProgress,
  onDaySelect,
  onTogglePlay,
}) => {
  const safeDaysInMonth = Math.max(1, daysInMonth);
  const clampedProgress = Math.max(1, Math.min(safeDaysInMonth, playbackProgress));
  const clampedSelectedDay = Math.max(1, Math.min(safeDaysInMonth, selectedDay));
  const progressPercent =
    safeDaysInMonth > 1 ? ((clampedProgress - 1) / (safeDaysInMonth - 1)) * 100 : 100;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md border border-gray-200 dark:border-gray-700 p-4 transition-all duration-300 ease-in-out">
      <div className="flex flex-col lg:flex-row lg:items-center gap-4">
        <div className="flex-1 overflow-x-auto">
          <div className="flex items-center gap-2 min-w-max pr-2">
            {Array.from({ length: safeDaysInMonth }, (_, index) => {
              const day = index + 1;
              const isActive = day === clampedSelectedDay;

              return (
                <button
                  key={day}
                  onClick={() => onDaySelect(day)}
                  className={`h-9 min-w-[36px] px-3 rounded-md text-sm font-bold border transition-all duration-200 ${
                    isActive
                      ? "bg-[#001B47] text-white border-[#001B47]"
                      : "bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600"
                  }`}
                  aria-pressed={isActive}
                  aria-label={`Show dashboard for day ${day}`}
                >
                  {day}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center justify-end">
          <button
            onClick={onTogglePlay}
            className={`h-10 w-10 rounded-md border flex items-center justify-center transition-colors ${
              isPlaying
                ? "bg-[#001B47] text-white border-[#001B47]"
                : "bg-white dark:bg-gray-700 text-[#001B47] dark:text-white border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600"
            }`}
            aria-label={isPlaying ? "Pause month animation" : "Play month animation"}
            title={isPlaying ? "Pause" : "Play"}
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
        </div>
      </div>

      <div className="mt-4 px-1">
        <div className="relative h-2 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
          <div
            className="absolute inset-y-0 left-0 bg-[#001B47] rounded-full transition-[width] duration-75 ease-linear"
            style={{ width: `${progressPercent}%` }}
          />
          <div
            className="absolute top-1/2 -translate-y-1/2 h-4 w-4 rounded-full bg-[#001B47] border-2 border-white dark:border-gray-800 shadow-sm transition-[left] duration-75 ease-linear"
            style={{ left: `calc(${progressPercent}% - 8px)` }}
          />
        </div>
      </div>
    </div>
  );
};