import React, { useState, useEffect, useMemo } from 'react';
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
  const [loading, setLoading] = useState(false);

  const isAllTeams = selectedTeamId === "all";

  useEffect(() => {
    const fetchServiceTargets = async () => {
      setLoading(true);
      try {
        const targetMap: Record<number, number> = {};
        for (const staff of staffPerformance) {
          const { perService } = await loadTargets(month, financialYear, staff.staff_id);
          Object.entries(perService).forEach(([serviceId, value]) => {
            const sid = parseInt(serviceId);
            targetMap[sid] = (targetMap[sid] || 0) + value;
          });
        }
        setServiceTargets(targetMap);
      } catch {
        setServiceTargets({});
      } finally {
        setLoading(false);
      }
    };

    if (!isAllTeams && staffPerformance.length > 0) {
      fetchServiceTargets();
    } else {
      setLoading(false);
    }
  }, [month, financialYear, staffPerformance, isAllTeams]);

  const chartData = useMemo(() => {
    if (isAllTeams) {
      return [...staffPerformance]
        .map((staff) => {
          const expectedByToday =
            workingDays > 0 ? (staff.target / workingDays) * workingDaysUpToToday : 0;
          const runRatePercent =
            expectedByToday > 0 ? (staff.total / expectedByToday) * 100 : 0;
          const teamName =
            teams.find((team) => team.id === staff.team_id)?.name || "Unassigned";

          return {
            id: staff.staff_id,
            label: staff.name,
            delivered: staff.total,
            target: staff.target,
            expectedByToday,
            runRatePercent,
            teamName,
          };
        })
        .sort((a, b) => b.delivered - a.delivered);
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
  }, [isAllTeams, teams, staffPerformance, services, serviceTargets, workingDays, workingDaysUpToToday]);

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
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md border border-gray-200 dark:border-gray-700 h-[500px] flex flex-col tile-brand transition-all duration-300 ease-in-out">
        <div className="tile-header px-4 py-1.5">Progress Chart</div>
        <div className="flex-1 flex items-center justify-center text-gray-500">Loading…</div>
      </div>
    );
  }

  const barCount = chartData.length;
  const FIXED_LEFT_MARGIN = 60;
  const CHART_WIDTH = 800;
  const AVAILABLE_WIDTH = CHART_WIDTH - FIXED_LEFT_MARGIN - 40;
  const BAR_SLOT_WIDTH = AVAILABLE_WIDTH / Math.max(barCount, 1);
  const BAR_WIDTH = Math.min(BAR_SLOT_WIDTH * 0.65, 60);

  const maxRunRatePercent = Math.max(...chartData.map(d => d.runRatePercent), 1);
  const maxDelivered = Math.max(...chartData.map(d => d.delivered), 1);
  const maxExpected = Math.max(...chartData.map(d => d.expectedByToday), 1);

  const maxValue = viewMode === "percent" ? maxRunRatePercent : Math.max(maxDelivered, maxExpected);
  const yMax = Math.max(maxValue * 1.10, 1);

  const shouldRotateLabels = isAllTeams && (barCount > 8 || chartData.some((d) => d.label.length > 12));
  const axisLabelCharLimit = shouldRotateLabels ? 12 : 16;
  const axisLabelY = shouldRotateLabels ? BASELINE_Y + 20 : BASELINE_Y + 15;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md border border-gray-200 dark:border-gray-700 h-[500px] flex flex-col tile-brand transition-all duration-300 ease-in-out">
      <div className="tile-header px-4 py-1.5">
        {isAllTeams ? "Team Progress Chart" : "Service Progress Chart"}
        {playbackDay ? <span className="ml-2 text-white/80">Day {playbackDay}</span> : null}
      </div>

      <div className="flex-1 flex flex-col justify-end p-3 pb-4">
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
            const { label, delivered, expectedByToday, runRatePercent } = data;

            let display;
            let barHeight;

            if (viewMode === "percent") {
              display = runRatePercent;
              barHeight = (runRatePercent / yMax) * BAR_AREA_HEIGHT;
            } else {
              display = Math.min(delivered, expectedByToday);
              barHeight = (display / yMax) * BAR_AREA_HEIGHT;
            }

            const x = FIXED_LEFT_MARGIN + (i * BAR_SLOT_WIDTH) + (BAR_SLOT_WIDTH / 2);
            const barColor = getBarColor(runRatePercent);
            const displayLabel = formatAxisLabel(label, axisLabelCharLimit);

            return (
              <g key={data.id}>
                <rect
                  x={x - BAR_WIDTH / 2}
                  y={BASELINE_Y - barHeight}
                  width={BAR_WIDTH}
                  height={barHeight}
                  fill={barColor}
                  rx="4"
                  className="transition-all duration-500 ease-in-out"
                />

                <text
                  x={x}
                  y={BASELINE_Y - barHeight - 8}
                  textAnchor="middle"
                  className="text-[10px] font-bold fill-gray-700 dark:fill-gray-300 transition-all duration-300 ease-in-out"
                >
                  {viewMode === "percent" ? `${Math.round(runRatePercent)}%` : Math.round(display)}
                </text>

                <text
                  x={x}
                  y={axisLabelY}
                  textAnchor="middle"
                  className="text-[10px] font-medium fill-gray-600 dark:fill-gray-400 transition-all duration-300 ease-in-out"
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
              className="transition-all duration-300 ease-in-out"
            />
          )}
        </svg>
      </div>
    </div>
  );
};