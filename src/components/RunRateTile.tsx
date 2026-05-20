import React, { useMemo, useRef, useState, useEffect } from 'react';
import type { FinancialYear } from '../utils/financialYear';
import { getMonthYearFromFinancialYear } from '../utils/runRate';
import { useChartTheme } from '../context/ChartThemeContext';

interface AccountantDailyBreakdown {
  staff_id: number;
  name: string;
  cumulativeDelivered: number;
  aheadBehind: number;
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
    target?: number;
  }>;
}

interface TooltipState {
  visible: boolean;
  day: number;
  x: number;
  y: number;
  breakdown: AccountantDailyBreakdown[];
  cumulativeTotal: number;
  expectedAtDay: number;
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
  totalDelivered: _totalDelivered,
  staffPerformance = [],
}) => {
  const { theme } = useChartTheme();
  const selectedYear = getMonthYearFromFinancialYear(month, financialYear);
  const daysInMonth = new Date(selectedYear, month, 0).getDate();
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [, setRefreshTrigger] = useState(0);

  useEffect(() => {
    const handler = () => setRefreshTrigger(prev => prev + 1);
    window.addEventListener('activity-updated', handler);
    window.addEventListener('targets-updated', handler);
    return () => {
      window.removeEventListener('activity-updated', handler);
      window.removeEventListener('targets-updated', handler);
    };
  }, []);

  const [tooltip, setTooltip] = useState<TooltipState>({
    visible: false,
    day: 0,
    x: 0,
    y: 0,
    breakdown: [],
    cumulativeTotal: 0,
    expectedAtDay: 0,
  });

  const workingDaysList = useMemo(() => {
    const result: number[] = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const dow = new Date(selectedYear, month - 1, d).getDay();
      if (dow !== 0 && dow !== 6) result.push(d);
    }
    return result;
  }, [daysInMonth, month, selectedYear]);

  const deliveredByDayByStaff = useMemo(() => {
    const totals: Record<number, Record<number, number>> = {};
    dailyActivities.forEach((activity) => {
      const staffId = activity.staff_id ?? -1;
      if (!totals[activity.day]) totals[activity.day] = {};
      totals[activity.day][staffId] = (totals[activity.day][staffId] || 0) + activity.delivered_count;
    });
    return totals;
  }, [dailyActivities]);

  const deliveredByDay = useMemo(() => {
    const totals: Record<number, number> = {};
    dailyActivities.forEach((activity) => {
      totals[activity.day] = (totals[activity.day] || 0) + activity.delivered_count;
    });
    return totals;
  }, [dailyActivities]);

  const safePlaybackDay = Math.max(1, Math.min(playbackDay ?? daysInMonth, daysInMonth));
  const playbackDayCapped = Math.ceil(safePlaybackDay);

  const series = useMemo(() => {
    let actualRunning = 0;
    const actualCumulativeRaw: number[] = [];
    for (let d = 1; d <= daysInMonth; d++) {
      actualRunning += deliveredByDay[d] || 0;
      actualCumulativeRaw.push(actualRunning);
    }

    const actualCumulative = actualCumulativeRaw;

    let workingDaysElapsed = 0;
    const expectedCumulative: number[] = [];
    for (let d = 1; d <= daysInMonth; d++) {
      if (workingDaysList.includes(d)) {
        workingDaysElapsed += 1;
      }
      expectedCumulative.push(workingDays > 0 ? (target / workingDays) * workingDaysElapsed : 0);
    }

    const varianceByDay: number[] = actualCumulative.map((actual, idx) => {
      const expected = expectedCumulative[idx];
      return Math.round(actual) - Math.round(expected);
    });

    return { actualCumulative, expectedCumulative, varianceByDay };
  }, [
    deliveredByDay,
    daysInMonth,
    workingDaysList,
    workingDays,
    target,
  ]);

  const cumulativeByDayByStaff = useMemo(() => {
    const result: Record<number, Record<number, number>> = {};
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

  const yMax = useMemo(() => {
    const maxActual = Math.max(...series.actualCumulative.slice(0, playbackDayCapped), 0);
    const maxExpected = Math.max(...series.expectedCumulative, 0);
    return Math.max(target, maxActual, maxExpected, 1) * 1.05;
  }, [series, target, playbackDayCapped]);

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

  const targetPolylinePoints = useMemo(
    () =>
      series.expectedCumulative
        .map((value, idx) => `${getX(idx + 1)},${toY(value)}`)
        .join(' '),
    [series.expectedCumulative, yMax, daysInMonth]
  );

  const buildBreakdown = (day: number): { breakdown: AccountantDailyBreakdown[]; cumulativeTotal: number; expectedAtDay: number } => {
    const cumulativeForDay = cumulativeByDayByStaff[day] || {};
    const cumulativeTotal = Object.values(cumulativeForDay).reduce((s, v) => s + v, 0);
    const expectedAtDay = series.expectedCumulative[day - 1] || 0;

    const staffMap = new Map(staffPerformance.map((s) => [s.staff_id, s]));
    const staffCount = staffPerformance.filter(s => s.staff_id !== -1).length || 1;
    const breakdown: AccountantDailyBreakdown[] = [];

    Object.entries(cumulativeForDay).forEach(([staffIdStr, cumulative]) => {
      const staffId = Number(staffIdStr);
      if (staffId === -1) return;
      const staffEntry = staffMap.get(staffId);
      const name = staffEntry?.name || `Staff #${staffId}`;
      const staffExpected = expectedAtDay / staffCount;
      const aheadBehind = Math.round(cumulative) - Math.round(staffExpected);

      breakdown.push({
        staff_id: staffId,
        name,
        cumulativeDelivered: Math.round(cumulative),
        aheadBehind,
      });
    });

    breakdown.sort((a, b) => b.cumulativeDelivered - a.cumulativeDelivered);
    return { breakdown, cumulativeTotal: Math.round(cumulativeTotal), expectedAtDay };
  };

  const handleBarMouseEnter = (
    e: React.MouseEvent<SVGRectElement>,
    day: number,
    _barHeightPx: number,
    barTopY: number
  ) => {
    if (!svgRef.current || !containerRef.current) return;

    const svgRect = svgRef.current.getBoundingClientRect();
    const containerRect = containerRef.current.getBoundingClientRect();

    const svgWidth = svgRect.width;
    const svgHeight = svgRect.height;
    const scaleX = svgWidth / CHART_WIDTH;
    const scaleY = svgHeight / VIEWBOX_HEIGHT;

    const barCenterXSvg = getX(day);
    const barTopYSvg = barTopY;

    const pixelX = svgRect.left - containerRect.left + barCenterXSvg * scaleX;
    const pixelY = svgRect.top - containerRect.top + barTopYSvg * scaleY;

    const { breakdown, cumulativeTotal, expectedAtDay } = buildBreakdown(day);

    setTooltip({
      visible: true,
      day,
      x: pixelX,
      y: pixelY,
      breakdown,
      cumulativeTotal,
      expectedAtDay,
    });
  };

  const handleBarMouseLeave = () => {
    setTooltip((prev) => ({ ...prev, visible: false }));
  };

  const lastDayWithActivity = useMemo(() => {
    const activeDays = Object.keys(deliveredByDay).map(Number);
    return activeDays.length > 0 ? Math.max(...activeDays) : 0;
  }, [deliveredByDay]);

  const dayFraction = safePlaybackDay - Math.floor(safePlaybackDay);
  const showGrid = theme.gridStyle !== 'none';
  const gridDash = theme.gridStyle === 'dashed' ? '4,4' : undefined;

  return (
    <div
      ref={containerRef}
      className="bg-white dark:bg-gray-800 rounded-xl shadow-md border border-gray-200 dark:border-gray-700 h-[418px] flex flex-col tile-brand transition-all duration-300 ease-in-out relative"
      style={{ fontFamily: theme.fontFamily }}
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
          {yAxisTicks.map((tick) => {
            const y = toY(tick);
            return (
              <g key={tick}>
                <text
                  x={FIXED_LEFT_MARGIN - 6}
                  y={y + 4}
                  textAnchor="end"
                  style={{ fill: theme.axisLabelColor }}
                  className={`${theme.axisLabelSize} ${theme.axisLabelWeight}`}
                >
                  {tick}
                </text>
                {tick > 0 && showGrid && (
                  <line
                    x1={FIXED_LEFT_MARGIN}
                    y1={y}
                    x2={CHART_WIDTH - RIGHT_PADDING}
                    y2={y}
                    stroke={theme.gridColor}
                    strokeDasharray={gridDash}
                  />
                )}
              </g>
            );
          })}

          <line
            x1={FIXED_LEFT_MARGIN}
            y1={BASELINE_Y}
            x2={CHART_WIDTH - RIGHT_PADDING}
            y2={BASELINE_Y}
            stroke={theme.axisLabelColor}
            strokeWidth="1"
          />

          {Array.from({ length: Math.floor(daysInMonth / 5) }, (_, i) => {
            const day = (i + 1) * 5;
            if (day > daysInMonth) return null;
            return (
              <text
                key={day}
                x={getX(day)}
                y={BASELINE_Y + 14}
                textAnchor="middle"
                style={{ fill: theme.axisLabelColor }}
                className={`${theme.axisLabelSize} ${theme.axisLabelWeight}`}
              >
                {day}
              </text>
            );
          })}

          {(() => {
            return series.actualCumulative.map((value, idx) => {
              const day = idx + 1;
              if (day > playbackDayCapped) return null;
              if (day > lastDayWithActivity) return null;
              if (value <= 0) return null;

              const isLeadingDay = day === playbackDayCapped && dayFraction > 0 && dayFraction < 1;
              const displayValue = isLeadingDay ? value * dayFraction : value;

              const barHeight = Math.max(0, (displayValue / yMax) * BAR_AREA_HEIGHT);
              const barTopY = BASELINE_Y - barHeight;
              const x = getX(day);
              const variance = series.varianceByDay[idx];
              const varianceLabel = variance > 0 ? `+${variance}` : `${variance}`;
              const varianceColor =
                variance > 0
                  ? theme.palette[5] || '#008A00'
                  : variance < 0
                  ? theme.palette[4] || '#FF3B30'
                  : theme.axisLabelColor;

              return (
                <g key={day}>
                  <rect
                    x={x - barWidth / 2}
                    y={barTopY}
                    width={barWidth}
                    height={barHeight}
                    fill={theme.palette[0] || '#001B47'}
                    rx={theme.barRadius}
                    style={{ cursor: 'pointer' }}
                    onMouseEnter={(e) => handleBarMouseEnter(e, day, barHeight, barTopY)}
                    onMouseLeave={handleBarMouseLeave}
                  />
                  {!isLeadingDay && (
                    <text
                      x={x}
                      y={barTopY - 5}
                      textAnchor="middle"
                      style={{ fontSize: 9, fontWeight: 700, fill: varianceColor }}
                    >
                      {varianceLabel}
                    </text>
                  )}
                </g>
              );
            });
          })()}

          <polyline
            points={targetPolylinePoints}
            fill="none"
            stroke={theme.palette[3] || theme.axisLabelColor}
            strokeWidth="2.5"
            strokeDasharray="7,4"
            strokeLinecap="round"
          />

          {target > 0 && (
            <text
              x={getX(daysInMonth) + 4}
              y={toY(target) + 4}
              style={{ fontSize: 9, fill: theme.axisLabelColor }}
              className={theme.axisLabelSize}
            >
              Target
            </text>
          )}
        </svg>

        <div className="flex items-center gap-4 mt-1 px-1">
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-3 rounded-sm" style={{ backgroundColor: theme.palette[0] || '#001B47' }} />
            <span className="text-[10px] text-gray-600 dark:text-gray-400 font-medium">Cumulative Delivered</span>
          </div>
          <div className="flex items-center gap-1.5">
            <svg width="20" height="8">
              <line x1="0" y1="4" x2="20" y2="4" stroke={theme.palette[3] || theme.axisLabelColor} strokeWidth="2" strokeDasharray="5,3" />
            </svg>
            <span className="text-[10px] text-gray-600 dark:text-gray-400 font-medium">Target Run Rate</span>
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-[10px] font-bold" style={{ color: theme.palette[5] || '#008A00' }}>+n ahead</span>
            <span className="text-[10px] font-bold" style={{ color: theme.palette[4] || '#FF3B30' }}>−n behind</span>
          </div>
        </div>
      </div>

      {tooltip.visible && tooltip.breakdown.length > 0 && (
        <div
          className="absolute z-50 pointer-events-none"
          style={{
            left: Math.min(tooltip.x, containerRef.current ? containerRef.current.offsetWidth - 260 : tooltip.x),
            top: tooltip.y - 8,
            transform: 'translate(-50%, -100%)',
          }}
        >
          <div
            className={`overflow-hidden ${theme.tooltipStyle === 'dark-pill'
              ? 'bg-gray-900 border border-gray-800 rounded-2xl shadow-2xl'
              : 'bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-2xl'
            }`}
            style={{ minWidth: '240px', maxWidth: '300px', fontFamily: theme.fontFamily }}
          >
            <div
              className="px-3 py-2"
              style={{ backgroundColor: theme.palette[0] || '#001B47' }}
            >
              <span className="text-white text-xs font-bold uppercase tracking-wide">
                Day {tooltip.day} — Accountant Split
              </span>
            </div>

            <div className={`px-3 py-1.5 border-b ${
              theme.tooltipStyle === 'dark-pill'
                ? 'bg-gray-800 border-gray-700'
                : 'bg-gray-50 dark:bg-gray-800/60 border-gray-100 dark:border-gray-700'
            }`}>
              <span className="text-[10px] text-gray-400">
                Cumulative total: <span className={theme.tooltipStyle === 'dark-pill' ? 'font-bold text-gray-100' : 'font-bold text-gray-800 dark:text-gray-200'}>{tooltip.cumulativeTotal}</span>
                <span className="mx-1.5 text-gray-300">·</span>
                Expected: <span className={theme.tooltipStyle === 'dark-pill' ? 'font-bold text-gray-100' : 'font-bold text-gray-800 dark:text-gray-200'}>{Math.round(tooltip.expectedAtDay)}</span>
              </span>
            </div>

            <div className={`px-3 py-1 border-b flex items-center justify-between ${
              theme.tooltipStyle === 'dark-pill'
                ? 'bg-gray-800 border-gray-700'
                : 'bg-gray-50 dark:bg-gray-800/40 border-gray-100 dark:border-gray-700'
            }`}>
              <span className="text-[9px] font-bold uppercase tracking-wider text-gray-400">Accountant</span>
              <div className="flex items-center gap-3">
                <span className="text-[9px] font-bold uppercase tracking-wider text-gray-400">Delivered</span>
                <span className="text-[9px] font-bold uppercase tracking-wider text-gray-400 w-14 text-right">+/−</span>
              </div>
            </div>

            <div className={theme.tooltipStyle === 'dark-pill' ? 'divide-y divide-gray-800' : 'divide-y divide-gray-100 dark:divide-gray-800'}>
              {tooltip.breakdown.map((entry) => {
                const aheadBehindLabel = entry.aheadBehind > 0
                  ? `+${entry.aheadBehind}`
                  : `${entry.aheadBehind}`;
                const aheadBehindColor =
                  entry.aheadBehind > 0
                    ? theme.palette[5] || '#008A00'
                    : entry.aheadBehind < 0
                    ? theme.palette[4] || '#FF3B30'
                    : theme.axisLabelColor;

                return (
                  <div key={entry.staff_id} className="px-3 py-2 flex items-center justify-between gap-2">
                    <span className={`text-xs font-semibold truncate flex-1 ${
                      theme.tooltipStyle === 'dark-pill' ? 'text-gray-100' : 'text-gray-800 dark:text-gray-200'
                    }`}>
                      {entry.name}
                    </span>
                    <div className="flex items-center gap-3 shrink-0">
                      <span
                        className="text-xs font-bold"
                        style={{ color: theme.palette[0] || '#001B47' }}
                      >
                        {entry.cumulativeDelivered}
                      </span>
                      <span
                        className="text-xs font-bold w-14 text-right"
                        style={{ color: aheadBehindColor }}
                      >
                        {aheadBehindLabel}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className={`px-3 py-1.5 border-t ${
              theme.tooltipStyle === 'dark-pill'
                ? 'bg-gray-800 border-gray-700'
                : 'bg-gray-50 dark:bg-gray-800/60 border-gray-100 dark:border-gray-700'
            }`}>
              <span className="text-[10px] text-gray-400">Delivered · Ahead (+) / Behind (−) of run rate</span>
            </div>
          </div>

          <div className="flex justify-center">
            <div
              className={`w-3 h-3 rotate-45 -mt-1.5 ${
                theme.tooltipStyle === 'dark-pill'
                  ? 'bg-gray-900 border-r border-b border-gray-800'
                  : 'bg-white dark:bg-gray-900 border-r border-b border-gray-200 dark:border-gray-700'
              }`}
            />
          </div>
        </div>
      )}
    </div>
  );
};