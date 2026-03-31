import * as React from 'react';
import type { FinancialYear } from '../utils/financialYear';
import { getFinancialYearMonths } from '../utils/financialYear';

interface TeamProgressData {
  team_id: number;
  name: string;
  fullYearTarget: number;
  submitted: number;
  leftToDo: number;
}

interface MonthlyPoint {
  month: number;
  percent: number;
}

interface SelfAssessmentProgressChartProps {
  teamProgress: TeamProgressData[];
  financialYear: FinancialYear;
  monthlyData: Record<number, Record<number, { submitted: number; target: number }>>;
  activeTeamId: number | null;
  onActiveTeamChange: (id: number | null) => void;
}

const VIEWBOX_WIDTH = 1000;
const VIEWBOX_HEIGHT = 460;
const PADDING_LEFT = 60;
const PADDING_RIGHT = 80;
const PADDING_TOP = 30;
const PADDING_BOTTOM = 70;

const CHART_WIDTH = VIEWBOX_WIDTH - PADDING_LEFT - PADDING_RIGHT;
const CHART_HEIGHT = VIEWBOX_HEIGHT - PADDING_TOP - PADDING_BOTTOM;

// SA delivery window months in order: Apr, May, Jun, Jul, Aug, Sep, Oct, Nov, Dec, Jan
const SA_MONTHS = [
  { number: 4 },
  { number: 5 },
  { number: 6 },
  { number: 7 },
  { number: 8 },
  { number: 9 },
  { number: 10 },
  { number: 11 },
  { number: 12 },
  { number: 1 },
];

function getMonthStartDate(monthNumber: number, financialYear: FinancialYear): Date {
  const year = monthNumber >= 4 ? financialYear.end : financialYear.end + 1;
  return new Date(year, monthNumber - 1, 1);
}

