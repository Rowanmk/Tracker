import React, { useEffect, useMemo, useState } from 'react';
import { loadTargets } from '../utils/loadTargets';
import type { FinancialYear } from '../utils/financialYear';

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
  const [serviceTargets, setServiceTargets] = useState<Record<number, number>>({});
  const [staffTargets, setStaffTargets] = useState<Record<number, number>>({});
  const [teamTargets, setTeamTargets] = useState<Record<number, number>>({});
  const [loading, setLoading] = useState(false);

  const isAllTeams = selectedTeamId === "all";
  const isTeamView = selectedTeamId === "team-view";
  const roundedPlaybackDay = playbackDay ? Math.max(1, Math.round(playbackDay)) : undefined;

  useEffect(() => {
    const fetchTargets = async () => {
      setLoading(true);
      try {
        if (isAllTeams) {
          const nextTeamTargets: Record<number, number> = {};
          for (const team of teams) {
            const { totalTarget } = await loadTargets(month, financialYear, undefined, team.id);
            nextTeamTargets[team.id] = totalTarget;
          }
          setTeamTargets(nextTeamTargets);
          setStaffTargets({});
          setServiceTargets({});
          return;
        }

        if (isTeamView) {
          const nextStaffTargets: Record<number, number> = {};
          for (const staff of staffPerformance) {
            const { totalTarget } = await loadTargets(month, financialYear, staff.staff_id);
            nextStaffTargets[staff.staff_id] = totalTarget;
          }
          setStaffTargets(nextStaffTargets);
          setTeamTargets({});
          setServiceTargets({});
          return;
        }

        const selectedStaffId = Number(selectedTeamId);
        if (!Number.isNaN(selectedStaffId) && selectedStaffId > 0) {
          const { perService } = await loadTargets(month, financialYear, selectedStaffId);
          setServiceTargets(perService);
        } else {
          setServiceTargets({});
        }
        setStaffTargets({});
        setTeamTargets({});
      } catch {
        setServiceTargets({});
        setStaffTargets({});
        setTeamTargets({});
      } finally {
        setLoading(false);
      }
    };

    void fetchTargets();
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

          return {
            id: staff.staff_id,
            label: staff.name,
            delivered,
            target,
            expectedByToday,
            runRatePercent,
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

      return {
        id: service.service_id,
        label: service.service_name,
        delivered,
        target,
        expectedByToday,
        runRatePercent,
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

  const getBarColor = (percentage: number) => {
    if (percentage >= 90) return "#008A00";
    if (percentage >= 75) return "#FF8A2A";
    return "#FF3B30";
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

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md border border-gray-200 dark:border-gray-700 h-[418px] flex flex-col tile-brand transition-all duration-300 ease-in-out">
        <div className="tile-header px-4 py-1.5">Progress Chart</div>
        <div className="flex-1 flex items-center justify-center text-gray-500">Loading…</div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md border border-gray-200 dark:border-gray-700 h-[418px] flex flex-col tile-brand transition-all duration-300 ease-in-out">
      <div className="tile-header px-4 py-1.5">
        {chartTitle}
        {roundedPlaybackDay ? <span className="ml-2 text-white/80">Day {roundedPlaybackDay}</span> : null}
      </div>

      <div className="flex-1 flex flex-col justify-end p-3 pb-2">
        <svg
          viewBox={`0 0 ${CHART_WIDTH} ${VIEWBOX_HEIGHT}`}
          preserveAspectRatio="none"
          className="w-full h-full"
        >
          {axisTicks.map((tick) => (
            <g key={tick.value}>
              <text
                x={FIXED_LEFT_MARGIN - 10}
                y={tick.y + 4}
                textAnchor="end"
                className="text-[10px] fill-gray-600 dark:fill-gray-400"
              >
                {formatTick(tick.value)}
              </text>
              {tick.value > 0 && (
                <line
                  x1={FIXED_LEFT_MARGIN}
                  y1={tick.y}
                  x2={CHART_WIDTH - 20}
                  y2={tick.y}
                  stroke="#E5E7EB"
                  strokeDasharray="4,4"
                  className="dark:stroke-gray-600"
                />
              )}
            </g>
          ))}

          <line
            x1={FIXED_LEFT_MARGIN}
            y1={BASELINE_Y}
            x2={CHART_WIDTH - 20}
            y2={BASELINE_Y}
            stroke="#6B7280"
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
            const barColor = getBarColor(data.runRatePercent);
            const displayLabel = formatAxisLabel(data.label, axisLabelCharLimit);

            return (
              <g key={data.id}>
                <rect
                  x={x - barWidth / 2}
                  y={BASELINE_Y - barHeight}
                  width={barWidth}
                  height={barHeight}
                  fill={barColor}
                  rx="4"
                />

                <text
                  x={x}
                  y={BASELINE_Y - barHeight - 8}
                  textAnchor="middle"
                  className="text-[12px] font-bold fill-gray-700 dark:fill-gray-300"
                >
                  {viewMode === "percent" ? `${Math.round(displayValue)}%` : Math.round(displayValue)}
                </text>

                <text
                  x={x}
                  y={axisLabelY}
                  textAnchor="middle"
                  className="text-[12px] font-medium fill-gray-600 dark:fill-gray-400"
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
              stroke="#555"
              strokeDasharray="6,4"
              strokeWidth="2"
            />
          )}
        </svg>
      </div>
    </div>
  );
};