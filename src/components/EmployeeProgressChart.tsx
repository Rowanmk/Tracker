import React, { useState, useEffect, useMemo, useRef } from 'react';
import { loadTargets } from '../utils/loadTargets';
import type { FinancialYear } from '../utils/financialYear';

interface EmployeeProgressChartProps {
  services: any[];
  staffPerformance: any[];
  viewMode: "percent" | "numbers";
  workingDays: number;
  workingDaysUpToToday: number;
  month: number;
  financialYear: FinancialYear;
  selectedTeamId: string | null;
  teams: any[];
  playbackDay?: number;
}

const VIEWBOX_HEIGHT = 300;
const BASELINE_Y = 250;
const TOP_MARGIN = 20;
const BAR_AREA_HEIGHT = BASELINE_Y - TOP_MARGIN;
const CHART_WIDTH = 800;
const FIXED_LEFT_MARGIN = 60;
const RIGHT_PADDING = 40;
const BAR_ANIMATION_DURATION_MS = 180;

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
  const [animatedValues, setAnimatedValues] = useState<Record<string | number, number>>({});

  const animationFrameRef = useRef<number | null>(null);
  const animationStartRef = useRef<number | null>(null);
  const animationFromRef = useRef<Record<string | number, number>>({});
  const animationToRef = useRef<Record<string | number, number>>({});

  const isAllTeams = selectedTeamId === "all";
  const isTeamView = selectedTeamId === "team-view";
  const roundedPlaybackDay = playbackDay ? Math.max(1, Math.round(playbackDay)) : undefined;

  useEffect(() => {
    const fetchTargets = async () => {
      setLoading(true);
      try {
        if (isAllTeams) {
          const tTargets: Record<number, number> = {};
          for (const team of teams) {
            const { totalTarget } = await loadTargets(month, financialYear, undefined, team.id);
            tTargets[team.id] = totalTarget;
          }
          setTeamTargets(tTargets);
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

        const { perService } = await loadTargets(month, financialYear, undefined, Number(selectedTeamId));
        setServiceTargets(perService);
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

    fetchTargets();
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
        .filter((t) => t.delivered > 0 || t.target > 0)
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
        .filter((staff) => staff.delivered > 0 || staff.target > 0)
        .sort((a, b) => b.runRatePercent - a.runRatePercent);
    }

    return services.map((service) => {
      const delivered = staffPerformance.reduce((sum, s) => sum + (s.services[service.service_name] || 0), 0);
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

  const targetDisplayValues = useMemo(() => {
    const nextValues: Record<string | number, number> = {};

    chartData.forEach((data) => {
      const display = viewMode === "percent"
        ? data.runRatePercent
        : Math.min(data.delivered, data.expectedByToday);

      nextValues[data.id] = Math.max(0, display);
    });

    return nextValues;
  }, [chartData, viewMode]);

  useEffect(() => {
    if (animationFrameRef.current !== null) {
      window.cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    const currentMap: Record<string | number, number> = {};
    chartData.forEach((data) => {
      currentMap[data.id] = animatedValues[data.id] ?? targetDisplayValues[data.id] ?? 0;
    });

    const hasChanged = chartData.some((data) => {
      const current = currentMap[data.id] ?? 0;
      const target = targetDisplayValues[data.id] ?? 0;
      return Math.abs(current - target) > 0.01;
    });

    if (!hasChanged) {
      setAnimatedValues(currentMap);
      return;
    }

    animationStartRef.current = null;
    animationFromRef.current = currentMap;
    animationToRef.current = targetDisplayValues;

    const animate = (timestamp: number) => {
      if (animationStartRef.current === null) {
        animationStartRef.current = timestamp;
      }

      const elapsed = timestamp - animationStartRef.current;
      const progress = Math.min(elapsed / BAR_ANIMATION_DURATION_MS, 1);
      const easedProgress = 1 - Math.pow(1 - progress, 3);

      const nextFrameValues: Record<string | number, number> = {};
      chartData.forEach((data) => {
        const from = animationFromRef.current[data.id] ?? 0;
        const to = animationToRef.current[data.id] ?? 0;
        nextFrameValues[data.id] = from + (to - from) * easedProgress;
      });

      setAnimatedValues(nextFrameValues);

      if (progress < 1) {
        animationFrameRef.current = window.requestAnimationFrame(animate);
      } else {
        animationFrameRef.current = null;
        animationStartRef.current = null;
        setAnimatedValues(animationToRef.current);
      }
    };

    animationFrameRef.current = window.requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [chartData, targetDisplayValues]);

  const getBarColor = (percentage: number) => {
    if (percentage >= 90) return "#008A00";
    if (percentage >= 75) return "#FF8A2A";
    return "#FF3B30";
  };

  const formatAxisLabel = (label: string, maxChars: number) => {
    if (label.length <= maxChars) return label;
    return `${label.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
  };

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md border border-gray-200 dark:border-gray-700 h-[418px] flex flex-col tile-brand transition-all duration-300 ease-in-out">
        <div className="tile-header px-4 py-1.5">Progress Chart</div>
        <div className="flex-1 flex items-center justify-center text-gray-500">Loading…</div>
      </div>
    );
  }

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
  ) || 1;

  const yMax = viewMode === "percent" ? stablePercentMax : stableNumbersMax;

  const chartTitle = isAllTeams
    ? "Accountant Progress Chart"
    : isTeamView
    ? "Service Progress Chart"
    : "Service Progress Chart";

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
          <line
            x1={FIXED_LEFT_MARGIN}
            y1={BASELINE_Y}
            x2={CHART_WIDTH - 20}
            y2={BASELINE_Y}
            stroke="#6B7280"
            strokeWidth="1"
          />

          {chartData.map((data, i) => {
            const { label, runRatePercent } = data;

            const animatedDisplay = animatedValues[data.id] ?? targetDisplayValues[data.id] ?? 0;
            const clampedDisplay = Math.max(0, Math.min(animatedDisplay, yMax));
            const barHeight = (clampedDisplay / yMax) * BAR_AREA_HEIGHT;
            const x = FIXED_LEFT_MARGIN + (i * barSlotWidth) + (barSlotWidth / 2);
            const barColor = getBarColor(runRatePercent);
            const displayLabel = formatAxisLabel(label, axisLabelCharLimit);

            return (
              <g key={data.id}>
                <rect
                  x={x - barWidth / 2}
                  y={BASELINE_Y - barHeight}
                  width={barWidth}
                  height={barHeight}
                  fill={barColor}
                  rx="4"
                  style={{
                    transform: "translateZ(0)",
                  }}
                />

                <text
                  x={x}
                  y={BASELINE_Y - barHeight - 8}
                  textAnchor="middle"
                  className="text-[12px] font-bold fill-gray-700 dark:fill-gray-300"
                >
                  {viewMode === "percent" ? `${Math.round(animatedDisplay)}%` : Math.round(animatedDisplay)}
                </text>

                <text
                  x={x}
                  y={axisLabelY}
                  textAnchor="middle"
                  className="text-[12px] font-medium fill-gray-600 dark:fill-gray-400"
                  transform={shouldRotateLabels ? `rotate(-35 ${x} ${axisLabelY})` : undefined}
                >
                  <title>{label}</title>
                  {displayLabel}
                </text>
              </g>
            );
          })}

          {viewMode === "percent" && (
            <line
              x1={FIXED_LEFT_MARGIN}
              x2={CHART_WIDTH - 20}
              y1={BASELINE_Y - (100 / yMax) * BAR_AREA_HEIGHT}
              y2={BASELINE_Y - (100 / yMax) * BAR_AREA_HEIGHT}
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