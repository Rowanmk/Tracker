import React, { useEffect, useMemo, useRef, useState } from 'react';
import { loadTargets } from '../utils/loadTargets';
import type { FinancialYear } from '../utils/financialYear';
import { useChartTheme } from '../context/ChartThemeContext';

interface EmployeeProgressChartProps {
  services: Array<{
    service_id: number;
    service_name: string;
  }>;
  staffPerformance: Array<{
    staff_id: number;
    name: string;
    services: Record<string, number>;
    total: number;
    target: number;
    team_id?: number | null;
  }>;
  viewMode: "percent" | "numbers";
  workingDays: number;
  workingDaysUpToToday: number;
  month: number;
  financialYear: FinancialYear;
  selectedTeamId: string | null;
  teams: Array<{
    id: number;
    name: string;
  }>;
  playbackDay?: number;
}

interface AccountantBreakdown {
  staff_id: number;
  name: string;
  delivered: number;
  target: number;
  expectedByToday: number;
}

interface TooltipState {
  visible: boolean;
  x: number;
  y: number;
  barIndex: number;
  label: string;
  breakdown: AccountantBreakdown[];
}

const VIEWBOX_HEIGHT = 300;
const BASELINE_Y = 250;
const TOP_MARGIN = 20;
const BAR_AREA_HEIGHT = BASELINE_Y - TOP_MARGIN;
const CHART_WIDTH = 800;
const FIXED_LEFT_MARGIN = 60;
const RIGHT_PADDING = 40;

