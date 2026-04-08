import React, { useMemo } from 'react';
import type { FinancialYear } from '../utils/financialYear';
import { getMonthYearFromFinancialYear } from '../utils/runRate';

interface RunRateTileProps {
  workingDays: number;
  workingDaysUpToToday: number;
  dailyActivities: Array<{
    day: number;
    delivered_count: number;
  }>;
  month: number;
  financialYear: FinancialYear;
  target: number;
  viewMode?: "percent" | "numbers";
  playbackDay?: number;
  totalDelivered?: number;
}

const VIEWBOX_HEIGHT = 320;
const BASELINE_Y = 270;
const TOP_MARGIN = 30;
const BAR_AREA_HEIGHT = BASELINE_Y - TOP_MARGIN;
const CHART_WIDTH = 800;
const FIXED_LEFT_MARGIN = 55;
const RIGHT_PADDING = 20;

export const RunRateTile: React.FC<RunRateTileProps> = ({
  workingDays,
  dailyActivities,
  month,
  financialYear,
  target,
  playbackDay,
  totalDelivered,
}) => {
  const selectedYear = getMonthYearFromFinancialYear(month, financialYear);
  const daysInMonth = new Date(selectedYear, month, 0).getDate();

  // Build list of working days (Mon–Fri) in the month
  const workingDaysList = useMemo(() => {
    const result: number[] = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const dow = new Date(selectedYear, month - 1, d).getDay();
      if (dow !== 0 && dow !== 6) result.push(d);
    }
    return result;
  }, [daysInMonth, month, selectedYear]);

  // Daily target per working day
  const dailyTarget = workingDays > 0 ? target / workingDays : 0;

  // Sum delivered_count per calendar day from the already-filtered dailyActivities prop
  const deliveredByDay = useMemo(() => {
    const totals: Record<number, number> = {};
    dailyActivities.forEach((activity) => {
      totals[activity.day] = (totals[activity.day] || 0) + activity.delivered_count;
    });
    return totals;
  }, [dailyActivities]);

  // Playback day capped to month length
  const safePlaybackDay = Math.max(1, Math.min(playbackDay ?? daysInMonth, daysInMonth));
  const playbackDayCapped = Math.floor(safePlaybackDay);

  // Build per-day series
  const series = useMemo(() => {
    // Cumulative actual delivered up to each calendar day
    let actualRunning = 0;
    const actualCumulative: number[] = [];
    for (let d = 1; d <= daysInMonth; d++) {
      actualRunning += deliveredByDay[d] || 0;
      actualCumulative.push(actualRunning);
    }

    // Scale actual so the final value matches totalDelivered exactly (eliminates rounding drift)
    let finalActualCumulative = actualCumulative;
    if (totalDelivered !== undefined && actualRunning > 0) {
      const scaleFactor = totalDelivered / actualRunning;
      finalActualCumulative = actualCumulative.map((v) => v * scaleFactor);
    }

    // Cumulative expected target line: advances only on working days
    // Scaled so it ends exactly at `target`
    let workingDaysElapsed = 0;
    const expectedCumulative: number[] = [];
    for (let d = 1; d <= daysInMonth; d++) {
      if (workingDaysList.includes(d)) {
        workingDaysElapsed += 1;
      }
      expectedCumulative.push(workingDays > 0 ? (target / workingDays) * workingDaysElapsed : 0);
    }

    // Variance above each bar: cumulative actual − cumulative expected at that day
    const varianceByDay: number[] = finalActualCumulative.map((actual, idx) => {
      const expected = expectedCumulative[idx];
      return Math.round(actual) - Math.round(expected);
    });

    return { actualCumulative: finalActualCumulative, expectedCumulative, varianceByDay };
  }, [
    deliveredByDay,
    daysInMonth,
    workingDaysList,
    workingDays,
    target,
    totalDelivered,
  ]);

  // Y-axis max: highest of target, max actual, max expected
  const yMax = useMemo(() => {
    const maxActual = Math.max(...series.actualCumulative.slice(0, playbackDayCapped), 0);
    const maxExpected = Math.max(...series.expectedCumulative, 0);
    return Math.max(target, maxActual, maxExpected, 1) * 1.05;
  }, [series, target, playbackDayCapped]);

  // Y-axis ticks (5 steps)
  const yAxisTicks = useMemo(
    () => Array.from({ length: 5 }, (_, i) => Math.round((yMax / 4) * i)),
    [yMax]
  );

  const availableWidth = CHART_WIDTH - FIXED_LEFT_MARGIN - RIGHT_PADDING;
  const daySlotWidth = availableWidth / Math.max(daysInMonth, 1);
  const barWidth = Math.min(daySlotWidth * 0.75, 18);

  const getX = (day: number) =>
    FIXED_LEFT_MARGIN + (day - 1) * daySlotWidth + daySlotWidth / 2;

  const toY = (value: number) =>
    BASELINE_Y - (Math.max(0, value) / yMax) * BAR_AREA_HEIGHT;

  // Dotted target line polyline points (all days in month)
  const targetPolylinePoints = useMemo(
    () =>
      series.expectedCumulative
        .map((value, idx) => `${getX(idx + 1)},${toY(value)}`)
        .join(' '),
    [series.expectedCumulative, yMax, daysInMonth]
  );

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md border border-gray-200 dark:border-gray-700 h-[418px] flex flex-col tile-brand transition-all duration-300 ease-in-out">
      <div className="tile-header px-4 py-1.5 flex items-center justify-between">
        <span>Run Rate</span>
        {playbackDay ? (
          <span className="text-white/80 text-sm">Day {Math.round(safePlaybackDay)}</span>
        ) : null}
      </div>

      <div className="flex-1 flex flex-col p-3 pb-2 overflow-hidden">
        <svg
          viewBox={`0 0 ${CHART_WIDTH} ${VIEWBOX_HEIGHT}`}
          preserveAspectRatio="none"
          className="w-full h-full"
          style={{ overflow: 'hidden', display: 'block' }}
        >
          {/* Y-axis gridlines and labels */}
          {yAxisTicks.map((tick) => {
            const y = toY(tick);
            return (
              <g key={tick}>
                <text
                  x={FIXED_LEFT_MARGIN - 6}
                  y={y + 4}
                  textAnchor="end"
                  className="text-[10px] fill-gray-500 dark:fill-gray-400"
                >
                  {tick}
                </text>
                {tick > 0 && (
                  <line
                    x1={FIXED_LEFT_MARGIN}
                    y1={y}
                    x2={CHART_WIDTH - RIGHT_PADDING}
                    y2={y}
                    stroke="#E5E7EB"
                    strokeDasharray="4,4"
                    className="dark:stroke-gray-600"
                  />
                )}
              </g>
            );
          })}

          {/* Baseline */}
          <line
            x1={FIXED_LEFT_MARGIN}
            y1={BASELINE_Y}
            x2={CHART_WIDTH - RIGHT_PADDING}
            y2={BASELINE_Y}
            stroke="#6B7280"
            strokeWidth="1"
          />

          {/* X-axis day labels every 5 days */}
          {Array.from({ length: Math.floor(daysInMonth / 5) }, (_, i) => {
            const day = (i + 1) * 5;
            if (day > daysInMonth) return null;
            return (
              <text
                key={day}
                x={getX(day)}
                y={BASELINE_Y + 14}
                textAnchor="middle"
                className="text-[10px] fill-gray-500 dark:fill-gray-400"
              >
                {day}
              </text>
            );
          })}

          {/* Actual cumulative bars */}
          {series.actualCumulative.map((value, idx) => {
            const day = idx + 1;
            if (day > playbackDayCapped) return null;
            if (value <= 0) return null;

            const barHeight = Math.max(0, (value / yMax) * BAR_AREA_HEIGHT);
            const x = getX(day);
            const variance = series.varianceByDay[idx];
            const varianceLabel = variance > 0 ? `+${variance}` : `${variance}`;
            const varianceColor =
              variance > 0
                ? '#008A00'
                : variance < 0
                ? '#FF3B30'
                : '#6B7280';

            return (
              <g key={day}>
                <rect
                  x={x - barWidth / 2}
                  y={BASELINE_Y - barHeight}
                  width={barWidth}
                  height={barHeight}
                  fill="#001B47"
                  rx={2}
                />
                <text
                  x={x}
                  y={BASELINE_Y - barHeight - 5}
                  textAnchor="middle"
                  style={{ fontSize: 9, fontWeight: 700, fill: varianceColor }}
                >
                  {varianceLabel}
                </text>
              </g>
            );
          })}

          {/* Dotted target run-rate line */}
          <polyline
            points={targetPolylinePoints}
            fill="none"
            stroke="#6B7280"
            strokeWidth="2.5"
            strokeDasharray="7,4"
            strokeLinecap="round"
          />

          {/* Target line label at end */}
          {target > 0 && (
            <text
              x={getX(daysInMonth) + 4}
              y={toY(target) + 4}
              className="text-[9px] fill-gray-400 dark:fill-gray-500"
              style={{ fontSize: 9 }}
            >
              Target
            </text>
          )}
        </svg>

        {/* Legend */}
        <div className="flex items-center gap-4 mt-1 px-1">
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-3 rounded-sm bg-[#001B47]" />
            <span className="text-[10px] text-gray-600 dark:text-gray-400 font-medium">Cumulative Delivered</span>
          </div>
          <div className="flex items-center gap-1.5">
            <svg width="20" height="8">
              <line x1="0" y1="4" x2="20" y2="4" stroke="#6B7280" strokeWidth="2" strokeDasharray="5,3" />
            </svg>
            <span className="text-[10px] text-gray-600 dark:text-gray-400 font-medium">Target Run Rate</span>
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-[10px] font-bold text-green-600">+n ahead</span>
            <span className="text-[10px] font-bold text-red-500">−n behind</span>
          </div>
        </div>
      </div>
    </div>
  );
};