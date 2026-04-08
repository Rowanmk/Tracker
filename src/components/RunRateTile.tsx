import React, { useMemo, useRef, useState } from 'react';
import type { FinancialYear } from '../utils/financialYear';
import { getMonthYearFromFinancialYear } from '../utils/runRate';

interface AccountantDailyBreakdown {
  staff_id: number;
  name: string;
  cumulativeDelivered: number;
  sharePercent: number;
}

interface RunRateTileProps {
  workingDays: number;
  workingDaysUpToToday: number;
  dailyActivities: Array<{
    staff_id: number | null;
    service_id: number | null;
    delivered_count: number;
    month: number;
    year: number;
    day: number;
    date: string;
  }>;
  month: number;
  financialYear: FinancialYear;
  target: number;
  viewMode?: "percent" | "numbers";
  playbackDay?: number;
  totalDelivered?: number;
  staffPerformance?: Array<{
    staff_id: number;
    name: string;
  }>;
}

interface TooltipState {
  visible: boolean;
  day: number;
  x: number;
  y: number;
  breakdown: AccountantDailyBreakdown[];
  cumulativeTotal: number;
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
  staffPerformance = [],
}) => {
  const selectedYear = getMonthYearFromFinancialYear(month, financialYear);
  const daysInMonth = new Date(selectedYear, month, 0).getDate();
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [tooltip, setTooltip] = useState<TooltipState>({
    visible: false,
    day: 0,
    x: 0,
    y: 0,
    breakdown: [],
    cumulativeTotal: 0,
  });

  // Build list of working days (Mon–Fri) in the month
  const workingDaysList = useMemo(() => {
    const result: number[] = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const dow = new Date(selectedYear, month - 1, d).getDay();
      if (dow !== 0 && dow !== 6) result.push(d);
    }
    return result;
  }, [daysInMonth, month, selectedYear]);

  // Sum delivered_count per calendar day per staff from the already-filtered dailyActivities prop
  const deliveredByDayByStaff = useMemo(() => {
    const totals: Record<number, Record<number, number>> = {}; // day -> staff_id -> count
    dailyActivities.forEach((activity) => {
      const staffId = activity.staff_id ?? -1;
      if (!totals[activity.day]) totals[activity.day] = {};
      totals[activity.day][staffId] = (totals[activity.day][staffId] || 0) + activity.delivered_count;
    });
    return totals;
  }, [dailyActivities]);

  // Sum delivered_count per calendar day (all staff combined)
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
    // Raw cumulative actual delivered up to each calendar day
    let actualRunning = 0;
    const actualCumulativeRaw: number[] = [];
    for (let d = 1; d <= daysInMonth; d++) {
      actualRunning += deliveredByDay[d] || 0;
      actualCumulativeRaw.push(actualRunning);
    }

    // The final raw sum from dailyActivities
    const finalRawSum = actualRunning;

    // Scale factor: if totalDelivered is provided, scale so the final bar matches exactly
    const scaleFactor =
      totalDelivered !== undefined && finalRawSum > 0
        ? totalDelivered / finalRawSum
        : 1;

    const actualCumulative = actualCumulativeRaw.map((v) => v * scaleFactor);

    // Cumulative expected target line: advances only on working days
    let workingDaysElapsed = 0;
    const expectedCumulative: number[] = [];
    for (let d = 1; d <= daysInMonth; d++) {
      if (workingDaysList.includes(d)) {
        workingDaysElapsed += 1;
      }
      expectedCumulative.push(workingDays > 0 ? (target / workingDays) * workingDaysElapsed : 0);
    }

    // Variance above each bar
    const varianceByDay: number[] = actualCumulative.map((actual, idx) => {
      const expected = expectedCumulative[idx];
      return Math.round(actual) - Math.round(expected);
    });

    return { actualCumulative, expectedCumulative, varianceByDay, scaleFactor };
  }, [
    deliveredByDay,
    daysInMonth,
    workingDaysList,
    workingDays,
    target,
    totalDelivered,
  ]);

  // Build cumulative per-staff breakdown for each day
  const cumulativeByDayByStaff = useMemo(() => {
    const result: Record<number, Record<number, number>> = {}; // day -> staff_id -> cumulative
    const runningByStaff: Record<number, number> = {};

    for (let d = 1; d <= daysInMonth; d++) {
      const dayData = deliveredByDayByStaff[d] || {};
      Object.entries(dayData).forEach(([staffIdStr, count]) => {
        const staffId = Number(staffIdStr);
        runningByStaff[staffId] = (runningByStaff[staffId] || 0) + count;
      });
      result[d] = { ...runningByStaff };
    }
    return result;
  }, [deliveredByDayByStaff, daysInMonth]);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [series.expectedCumulative, yMax, daysInMonth]
  );

  // Build tooltip breakdown for a given day
  const buildBreakdown = (day: number): { breakdown: AccountantDailyBreakdown[]; cumulativeTotal: number } => {
    const cumulativeForDay = cumulativeByDayByStaff[day] || {};
    const scaleFactor = series.scaleFactor;

    // Total cumulative for this day (scaled)
    const rawTotal = Object.values(cumulativeForDay).reduce((s, v) => s + v, 0);
    const scaledTotal = rawTotal * scaleFactor;

    const breakdown: AccountantDailyBreakdown[] = [];

    // Build per-staff entries
    const staffMap = new Map(staffPerformance.map((s) => [s.staff_id, s.name]));

    Object.entries(cumulativeForDay).forEach(([staffIdStr, rawCumulative]) => {
      const staffId = Number(staffIdStr);
      if (staffId === -1) return; // skip unknown staff
      const name = staffMap.get(staffId) || `Staff #${staffId}`;
      const scaledCumulative = rawCumulative * scaleFactor;
      const sharePercent = scaledTotal > 0 ? Math.round((scaledCumulative / scaledTotal) * 100) : 0;

      breakdown.push({
        staff_id: staffId,
        name,
        cumulativeDelivered: Math.round(scaledCumulative),
        sharePercent,
      });
    });

    // Sort by cumulative delivered descending
    breakdown.sort((a, b) => b.cumulativeDelivered - a.cumulativeDelivered);

    return { breakdown, cumulativeTotal: Math.round(scaledTotal) };
  };

  const handleBarMouseEnter = (
    e: React.MouseEvent<SVGRectElement>,
    day: number,
    barHeightPx: number,
    barTopY: number
  ) => {
    if (!svgRef.current || !containerRef.current) return;

    const svgRect = svgRef.current.getBoundingClientRect();
    const containerRect = containerRef.current.getBoundingClientRect();

    // Convert SVG viewBox coordinates to actual pixel positions
    const svgWidth = svgRect.width;
    const svgHeight = svgRect.height;
    const scaleX = svgWidth / CHART_WIDTH;
    const scaleY = svgHeight / VIEWBOX_HEIGHT;

    const barCenterXSvg = getX(day);
    const barTopYSvg = barTopY;

    const pixelX = svgRect.left - containerRect.left + barCenterXSvg * scaleX;
    const pixelY = svgRect.top - containerRect.top + barTopYSvg * scaleY;

    const { breakdown, cumulativeTotal } = buildBreakdown(day);

    setTooltip({
      visible: true,
      day,
      x: pixelX,
      y: pixelY,
      breakdown,
      cumulativeTotal,
    });
  };

  const handleBarMouseLeave = () => {
    setTooltip((prev) => ({ ...prev, visible: false }));
  };

  return (
    <div
      ref={containerRef}
      className="bg-white dark:bg-gray-800 rounded-xl shadow-md border border-gray-200 dark:border-gray-700 h-[418px] flex flex-col tile-brand transition-all duration-300 ease-in-out relative"
    >
      <div className="tile-header px-4 py-1.5 flex items-center justify-between">
        <span>Run Rate</span>
        {playbackDay ? (
          <span className="text-white/80 text-sm">Day {Math.round(safePlaybackDay)}</span>
        ) : null}
      </div>

      <div className="flex-1 flex flex-col p-3 pb-2 overflow-hidden">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${CHART_WIDTH} ${VIEWBOX_HEIGHT}`}
          preserveAspectRatio="none"
          className="w-full h-full"
          style={{ overflow: 'visible', display: 'block' }}
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
            const barTopY = BASELINE_Y - barHeight;
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
                  y={barTopY}
                  width={barWidth}
                  height={barHeight}
                  fill="#001B47"
                  rx={2}
                  style={{ cursor: 'pointer' }}
                  onMouseEnter={(e) => handleBarMouseEnter(e, day, barHeight, barTopY)}
                  onMouseLeave={handleBarMouseLeave}
                />
                <text
                  x={x}
                  y={barTopY - 5}
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

      {/* Tooltip */}
      {tooltip.visible && tooltip.breakdown.length > 0 && (
        <div
          className="absolute z-50 pointer-events-none"
          style={{
            left: Math.min(tooltip.x, containerRef.current ? containerRef.current.offsetWidth - 240 : tooltip.x),
            top: tooltip.y - 8,
            transform: 'translate(-50%, -100%)',
          }}
        >
          <div
            className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-2xl overflow-hidden"
            style={{ minWidth: '210px', maxWidth: '260px' }}
          >
            {/* Header */}
            <div className="bg-[#001B47] px-3 py-2">
              <span className="text-white text-xs font-bold uppercase tracking-wide">
                Day {tooltip.day} — Accountant Split
              </span>
            </div>

            {/* Sub-header: cumulative total */}
            <div className="px-3 py-1.5 bg-gray-50 dark:bg-gray-800/60 border-b border-gray-100 dark:border-gray-700">
              <span className="text-[10px] text-gray-500 dark:text-gray-400">
                Cumulative total: <span className="font-bold text-gray-800 dark:text-gray-200">{tooltip.cumulativeTotal}</span>
              </span>
            </div>

            {/* Rows */}
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {tooltip.breakdown.map((entry) => (
                <div key={entry.staff_id} className="px-3 py-2 flex items-center justify-between gap-3">
                  <span className="text-xs font-semibold text-gray-800 dark:text-gray-200 truncate flex-1">
                    {entry.name}
                  </span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-xs font-bold text-[#001B47] dark:text-blue-300">
                      {entry.cumulativeDelivered}
                    </span>
                    <span
                      className="text-[10px] font-bold ml-1"
                      style={{
                        color:
                          entry.sharePercent >= 40
                            ? '#008A00'
                            : entry.sharePercent >= 20
                            ? '#FF8A2A'
                            : '#6B7280',
                      }}
                    >
                      {entry.sharePercent}%
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Footer hint */}
            <div className="bg-gray-50 dark:bg-gray-800/60 px-3 py-1.5 border-t border-gray-100 dark:border-gray-700">
              <span className="text-[10px] text-gray-400">Cumulative delivered / share of total</span>
            </div>
          </div>

          {/* Arrow */}
          <div className="flex justify-center">
            <div className="w-3 h-3 bg-white dark:bg-gray-900 border-r border-b border-gray-200 dark:border-gray-700 rotate-45 -mt-1.5" />
          </div>
        </div>
      )}
    </div>
  );
};