export const SelfAssessmentProgressChart: React.FC<SelfAssessmentProgressChartProps> = ({
  teamProgress,
  financialYear,
  monthlyData,
  activeTeamId,
  onActiveTeamChange,
}) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const months = SA_MONTHS;

  const visibleTeams = teamProgress.filter(t => t.fullYearTarget > 0);

  const colours = [
    '#001B47',
    '#0060B8',
    '#007EE0',
    '#FF8A2A',
    '#FFB000',
    '#008A00',
  ];

  // Build the target line from actual monthly target data.
  // For each month in the SA window, sum the targets across all visible teams,
  // then compute a cumulative % of the total full-year target.
  const targetLinePoints = React.useMemo(() => {
    // Sum monthly targets across all visible teams for each SA month
    const monthlyTargetTotals = months.map(m => {
      return visibleTeams.reduce((sum, team) => {
        return sum + (monthlyData[team.team_id]?.[m.number]?.target ?? 0);
      }, 0);
    });

    // Calculate the true total of all targets for the SA window
    const trueTotalTarget = monthlyTargetTotals.reduce((a, b) => a + b, 0);

    if (trueTotalTarget <= 0) {
      // Fallback: straight line from 0% to 100%
      return months.map((_, i) => (i / (months.length - 1)) * 100);
    }

    // Build cumulative target percentages
    let cumulative = 0;
    return monthlyTargetTotals.map(monthTarget => {
      cumulative += monthTarget;
      return (cumulative / trueTotalTarget) * 100;
    });
  }, [visibleTeams, monthlyData, months]);

  // For each team, build actual cumulative points — only up to today's month
  const chartData = React.useMemo(() => {
    return visibleTeams.map((team, idx) => {
      let cumulative = 0;

      // Use the true total target for this team as the denominator
      const teamTotalTarget = months.reduce((sum, m) => sum + (monthlyData[team.team_id]?.[m.number]?.target ?? 0), 0);
      const denominator = teamTotalTarget > 0 ? teamTotalTarget : team.fullYearTarget;

      const points: (MonthlyPoint & { isVisible: boolean })[] = months.map(m => {
        const monthStartDate = getMonthStartDate(m.number, financialYear);
        const isVisible = today >= monthStartDate;

        if (isVisible) {
          cumulative += monthlyData[team.team_id]?.[m.number]?.submitted ?? 0;
        }

        return {
          month: m.number,
          percent: isVisible && denominator > 0
            ? Math.min((cumulative / denominator) * 100, 100)
            : 0,
          isVisible,
        };
      });

      return {
        team_id: team.team_id,
        name: team.name,
        color: colours[idx % colours.length],
        points,
      };
    });
  }, [visibleTeams, months, monthlyData, financialYear, today]);

  const getX = (i: number) =>
    PADDING_LEFT + (CHART_WIDTH / (months.length - 1)) * i;

  const getY = (p: number) =>
    VIEWBOX_HEIGHT - PADDING_BOTTOM - (p / 100) * CHART_HEIGHT;

  // Build target polyline points from the target-sheet-derived data
  const targetPolylinePoints = targetLinePoints
    .map((p, i) => `${getX(i)},${getY(p)}`)
    .join(' ');

  return (
    <div className="flex flex-col h-full">
      <svg
        viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
        className="w-full flex-1"
      >
        {/* Axes */}
        <line
          x1={PADDING_LEFT}
          y1={PADDING_TOP}
          x2={PADDING_LEFT}
          y2={VIEWBOX_HEIGHT - PADDING_BOTTOM}
          stroke="#6B7280"
        />
        <line
          x1={PADDING_LEFT}
          y1={VIEWBOX_HEIGHT - PADDING_BOTTOM}
          x2={VIEWBOX_WIDTH - PADDING_RIGHT}
          y2={VIEWBOX_HEIGHT - PADDING_BOTTOM}
          stroke="#6B7280"
        />

        {/* Y-axis grid lines */}
        {[0, 25, 50, 75, 100].map(p => (
          <g key={p}>
            <text
              x={PADDING_LEFT - 10}
              y={getY(p) + 4}
              textAnchor="end"
              className="text-xs fill-gray-600"
            >
              {p}%
            </text>
            {p > 0 && (
              <line
                x1={PADDING_LEFT}
                y1={getY(p)}
                x2={VIEWBOX_WIDTH - PADDING_RIGHT}
                y2={getY(p)}
                stroke="#E5E7EB"
                strokeDasharray="4 4"
              />
            )}
          </g>
        ))}

        {/* X-axis month labels */}
        {months.map((m, i) => {
          const monthName = getFinancialYearMonths().find(fm => fm.number === m.number)?.name ?? String(m.number);
          return (
            <text
              key={m.number}
              x={getX(i)}
              y={VIEWBOX_HEIGHT - PADDING_BOTTOM + 22}
              textAnchor="middle"
              className="text-xs fill-gray-600"
            >
              {m.number === 1
                ? `${monthName} ${financialYear.end + 1}`
                : m.number === 4
                ? `${monthName} ${financialYear.end}`
                : monthName}
            </text>
          );
        })}

        {/* Target line — dotted grey, derived from target sheet monthly values */}
        <polyline
          points={targetPolylinePoints}
          fill="none"
          stroke="#9CA3AF"
          strokeWidth="2.5"
          strokeDasharray="6 4"
          strokeLinecap="round"
          opacity="0.85"
        />

        {/* Target line label at end */}
        <text
          x={getX(months.length - 1) + 8}
          y={getY(targetLinePoints[targetLinePoints.length - 1] ?? 100) + 4}
          className="text-xs fill-gray-400"
          fontSize="11"
        >
          Target
        </text>

        {/* Actual lines — only plot points up to today */}
        {chartData.map(team => {
          const visiblePoints = team.points
            .map((p, i) => ({ ...p, i }))
            .filter(p => p.isVisible);

          if (visiblePoints.length === 0) return null;

          const pathD = visiblePoints
            .map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${getX(p.i)} ${getY(p.percent)}`)
            .join(' ');

          return (
            <path
              key={team.team_id}
              d={pathD}
              fill="none"
              stroke={
                activeTeamId && activeTeamId !== team.team_id
                  ? '#9CA3AF'
                  : team.color
              }
              strokeWidth={activeTeamId === team.team_id ? 4.5 : 3}
              opacity={activeTeamId && activeTeamId !== team.team_id ? 0.5 : 1}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          );
        })}

        {/* Value labels for active team — only visible months */}
        {activeTeamId &&
          chartData
            .filter(team => team.team_id === activeTeamId)
            .map(team =>
              team.points
                .filter(p => p.isVisible)
                .map((p) => {
                  const actualIndex = team.points.findIndex(pt => pt.month === p.month);
                  return (
                    <text
                      key={`label-${team.team_id}-${p.month}`}
                      x={getX(actualIndex)}
                      y={getY(p.percent) - 10}
                      textAnchor="middle"
                      className="text-xs font-semibold fill-gray-800"
                    >
                      {Math.round(p.percent)}%
                    </text>
                  );
                })
            )}

        {/* End-of-line name labels when no team is active — only for visible data */}
        {!activeTeamId &&
          chartData.map(team => {
            const lastVisible = [...team.points]
              .reverse()
              .find(p => p.isVisible);

            if (!lastVisible) return null;

            const lastVisibleIndex = team.points.findIndex(p => p.month === lastVisible.month);

            return (
              <g key={`end-label-${team.team_id}`}>
                <text
                  x={getX(lastVisibleIndex) + 8}
                  y={getY(lastVisible.percent) + 4}
                  className="text-xs font-semibold fill-gray-800"
                >
                  {team.name}
                </text>
              </g>
            );
          })}
      </svg>

      {/* Legend */}
      <div className="mt-3 flex justify-center gap-3 flex-wrap">
        {/* Target line legend item */}
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-500">
          <svg width="24" height="10">
            <line x1="0" y1="5" x2="24" y2="5" stroke="#9CA3AF" strokeWidth="2" strokeDasharray="5 3" />
          </svg>
          <span>Target</span>
        </div>

        {chartData.map(team => (
          <button
            key={team.team_id}
            onClick={() =>
              onActiveTeamChange(
                activeTeamId === team.team_id ? null : team.team_id
              )
            }
            className={`px-4 py-2 rounded-lg border text-sm transition-all ${
              activeTeamId === team.team_id
                ? 'text-white'
                : 'bg-white border-gray-300'
            }`}
            style={
              activeTeamId === team.team_id
                ? { backgroundColor: team.color }
                : {}
            }
          >
            {team.name}
          </button>
        ))}
      </div>
    </div>
  );
};