export const EmployeeProgressChart: React.FC<EmployeeProgressChartProps> = ({
  services,
  staffPerformance,
  viewMode,
  workingDays,
  workingDaysUpToToday,
  month,
  financialYear,
  selectedTeamId,
  teams,
  playbackDay,
}) => {
  const { theme } = useChartTheme();
  const [serviceTargets, setServiceTargets] = useState<Record<number, number>>({});
  const [staffTargets, setStaffTargets] = useState<Record<number, number>>({});
  const [teamTargets, setTeamTargets] = useState<Record<number, number>>({});
  const [perStaffServiceTargets, setPerStaffServiceTargets] = useState<Record<number, Record<number, number>>>({});
  const [loading, setLoading] = useState(false);
  const [tooltip, setTooltip] = useState<TooltipState>({
    visible: false,
    x: 0,
    y: 0,
    barIndex: -1,
    label: '',
    breakdown: [],
  });

  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const isAllTeams = selectedTeamId === "all";
  const isTeamView = selectedTeamId === "team-view";
  const roundedPlaybackDay = playbackDay ? Math.max(1, Math.ceil(playbackDay)) : undefined;

  useEffect(() => {
    const fetchTargets = async () => {
      setLoading(true);
      try {
        if (isAllTeams) {
          const teamResults = await Promise.all(
            teams.map(async (team) => {
              const { totalTarget } = await loadTargets(month, financialYear, undefined, team.id);
              return { teamId: team.id, totalTarget };
            })
          );
          const nextTeamTargets: Record<number, number> = {};
          teamResults.forEach(({ teamId, totalTarget }) => {
            nextTeamTargets[teamId] = totalTarget;
          });
          setTeamTargets(nextTeamTargets);
          setStaffTargets({});
          setServiceTargets({});
          setPerStaffServiceTargets({});
          return;
        }

        if (isTeamView) {
          const staffResults = await Promise.all(
            staffPerformance.map(async (staff) => {
              const { totalTarget, perService } = await loadTargets(month, financialYear, staff.staff_id);
              return { staffId: staff.staff_id, totalTarget, perService };
            })
          );
          const nextStaffTargets: Record<number, number> = {};
          const nextPerStaffServiceTargets: Record<number, Record<number, number>> = {};
          staffResults.forEach(({ staffId, totalTarget, perService }) => {
            nextStaffTargets[staffId] = totalTarget;
            nextPerStaffServiceTargets[staffId] = perService;
          });
          setStaffTargets(nextStaffTargets);
          setTeamTargets({});
          setServiceTargets({});
          setPerStaffServiceTargets(nextPerStaffServiceTargets);
          return;
        }

        const selectedStaffId = Number(selectedTeamId);
        if (!Number.isNaN(selectedStaffId) && selectedStaffId > 0) {
          const { perService } = await loadTargets(month, financialYear, selectedStaffId);
          setServiceTargets(perService);
          setPerStaffServiceTargets({ [selectedStaffId]: perService });
        } else {
          const staffResults = await Promise.all(
            staffPerformance.map(async (staff) => {
              const { perService } = await loadTargets(month, financialYear, staff.staff_id);
              return { staffId: staff.staff_id, perService };
            })
          );
          const nextPerStaffServiceTargets: Record<number, Record<number, number>> = {};
          const nextServiceTargets: Record<number, number> = {};
          staffResults.forEach(({ staffId, perService }) => {
            nextPerStaffServiceTargets[staffId] = perService;
            Object.entries(perService).forEach(([sid, val]) => {
              const numSid = Number(sid);
              nextServiceTargets[numSid] = (nextServiceTargets[numSid] || 0) + val;
            });
          });
          setServiceTargets(nextServiceTargets);
          setPerStaffServiceTargets(nextPerStaffServiceTargets);
        }
        setStaffTargets({});
        setTeamTargets({});
      } catch (err) {
        setServiceTargets({});
        setStaffTargets({});
        setTeamTargets({});
        setPerStaffServiceTargets({});
      } finally {
        setLoading(false);
      }
    };

    void fetchTargets();

    const handler = () => {
      void fetchTargets();
    };
    window.addEventListener('activity-updated', handler);
    window.addEventListener('targets-updated', handler);
    return () => {
      window.removeEventListener('activity-updated', handler);
      window.removeEventListener('targets-updated', handler);
    };
  }, [month, financialYear, isAllTeams, isTeamView, selectedTeamId, teams, staffPerformance]);

  const chartData = useMemo(() => {
    if (isAllTeams) {
      return teams
        .map((team) => {
          const teamStaff = staffPerformance.filter((s) => s.team_id === team.id);
          const delivered = teamStaff.reduce((sum, s) => sum + s.total, 0);
          const target = teamTargets[team.id] || 0;
          const expectedByToday =
            workingDays > 0 ? (target / workingDays) * workingDaysUpToToday : 0;
          const runRatePercent =
            expectedByToday > 0 ? (delivered / expectedByToday) * 100 : 0;

          return {
            id: team.id,
            label: team.name,
            delivered,
            target,
            expectedByToday,
            runRatePercent,
            breakdown: [] as AccountantBreakdown[],
          };
        })
        .filter((item) => item.delivered > 0 || item.target > 0)
        .sort((a, b) => b.delivered - a.delivered);
    }

    if (isTeamView) {
      return staffPerformance
        .map((staff) => {
          const delivered = staff.total || 0;
          const target = staffTargets[staff.staff_id] || staff.target || 0;
          const expectedByToday =
            workingDays > 0 ? (target / workingDays) * workingDaysUpToToday : 0;
          const runRatePercent =
            expectedByToday > 0 ? (delivered / expectedByToday) * 100 : 0;

          const breakdown: AccountantBreakdown[] = services.map((service) => {
            const serviceDelivered = staff.services[service.service_name] || 0;
            const serviceTarget = perStaffServiceTargets[staff.staff_id]?.[service.service_id] || 0;
            const serviceExpectedByToday =
              workingDays > 0 ? (serviceTarget / workingDays) * workingDaysUpToToday : 0;
            return {
              staff_id: service.service_id,
              name: service.service_name,
              delivered: serviceDelivered,
              target: serviceTarget,
              expectedByToday: serviceExpectedByToday,
            };
          }).filter((b) => b.delivered > 0 || b.target > 0);

          return {
            id: staff.staff_id,
            label: staff.name,
            delivered,
            target,
            expectedByToday,
            runRatePercent,
            breakdown,
          };
        })
        .filter((item) => item.delivered > 0 || item.target > 0)
        .sort((a, b) => b.runRatePercent - a.runRatePercent);
    }

    return services.map((service) => {
      const delivered = staffPerformance.reduce(
        (sum, s) => sum + (s.services[service.service_name] || 0),
        0
      );
      const target = serviceTargets[service.service_id] || 0;
      const expectedByToday = workingDays > 0 ? (target / workingDays) * workingDaysUpToToday : 0;
      const runRatePercent = expectedByToday > 0 ? (delivered / expectedByToday) * 100 : 0;

      const breakdown: AccountantBreakdown[] = staffPerformance.map((staff) => {
        const staffDelivered = staff.services[service.service_name] || 0;
        const staffTarget = perStaffServiceTargets[staff.staff_id]?.[service.service_id] || 0;
        const staffExpectedByToday =
          workingDays > 0 ? (staffTarget / workingDays) * workingDaysUpToToday : 0;
        return {
          staff_id: staff.staff_id,
          name: staff.name,
          delivered: staffDelivered,
          target: staffTarget,
          expectedByToday: staffExpectedByToday,
        };
      }).filter((b) => b.delivered > 0 || b.target > 0);

      return {
        id: service.service_id,
        label: service.service_name,
        delivered,
        target,
        expectedByToday,
        runRatePercent,
        breakdown,
      };
    });
  }, [
    isAllTeams,
    isTeamView,
    teams,
    staffPerformance,
    services,
    serviceTargets,
    staffTargets,
    teamTargets,
    perStaffServiceTargets,
    workingDays,
    workingDaysUpToToday,
  ]);

  const barCount = chartData.length;
  const availableWidth = CHART_WIDTH - FIXED_LEFT_MARGIN - RIGHT_PADDING;
  const barSlotWidth = availableWidth / Math.max(barCount, 1);
  const barWidth = Math.min(barSlotWidth * 0.95, 200);

  const shouldRotateLabels =
    (isAllTeams || isTeamView) && (barCount > 8 || chartData.some((d) => d.label.length > 12));
  const axisLabelCharLimit = shouldRotateLabels ? 12 : 16;
  const axisLabelY = shouldRotateLabels ? BASELINE_Y + 22 : BASELINE_Y + 17;

  const stablePercentMax = 140;
  const stableNumbersMax = Math.max(
    ...chartData.map((d) => Math.max(d.target, d.delivered, d.expectedByToday)),
    1
  );
  const yMax = viewMode === "percent" ? stablePercentMax : stableNumbersMax;

  const chartTitle = isAllTeams
    ? "Accountant Progress Chart"
    : isTeamView
    ? "Service Progress Chart"
    : "Service Progress Chart";

  const axisTicks = useMemo(() => {
    const tickValues =
      viewMode === "percent"
        ? [0, 25, 50, 75, 100, 125]
        : Array.from({ length: 5 }, (_, index) => Math.round((yMax / 4) * index));

    return tickValues.map((tick) => ({
      value: tick,
      y: BASELINE_Y - (tick / Math.max(yMax, 1)) * BAR_AREA_HEIGHT,
    }));
  }, [viewMode, yMax]);

  const getBarColor = (percentage: number, index: number) => {
    if (viewMode === 'numbers') {
      return theme.palette[index % theme.palette.length];
    }
    if (percentage >= 90) return theme.palette[5] || '#008A00';
    if (percentage >= 75) return theme.palette[3] || '#FF8A2A';
    return theme.palette[4] || '#FF3B30';
  };

  const formatAxisLabel = (label: string, maxChars: number) => {
    if (label.length <= maxChars) return label;
    return `${label.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
  };

  const formatTick = (value: number) => {
    if (viewMode === "percent") {
      return `${Math.round(value)}%`;
    }
    return `${Math.round(value)}`;
  };

  const handleBarMouseEnter = (
    e: React.MouseEvent<SVGRectElement>,
    index: number,
    barTopY: number,
    barCenterX: number
  ) => {
    if (!svgRef.current || !containerRef.current) return;

    const svgRect = svgRef.current.getBoundingClientRect();
    const containerRect = containerRef.current.getBoundingClientRect();

    const scaleX = svgRect.width / CHART_WIDTH;
    const scaleY = svgRect.height / VIEWBOX_HEIGHT;

    const pixelX = svgRect.left - containerRect.left + barCenterX * scaleX;
    const pixelY = svgRect.top - containerRect.top + barTopY * scaleY;

    const data = chartData[index];
    if (!data) return;

    setTooltip({
      visible: true,
      x: pixelX,
      y: pixelY,
      barIndex: index,
      label: data.label,
      breakdown: data.breakdown,
    });
  };

  const handleBarMouseLeave = () => {
    setTooltip((prev) => ({ ...prev, visible: false }));
  };

  const gridDash = theme.gridStyle === 'dashed' ? '4,4' : undefined;
  const showGrid = theme.gridStyle !== 'none';

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md border border-gray-200 dark:border-gray-700 h-[418px] flex flex-col tile-brand transition-all duration-300 ease-in-out">
        <div className="tile-header px-4 py-1.5">Progress Chart</div>
        <div className="flex-1 flex items-center justify-center text-gray-500">Loading…</div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="bg-white dark:bg-gray-800 rounded-xl shadow-md border border-gray-200 dark:border-gray-700 h-[418px] flex flex-col tile-brand transition-all duration-300 ease-in-out relative"
      style={{ fontFamily: theme.fontFamily }}
    >
      <div className="tile-header px-4 py-1.5">
        {chartTitle}
        {roundedPlaybackDay ? <span className="ml-2 text-white/80">Day {roundedPlaybackDay}</span> : null}
      </div>

      <div className="flex-1 flex flex-col justify-end p-3 pb-2">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${CHART_WIDTH} ${VIEWBOX_HEIGHT}`}
          preserveAspectRatio="none"
          className="w-full h-full"
          style={{ overflow: 'visible' }}
        >
          {axisTicks.map((tick) => (
            <g key={tick.value}>
              <text
                x={FIXED_LEFT_MARGIN - 10}
                y={tick.y + 4}
                textAnchor="end"
                style={{ fill: theme.axisLabelColor }}
                className={`${theme.axisLabelSize} ${theme.axisLabelWeight}`}
              >
                {formatTick(tick.value)}
              </text>
              {tick.value > 0 && showGrid && (
                <line
                  x1={FIXED_LEFT_MARGIN}
                  y1={tick.y}
                  x2={CHART_WIDTH - 20}
                  y2={tick.y}
                  stroke={theme.gridColor}
                  strokeDasharray={gridDash}
                />
              )}
            </g>
          ))}

          <line
            x1={FIXED_LEFT_MARGIN}
            y1={BASELINE_Y}
            x2={CHART_WIDTH - 20}
            y2={BASELINE_Y}
            stroke={theme.axisLabelColor}
            strokeWidth="1"
          />

          {chartData.map((data, i) => {
            const displayValue =
              viewMode === "percent"
                ? data.runRatePercent
                : Math.min(data.delivered, data.expectedByToday);

            const clampedDisplay = Math.max(0, Math.min(displayValue, yMax));
            const barHeight = (clampedDisplay / Math.max(yMax, 1)) * BAR_AREA_HEIGHT;
            const x = FIXED_LEFT_MARGIN + i * barSlotWidth + barSlotWidth / 2;
            const barTopY = BASELINE_Y - barHeight;
            const barColor = getBarColor(data.runRatePercent, i);
            const displayLabel = formatAxisLabel(data.label, axisLabelCharLimit);

            return (
              <g key={data.id}>
                <rect
                  x={x - barWidth / 2}
                  y={barTopY}
                  width={barWidth}
                  height={barHeight}
                  fill={barColor}
                  rx={theme.barRadius}
                  style={{ cursor: 'pointer' }}
                  onMouseEnter={(e) => handleBarMouseEnter(e, i, barTopY, x)}
                  onMouseLeave={handleBarMouseLeave}
                />

                <text
                  x={x}
                  y={barTopY - 8}
                  textAnchor="middle"
                  style={{ fill: theme.axisLabelColor }}
                  className="text-[12px] font-bold"
                >
                  {viewMode === "percent" ? `${Math.round(displayValue)}%` : Math.round(displayValue)}
                </text>

                <text
                  x={x}
                  y={axisLabelY}
                  textAnchor="middle"
                  style={{ fill: theme.axisLabelColor }}
                  className={`${theme.axisLabelSize} ${theme.axisLabelWeight}`}
                  transform={shouldRotateLabels ? `rotate(-35 ${x} ${axisLabelY})` : undefined}
                >
                  <title>{data.label}</title>
                  {displayLabel}
                </text>
              </g>
            );
          })}

          {viewMode === "percent" && (
            <line
              x1={FIXED_LEFT_MARGIN}
              x2={CHART_WIDTH - 20}
              y1={BASELINE_Y - (100 / Math.max(yMax, 1)) * BAR_AREA_HEIGHT}
              y2={BASELINE_Y - (100 / Math.max(yMax, 1)) * BAR_AREA_HEIGHT}
              stroke={theme.palette[1] || theme.axisLabelColor}
              strokeDasharray="6,4"
              strokeWidth="2"
            />
          )}
        </svg>
      </div>

      {tooltip.visible && tooltip.breakdown.length > 0 && (
        <div
          className="absolute z-50 pointer-events-none"
          style={{
            left: Math.min(
              Math.max(tooltip.x, 130),
              containerRef.current ? containerRef.current.offsetWidth - 130 : tooltip.x
            ),
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
                {tooltip.label} — {isTeamView ? 'Service Split' : 'Accountant Split'}
              </span>
            </div>

            <div className={`px-3 py-1 border-b flex items-center justify-between ${
              theme.tooltipStyle === 'dark-pill'
                ? 'bg-gray-800 border-gray-700'
                : 'bg-gray-50 dark:bg-gray-800/40 border-gray-100 dark:border-gray-700'
            }`}>
              <span className="text-[9px] font-bold uppercase tracking-wider text-gray-400">
                {isTeamView ? 'Service' : 'Accountant'}
              </span>
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-bold uppercase tracking-wider text-gray-400">Del</span>
                <span className="text-[9px] font-bold uppercase tracking-wider text-gray-400 w-8 text-right">Tgt</span>
                <span className="text-[9px] font-bold uppercase tracking-wider text-gray-400 w-12 text-right">Run Rate</span>
              </div>
            </div>

            <div className={theme.tooltipStyle === 'dark-pill' ? 'divide-y divide-gray-800' : 'divide-y divide-gray-100 dark:divide-gray-800'}>
              {tooltip.breakdown.map((entry) => {
                const runRatePct = entry.expectedByToday > 0
                  ? Math.round((entry.delivered / entry.expectedByToday) * 100)
                  : null;
                const runRateColor =
                  runRatePct === null
                    ? theme.axisLabelColor
                    : runRatePct >= 90
                    ? theme.palette[5] || '#008A00'
                    : runRatePct >= 75
                    ? theme.palette[3] || '#FF8A2A'
                    : theme.palette[4] || '#FF3B30';

                return (
                  <div key={entry.staff_id} className="px-3 py-2 flex items-center justify-between gap-2">
                    <span className={`text-xs font-semibold truncate flex-1 ${
                      theme.tooltipStyle === 'dark-pill' ? 'text-gray-100' : 'text-gray-800 dark:text-gray-200'
                    }`}>
                      {entry.name}
                    </span>
                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className="text-xs font-bold"
                        style={{ color: theme.palette[0] || '#001B47' }}
                      >
                        {entry.delivered}
                      </span>
                      <span className="text-xs text-gray-400">/</span>
                      <span className={`text-xs w-8 text-right ${
                        theme.tooltipStyle === 'dark-pill' ? 'text-gray-300' : 'text-gray-600 dark:text-gray-400'
                      }`}>
                        {entry.target}
                      </span>
                      <span
                        className="text-[10px] font-bold w-12 text-right"
                        style={{ color: runRateColor }}
                      >
                        {runRatePct === null ? '—' : `${runRatePct}%`}
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
              <span className="text-[10px] text-gray-400">Delivered / Target · Run Rate % vs today's expected</span>
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