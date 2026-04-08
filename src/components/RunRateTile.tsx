import React, { useMemo } from 'react';
import type { FinancialYear } from '../utils/financialYear';
import { calculateExpectedRaw, calculateRunRateDelta, getMonthYearFromFinancialYear } from '../utils/runRate';

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
  totalDelivered,
}) => {
  const selectedYear = getMonthYearFromFinancialYear(month, financialYear);
  const daysInSelectedMonth = new Date(selectedYear, month, 0).getDate();

  const today = new Date();
  const isCurrentMonth =
    selectedYear === today.getFullYear() && month === today.getMonth() + 1;
  const isFutureMonth =
    selectedYear > today.getFullYear() ||
    (selectedYear === today.getFullYear() && month > today.getMonth() + 1);

  const actualVisibleDay = isFutureMonth
    ? 0
    : isCurrentMonth
    ? Math.min(today.getDate(), daysInSelectedMonth)
    : daysInSelectedMonth;

  const dailyTarget = workingDays > 0 ? target / workingDays : 0;

  const workingDaysList = useMemo(() => {
    const result: number[] = [];
    for (let d = 1; d <= daysInSelectedMonth; d++) {
      const dow = new Date(selectedYear, month - 1, d).getDay();
      if (dow !== 0 && dow !== 6) {
        result.push(d);
      }
    }
    return result;
  }, [daysInSelectedMonth, month, selectedYear]);

  const deliveredByDay = useMemo(() => {
    const totals: Record<number, number> = {};
    dailyActivities.forEach((activity) => {
      totals[activity.day] = (totals[activity.day] || 0) + activity.delivered_count;
    });
    return totals;
  }, [dailyActivities]);

  const safePlaybackDay = Math.max(1, Math.min(playbackDay ?? daysInSelectedMonth, daysInSelectedMonth));

  const series = useMemo(() => {
    let expectedRunning = 0;
    let actualRunning = 0;
    let workingDaysElapsed = 0;
    const expectedCumulative: number[] = [];
    const actualCumulative: number[] = [];
    const roundedVarianceByDay: number[] = [];

    for (let d = 1; d <= daysInSelectedMonth; d++) {
      if (workingDaysList.includes(d)) {
        expectedRunning += dailyTarget;
        workingDaysElapsed += 1;
      }

      expectedCumulative.push(expectedRunning);

      if (d <= actualVisibleDay) {
        actualRunning += deliveredByDay[d] || 0;
      }

      actualCumulative.push(actualRunning);

      const runRate = calculateRunRateDelta(actualRunning, target, workingDays, workingDaysElapsed);
      roundedVarianceByDay.push(runRate.variance);
    }

    const rawExpectedEnd = expectedCumulative[expectedCumulative.length - 1] || 0;
    const scaledExpected =
      rawExpectedEnd > 0 && target > 0
        ? expectedCumulative.map((value) => (value / rawExpectedEnd) * target)
        : expectedCumulative.map((_, index) =>
            calculateExpectedRaw(target, workingDays, index + 1)
          );

    // If totalDelivered is provided (from parent), use it to scale the last bar
    // so the final variance matches the Global Progress bar exactly.
    // We scale all actual values proportionally so the chart shape is preserved.
    let finalActualCumulative = actualCumulative;
    if (totalDelivered !== undefined && actualRunning > 0) {
      const scaleFactor = totalDelivered / actualRunning;
      finalActualCumulative = actualCumulative.map((v) => v * scaleFactor);

      // Recompute variance by day using scaled actuals
      let wdElapsed = 0;
      for (let d = 1; d <= daysInSelectedMonth; d++) {
        if (workingDaysList.includes(d)) {
          wdElapsed += 1;
        }
        if (d <= actualVisibleDay) {
          const scaledActual = finalActualCumulative[d - 1];
          const runRate = calculateRunRateDelta(scaledActual, target, workingDays, wdElapsed);
          roundedVarianceByDay[d - 1] = runRate.variance;
        }
      }
    } else if (totalDelivered !== undefined && actualRunning === 0 && totalDelivered > 0) {
      // Edge case: no daily breakdown but we have a total
      finalActualCumulative = actualCumulative.map((_, i) =>
        i < actualVisibleDay ? totalDelivered : 0
      );
    }

    const barValues =
      viewMode === "percent"
        ? finalActualCumulative.map((value) => (target > 0 ? (value / target) * 100 : 0))
        : finalActualCumulative;

    const expectedValues =
      viewMode === "percent"
        ? scaledExpected.map((value) => (target > 0 ? (value / target) * 100 : 0))
        : scaledExpected;

    return {
      actualCumulative: finalActualCumulative,
      scaledExpected,
      barValues,
      expectedValues,
      roundedVarianceByDay,
    };
  }, [actualVisibleDay, dailyTarget, daysInSelectedMonth, deliveredByDay, target, viewMode, workingDaysList, workingDays, totalDelivered]);

  const safeMaxValue = useMemo(() => {
    const values =
      viewMode === "percent"
        ? [100, ...series.expectedValues, ...series.barValues]
        : [...series.expectedValues, ...series.barValues, target, 1];

    return Math.max(...values, 1);
  }, [series.barValues, series.expectedValues, target, viewMode]);

  const yAxisSteps = useMemo(
    () => Array.from({ length: 5 }, (_, index) => Math.round((safeMaxValue / 4) * index)),
    [safeMaxValue]
  );

  const availableWidth = CHART_WIDTH - FIXED_LEFT_MARGIN - RIGHT_PADDING;
  const daySlotWidth = availableWidth / Math.max(daysInSelectedMonth, 1);
  const barWidth = Math.min(daySlotWidth * 0.8, 16);

  const getX = (day: number) => FIXED_LEFT_MARGIN + (day - 1) * daySlotWidth + daySlotWidth / 2;

  const formatYAxisValue = (value: number) => {
    if (viewMode === "percent") {
      return `${Math.round(value)}%`;
    }
    return `${Math.round(value)}`;
  };

  const expectedPolylinePoints = useMemo(
    () =>
      series.expectedValues
        .map((value, index) => {
          const x = getX(index + 1);
          const y = BASELINE_Y - (value / safeMaxValue) * BAR_AREA_HEIGHT;
          return `${x},${y}`;
        })
        .join(" "),
    [series.expectedValues, safeMaxValue]
  );

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md border border-gray-200 dark:border-gray-700 h-[418px] flex flex-col tile-brand transition-all duration-300 ease-in-out">
      <div className="tile-header px-4 py-1.5">
        Run Rate
        {playbackDay ? <span className="ml-2 text-white/80">Day {Math.round(safePlaybackDay)}</span> : null}
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

            return (
              <g key={day}>
                <text
                  x={getX(day)}
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
            points={expectedPolylinePoints}
            fill="none"
            stroke="#6B7280"
            strokeWidth="3"
            strokeDasharray="8,4"
          />

          {series.barValues.map((value, idx) => {
            const day = idx + 1;

            if (day > actualVisibleDay) {
              return null;
            }

            const ratio = safeMaxValue > 0 ? value / safeMaxValue : 0;
            const barHeight = Math.max(0, ratio * BAR_AREA_HEIGHT);
            const x = getX(day);

            const roundedVariance = series.roundedVarianceByDay[idx] || 0;
            const varianceText =
              roundedVariance > 0 ? `+${roundedVariance}` : `${roundedVariance}`;
            const varianceColor =
              roundedVariance > 0
                ? "fill-green-600 dark:fill-green-400"
                : roundedVariance < 0
                ? "fill-red-600 dark:fill-red-400"
                : "fill-gray-500 dark:fill-gray-400";

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
                  y={BASELINE_Y - barHeight - 6}
                  textAnchor="middle"
                  className={`text-[9px] font-bold ${varianceColor}`}
                >
                  {varianceText}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
};