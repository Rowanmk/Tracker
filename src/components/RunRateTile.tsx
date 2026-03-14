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
}

const VIEWBOX_HEIGHT = 300;
const BASELINE_Y = 250;
const TOP_MARGIN = 20;
const BAR_AREA_HEIGHT = BASELINE_Y - TOP_MARGIN;
const LEFT_AXIS_MARGIN = 40;
const RIGHT_PADDING = 20;

export const RunRateTile: React.FC<RunRateTileProps> = ({
  workingDays,
  workingDaysUpToToday,
  dailyActivities,
  month,
  financialYear,
  target,
  viewMode = "numbers",
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

  let maxValue: number;
  const barValues: number[] = [];
  const expectedValues: number[] = [];

  if (viewMode === "percent") {
    maxValue = 100;
    for (let d = 1; d <= daysInSelectedMonth; d++) {
      const actualPercent =
        target > 0 ? Math.min((actualCumulative[d - 1] / target) * 100, 100) : 0;
      const expectedPercent =
        target > 0 ? Math.min((expectedCumulative[d - 1] / target) * 100, 100) : 0;
      barValues.push(actualPercent);
      expectedValues.push(expectedPercent);
    }
  } else {
    maxValue = Math.max(...actualCumulative, ...expectedCumulative, 1);
    for (let d = 1; d <= daysInSelectedMonth; d++) {
      barValues.push(actualCumulative[d - 1]);
      expectedValues.push(expectedCumulative[d - 1]);
    }
  }

  const yAxisSteps =
    viewMode === "percent"
      ? [0, 25, 50, 75, 100]
      : Array.from({ length: 5 }, (_, index) => Math.round((maxValue / 4) * index));

  const formatYAxisValue = (value: number) => {
    if (viewMode === "percent") {
      return `${Math.round(value)}%`;
    }

    return Number.isInteger(value) ? value.toString() : value.toFixed(0);
  };

  const daysToRenderBars = isCurrentMonth ? Math.min(currentDay, daysInSelectedMonth) : daysInSelectedMonth;
  const chartWidth = daysInSelectedMonth * 15 + LEFT_AXIS_MARGIN + RIGHT_PADDING;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md border border-gray-200 dark:border-gray-700 h-[500px] flex flex-col tile-brand transition-all duration-300 ease-in-out">
      <div className="tile-header px-4 py-1.5">Run Rate</div>

      <div className="flex-1 flex flex-col justify-end p-3 pb-4 overflow-hidden">
        <svg
          viewBox={`0 0 ${chartWidth} ${VIEWBOX_HEIGHT}`}
          preserveAspectRatio="none"
          className="w-full h-full"
          style={{ overflow: "hidden", display: "block" }}
        >
          <line
            x1={LEFT_AXIS_MARGIN}
            y1={BASELINE_Y}
            x2={LEFT_AXIS_MARGIN}
            y2={TOP_MARGIN}
            stroke="#999"
            strokeWidth="1.5"
          />
          <line
            x1={LEFT_AXIS_MARGIN}
            y1={BASELINE_Y}
            x2={daysInSelectedMonth * 15 + LEFT_AXIS_MARGIN}
            y2={BASELINE_Y}
            stroke="#001B47"
            strokeWidth="2"
          />

          {yAxisSteps.map((tick) => {
            const y = BASELINE_Y - (tick / maxValue) * BAR_AREA_HEIGHT;

            return (
              <g key={tick}>
                <text
                  x={LEFT_AXIS_MARGIN - 6}
                  y={y + 4}
                  textAnchor="end"
                  className="text-[10px] fill-gray-600 dark:fill-gray-400"
                >
                  {formatYAxisValue(tick)}
                </text>
                {tick > 0 && (
                  <line
                    x1={LEFT_AXIS_MARGIN}
                    y1={y}
                    x2={daysInSelectedMonth * 15 + LEFT_AXIS_MARGIN}
                    y2={y}
                    stroke="#E5E7EB"
                    strokeDasharray="4,4"
                    className="dark:stroke-gray-600"
                  />
                )}
              </g>
            );
          })}

          {Array.from({ length: Math.ceil(daysInSelectedMonth / 5) }, (_, i) => {
            const day = (i + 1) * 5;
            if (day > daysInSelectedMonth) return null;
            const x = day * 15 + LEFT_AXIS_MARGIN;
            return (
              <g key={day}>
                <text
                  x={x}
                  y={BASELINE_Y + 15}
                  textAnchor="middle"
                  className="text-xs fill-gray-600 dark:fill-gray-400"
                >
                  {day}
                </text>
              </g>
            );
          })}

          <polyline
            points={expectedValues
              .map((v, i) => {
                const x = (i + 1) * 15 + LEFT_AXIS_MARGIN;
                const y = BASELINE_Y - (v / maxValue) * BAR_AREA_HEIGHT;
                return `${x},${y}`;
              })
              .join(" ")}
            fill="none"
            stroke="#6B7280"
            strokeWidth="3"
            strokeDasharray="8,4"
            className="transition-all duration-300 ease-in-out"
          />

          {barValues.slice(0, daysToRenderBars).map((value, idx) => {
            const day = idx + 1;
            const ratio = value / maxValue;
            const barHeight = ratio * BAR_AREA_HEIGHT;
            const x = day * 15 + LEFT_AXIS_MARGIN;

            return (
              <rect
                key={day}
                x={x - 5}
                y={BASELINE_Y - barHeight}
                width={10}
                height={barHeight}
                fill="#001B47"
                rx={2}
                className="transition-all duration-300 ease-in-out"
              />
            );
          })}
        </svg>
      </div>
    </div>
  );
};