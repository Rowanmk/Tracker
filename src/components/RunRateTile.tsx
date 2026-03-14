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

export const RunRateTile: React.FC&lt;RunRateTileProps&gt; = ({
  workingDays,
  dailyActivities,
  month,
  financialYear,
  target,
  viewMode = "numbers",
  playbackDay,
}) =&gt; {
  const selectedYear = month &gt;= 4 ? financialYear.start : financialYear.end;
  const daysInSelectedMonth = new Date(selectedYear, month, 0).getDate();

  const today = new Date();
  const currentDay = today.getDate();
  const currentMonth = today.getMonth() + 1;
  const currentYear = today.getFullYear();
  const isCurrentMonth = month === currentMonth &amp;&amp; selectedYear === currentYear;

  const dailyTarget = workingDays &gt; 0 ? target / workingDays : 0;

  const workingDaysList: number[] = [];
  for (let d = 1; d &lt;= daysInSelectedMonth; d++) {
    const dow = new Date(selectedYear, month - 1, d).getDay();
    if (dow !== 0 &amp;&amp; dow !== 6) workingDaysList.push(d);
  }

  const deliveredByDay: Record&lt;number, number&gt; = {};
  dailyActivities.forEach((a) =&gt; {
    deliveredByDay[a.day] = (deliveredByDay[a.day] || 0) + a.delivered_count;
  });

  let expectedCumulative: number[] = [];
  const actualCumulative: number[] = [];
  let eSum = 0;
  let aSum = 0;

  for (let d = 1; d &lt;= daysInSelectedMonth; d++) {
    if (workingDaysList.includes(d)) eSum += dailyTarget;
    expectedCumulative.push(eSum);
    aSum += deliveredByDay[d] || 0;
    actualCumulative.push(aSum);
  }

  const rawExpectedEnd = expectedCumulative[expectedCumulative.length - 1] || 0;
  if (rawExpectedEnd &gt; 0 &amp;&amp; target &gt; 0) {
    const scaleFactor = target / rawExpectedEnd;
    expectedCumulative = expectedCumulative.map((value) =&gt; value * scaleFactor);
  }

  const defaultProgressLimit = isCurrentMonth ? Math.min(currentDay, daysInSelectedMonth) : daysInSelectedMonth;
  const progressLimit = playbackDay ?? defaultProgressLimit;
  const clampedPlaybackDay = Math.max(1, Math.min(progressLimit, daysInSelectedMonth));
  const wholeDaysToRender = Math.floor(clampedPlaybackDay);
  const partialDayProgress = clampedPlaybackDay - wholeDaysToRender;

  let barValues: number[] = [];
  let expectedValues: number[] = [];
  let safeMaxValue: number;

  if (viewMode === "percent") {
    barValues = actualCumulative.map((value) =&gt;
      target &gt; 0 ? (value / target) * 100 : 0
    );
    expectedValues = expectedCumulative.map((value) =&gt;
      target &gt; 0 ? (value / target) * 100 : 0
    );
    safeMaxValue = Math.max(100, ...expectedValues, ...barValues);
  } else {
    barValues = [...actualCumulative];
    expectedValues = [...expectedCumulative];
    safeMaxValue = Math.max(...expectedCumulative, ...barValues, target, 1);
  }

  const displayedBarValues = barValues.map((value, index) =&gt; {
    const day = index + 1;

    if (day &lt;= wholeDaysToRender) {
      return value;
    }

    if (day === wholeDaysToRender + 1 &amp;&amp; partialDayProgress &gt; 0) {
      const previousValue = index &gt; 0 ? barValues[index - 1] : 0;
      return previousValue + (value - previousValue) * partialDayProgress;
    }

    return 0; // Do not show actuals for future days
  });

  const yAxisSteps = Array.from({ length: 5 }, (_, index) =&gt; Math.round((safeMaxValue / 4) * index));

  const formatYAxisValue = (value: number) =&gt; {
    if (viewMode === "percent") {
      return `${Math.round(value)}%`;
    }

    return Number.isInteger(value) ? value.toString() : value.toFixed(0);
  };

  const availableWidth = CHART_WIDTH - FIXED_LEFT_MARGIN - RIGHT_PADDING;
  const daySlotWidth = availableWidth / Math.max(daysInSelectedMonth, 1);
  const barWidth = Math.min(daySlotWidth * 0.8, 16);

  const getX = (day: number) =&gt; FIXED_LEFT_MARGIN + ((day - 1) * daySlotWidth) + (daySlotWidth / 2);

  return (
    &lt;div className="bg-white dark:bg-gray-800 rounded-xl shadow-md border border-gray-200 dark:border-gray-700 h-[418px] flex flex-col tile-brand transition-all duration-300 ease-in-out"&gt;
      &lt;div className="tile-header px-4 py-1.5"&gt;
        Run Rate
        {playbackDay ? &lt;span className="ml-2 text-white/80"&gt;Day {Math.round(clampedPlaybackDay)}&lt;/span&gt; : null}
      &lt;/div&gt;

      &lt;div className="flex-1 flex flex-col justify-end p-3 pb-2 overflow-hidden"&gt;
        &lt;svg
          viewBox={`0 0 ${CHART_WIDTH} ${VIEWBOX_HEIGHT}`}
          preserveAspectRatio="none"
          className="w-full h-full"
          style={{ overflow: "hidden", display: "block" }}
        &gt;
          &lt;line
            x1={FIXED_LEFT_MARGIN}
            y1={BASELINE_Y}
            x2={CHART_WIDTH - 20}
            y2={BASELINE_Y}
            stroke="#6B7280"
            strokeWidth="1"
          /&gt;

          {yAxisSteps.map((tick) =&gt; {
            const y = BASELINE_Y - (tick / safeMaxValue) * BAR_AREA_HEIGHT;

            return (
              &lt;g key={tick}&gt;
                &lt;text
                  x={FIXED_LEFT_MARGIN - 10}
                  y={y + 4}
                  textAnchor="end"
                  className="text-[10px] fill-gray-600 dark:fill-gray-400"
                &gt;
                  {formatYAxisValue(tick)}
                &lt;/text&gt;
                {tick &gt; 0 &amp;&amp; (
                  &lt;line
                    x1={FIXED_LEFT_MARGIN}
                    y1={y}
                    x2={CHART_WIDTH - 20}
                    y2={y}
                    stroke="#E5E7EB"
                    strokeDasharray="4,4"
                    className="dark:stroke-gray-600"
                  /&gt;
                )}
              &lt;/g&gt;
            );
          })}

          {Array.from({ length: Math.floor(daysInSelectedMonth / 5) }, (_, i) =&gt; {
            const day = (i + 1) * 5;
            if (day &gt; daysInSelectedMonth) return null;
            const x = getX(day);
            return (
              &lt;g key={day}&gt;
                &lt;text
                  x={x}
                  y={BASELINE_Y + 15}
                  textAnchor="middle"
                  className="text-[10px] font-medium fill-gray-600 dark:fill-gray-400"
                &gt;
                  {day}
                &lt;/text&gt;
              &lt;/g&gt;
            );
          })}

          &lt;polyline
            points={expectedValues
              .map((v, i) =&gt; {
                const x = getX(i + 1);
                const y = BASELINE_Y - (v / safeMaxValue) * BAR_AREA_HEIGHT;
                return `${x},${y}`;
              })
              .join(" ")}
            fill="none"
            stroke="#6B7280"
            strokeWidth="3"
            strokeDasharray="8,4"
            style={{ transition: "all 180ms ease-out" }}
          /&gt;

          {displayedBarValues.map((value, idx) =&gt; {
            const day = idx + 1;
            const ratio = safeMaxValue &gt; 0 ? value / safeMaxValue : 0;
            const barHeight = Math.max(0, ratio * BAR_AREA_HEIGHT);
            const x = getX(day);

            const isVisible = day &lt;= wholeDaysToRender || (day === wholeDaysToRender + 1 &amp;&amp; partialDayProgress &gt; 0);
            
            const interpolatedRawValue = viewMode === "percent" ? (target &gt; 0 ? (value / 100) * target : 0) : value;
            const rawVariance = interpolatedRawValue - expectedCumulative[idx];
            const roundedVariance = Math.round(rawVariance);
            
            const varianceText = roundedVariance &gt; 0 ? `+${roundedVariance}` : roundedVariance === 0 ? "0" : `${roundedVariance}`;
            const varianceColor = roundedVariance &gt; 0 ? "fill-green-600 dark:fill-green-400" : roundedVariance &lt; 0 ? "fill-red-600 dark:fill-red-400" : "fill-gray-500 dark:fill-gray-400";

            return (
              &lt;g key={day}&gt;
                &lt;rect
                  x={x - barWidth / 2}
                  y={BASELINE_Y - barHeight}
                  width={barWidth}
                  height={barHeight}
                  fill="#001B47"
                  rx={2}
                  style={{
                    transition: "y 180ms ease-out, height 180ms ease-out",
                    transform: "translateZ(0)",
                  }}
                /&gt;
                {isVisible &amp;&amp; (
                  &lt;text
                    x={x}
                    y={BASELINE_Y - barHeight - 6}
                    textAnchor="middle"
                    className={`text-[9px] font-bold ${varianceColor}`}
                    style={{
                      transition: "y 180ms ease-out",
                    }}
                  &gt;
                    {varianceText}
                  &lt;/text&gt;
                )}
              &lt;/g&gt;
            );
          })}
        &lt;/svg&gt;
      &lt;/div&gt;
    &lt;/div&gt;
  );
};