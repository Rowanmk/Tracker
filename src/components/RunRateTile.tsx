import React from 'react';
import type { FinancialYear } from '../utils/financialYear';

interface RunRateTileProps {
  workingDays: number;
  workingDaysUpToToday: number;
  dailyActivities: any[];
  month: number;
  financialYear: FinancialYear;
  target: number;
  viewMode?: "percent" | "numbers";
  playbackDay?: number;
}

const VIEWBOX_HEIGHT = 300;
const BASELINE_Y = 250;
const TOP_MARGIN = 20;
const BAR_AREA_HEIGHT = BASELINE_Y - TOP_MARGIN;
const CHART_WIDTH = 800;
const FIXED_LEFT_MARGIN = 60;
const RIGHT_PADDING = 40;

export const RunRateTile: React.FC<RunRateTileProps> = ({
  workingDays,
  dailyActivities,
  month,
  financialYear,
  target,
  viewMode = "numbers",
  playbackDay,
}) => {
  const selectedYear = month >= 4 ? financialYear.start : financialYear.end;
  const daysInSelectedMonth = new Date(selectedYear, month, 0).getDate();

  const today = new Date();
  const currentDay = today.getDate();
  const currentMonth = today.getMonth() + 1;
  const currentYear = today.getFullYear();
  const isCurrentMonth = month === currentMonth && selectedYear === currentYear;

  const dailyTarget = workingDays > 0 ? target / workingDays : 0;

  const workingDaysList: number[] = [];
  for (let d = 1; d <= daysInSelectedMonth; d++) {
    const dow = new Date(selectedYear, month - 1, d).getDay();
    if (dow !== 0 && dow !== 6) workingDaysList.push(d);
  }

  const deliveredByDay: Record<number, number> = {};
  dailyActivities.forEach((a) => {
    deliveredByDay[a.day] = (deliveredByDay[a.day] || 0) + a.delivered_count;
  });

  let expectedCumulative: number[] = [];
  const actualCumulative: number[] = [];
  let eSum = 0;
  let aSum = 0;

  for (let d = 1; d <= daysInSelectedMonth; d++) {
    if (workingDaysList.includes(d)) eSum += dailyTarget;
    expectedCumulative.push(eSum);
    aSum += deliveredByDay[d] || 0;
    actualCumulative.push(aSum);
  }

  const rawExpectedEnd = expectedCumulative[expectedCumulative.length - 1] || 0;
  if (rawExpectedEnd > 0 && target > 0) {
    const scaleFactor = target / rawExpectedEnd;
    expectedCumulative = expectedCumulative.map((value) => value * scaleFactor);
  }

  const defaultProgressLimit = isCurrentMonth ? Math.min(currentDay, daysInSelectedMonth) : daysInSelectedMonth;
  const progressLimit = playbackDay ?? defaultProgressLimit;
  const clampedPlaybackDay = Math.max(1, Math.min(progressLimit, daysInSelectedMonth));

  let barValues: number[] = [];
  let expectedValues: number[] = [];
  let safeMaxValue: number;

  if (viewMode === "percent") {
    barValues = actualCumulative.map((value) =>
      target > 0 ? (value / target) * 100 : 0
    );
    expectedValues = expectedCumulative.map((value) =>
      target > 0 ? (value / target) * 100 : 0
    );
    safeMaxValue = Math.max(100, ...expectedValues, ...barValues);
  } else {
    barValues = [...actualCumulative];
    expectedValues = [...expectedCumulative];
    safeMaxValue = Math.max(...expectedCumulative, ...barValues, target, 1);
  }

  const displayedBarValues = barValues.map((value, index) => {
    const day = index + 1;
    const previousValue = index > 0 ? barValues[index - 1] : 0;

    if (clampedPlaybackDay >= day) {
      return previousValue + (value - previousValue) * Math.min(1, clampedPlaybackDay - (day - 1));
    }

    return 0;
  });

  const yAxisSteps = Array.from({ length: 5 }, (_, index) => Math.round((safeMaxValue / 4) * index));

  const formatYAxisValue = (value: number) => {
    if (viewMode === "percent") {
      return `${Math.round(value)}%`;
    }

    return Number.isInteger(value) ? value.toString() : value.toFixed(0);
  };

  const availableWidth = CHART_WIDTH - FIXED_LEFT_MARGIN - RIGHT_PADDING;
  const daySlotWidth = availableWidth / Math.max(daysInSelectedMonth, 1);
  const barWidth = Math.min(daySlotWidth * 0.8, 16);

  const getX = (day: number) => FIXED_LEFT_MARGIN + ((day - 1) * daySlotWidth) + (daySlotWidth / 2);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md border border-gray-200 dark:border-gray-700 h-[418px] flex flex-col tile-brand transition-all duration-300 ease-in-out">
      <div className="tile-header px-4 py-1.5">
        Run Rate
        {playbackDay ? <span className="ml-2 text-white/80">Day {Math.round(clampedPlaybackDay)}</span> : null}
      </div>

      <div className="flex-1 flex flex-col justify-end p-3 pb-2 overflow-hidden">
        <svg
          viewBox={`0 0 ${CHART_WIDTH} ${VIEWBOX_HEIGHT}`}
          preserveAspectRatio="none"
          className="w-full h-full"
          style={{ overflow: "hidden", display: "block" }}
        >
          <line
            x1={FIXED_LEFT_MARGIN}
            y1={BASELINE_Y}
            x2={CHART_WIDTH - 20}
            y2={BASELINE_Y}
            stroke="#6B7280"
            strokeWidth="1"
          />

          {yAxisSteps.map((tick) => {
            const y = BASELINE_Y - (tick / safeMaxValue) * BAR_AREA_HEIGHT;

            return (
              <g key={tick}>
                <text
                  x={FIXED_LEFT_MARGIN - 10}
                  y={y + 4}
                  textAnchor="end"
                  className="text-[10px] fill-gray-600 dark:fill-gray-400"
                >
                  {formatYAxisValue(tick)}
                </text>
                {tick > 0 && (
                  <line
                    x1={FIXED_LEFT_MARGIN}
                    y1={y}
                    x2={CHART_WIDTH - 20}
                    y2={y}
                    stroke="#E5E7EB"
                    strokeDasharray="4,4"
                    className="dark:stroke-gray-600"
                  />
                )}
              </g>
            );
          })}

          {Array.from({ length: Math.floor(daysInSelectedMonth / 5) }, (_, i) => {
            const day = (i + 1) * 5;
            if (day > daysInSelectedMonth) return null;
            const x = getX(day);
            return (
              <g key={day}>
                <text
                  x={x}
                  y={BASELINE_Y + 15}
                  textAnchor="middle"
                  className="text-[10px] font-medium fill-gray-600 dark:fill-gray-400"
                >
                  {day}
                </text>
              </g>
            );
          })}

          <polyline
            points={expectedValues
              .map((v, i) => {
                const x = getX(i + 1);
                const y = BASELINE_Y - (v / safeMaxValue) * BAR_AREA_HEIGHT;
                return `${x},${y}`;
              })
              .join(" ")}
            fill="none"
            stroke="#6B7280"
            strokeWidth="3"
            strokeDasharray="8,4"
          />

          {displayedBarValues.map((value, idx) => {
            const day = idx + 1;
            const ratio = safeMaxValue > 0 ? value / safeMaxValue : 0;
            const barHeight = Math.max(0, ratio * BAR_AREA_HEIGHT);
            const x = getX(day);
            const isVisible = value > 0 || clampedPlaybackDay >= day;

            const interpolatedRawValue = viewMode === "percent" ? (target > 0 ? (value / 100) * target : 0) : value;
            const rawVariance = interpolatedRawValue - expectedCumulative[idx];
            const roundedVariance = Math.round(rawVariance);

            const varianceText = roundedVariance > 0 ? `+${roundedVariance}` : roundedVariance === 0 ? "0" : `${roundedVariance}`;
            const varianceColor = roundedVariance > 0 ? "fill-green-600 dark:fill-green-400" : roundedVariance < 0 ? "fill-red-600 dark:fill-red-400" : "fill-gray-500 dark:fill-gray-400";

            return (
              <g key={day}>
                <rect
                  x={x - barWidth / 2}
                  y={BASELINE_Y - barHeight}
                  width={barWidth}
                  height={barHeight}
                  fill="#001B47"
                  rx={2}
                  style={{ transform: "translateZ(0)" }}
                />
                {isVisible && (
                  <text
                    x={x}
                    y={BASELINE_Y - barHeight - 6}
                    textAnchor="middle"
                    className={`text-[9px] font-bold ${varianceColor}`}
                  >
                    {varianceText}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
};