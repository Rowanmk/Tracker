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

export const SelfAssessmentProgressChart: React.FC<SelfAssessmentProgressChartProps> = ({
  teamProgress,
  financialYear,
  monthlyData,
  activeTeamId,
  onActiveTeamChange,
}) => {
  const months = getFinancialYearMonths().filter(
    m => m.number >= 4 || m.number <= 1
  );

  const visibleTeams = teamProgress.filter(t => t.fullYearTarget > 0);

  const colours = [
    '#001B47',
    '#0060B8',
    '#007EE0',
    '#FF8A2A',
    '#FFB000',
    '#008A00',
  ];

  const chartData = React.useMemo(() => {
    return visibleTeams.map((team, idx) => {
      let cumulative = 0;

      const points: MonthlyPoint[] = months.map(m => {
        cumulative += monthlyData[team.team_id]?.[m.number]?.submitted ?? 0;

        return {
          month: m.number,
          percent: Math.min(
            (cumulative / team.fullYearTarget) * 100,
            100
          ),
        };
      });

      return {
        team_id: team.team_id,
        name: team.name,
        color: colours[idx % colours.length],
        points,
      };
    });
  }, [visibleTeams, months, monthlyData]);

  const getX = (i: number) =>
    PADDING_LEFT + (CHART_WIDTH / (months.length - 1)) * i;

  const getY = (p: number) =>
    VIEWBOX_HEIGHT - PADDING_BOTTOM - (p / 100) * CHART_HEIGHT;

  return (
    <div className="flex flex-col h-full">
      <svg
        viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
        className="w-full flex-1"
      >
        <rect
          x={getX(0)}
          y={PADDING_TOP}
          width={getX(3) - getX(0)}
          height={CHART_HEIGHT}
          fill="#E0E7FF"
          opacity="0.4"
        />
        <rect
          x={getX(6)}
          y={PADDING_TOP}
          width={getX(months.length - 1) - getX(6)}
          height={CHART_HEIGHT}
          fill="#E0E7FF"
          opacity="0.4"
        />

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

        {months.map((m, i) => (
          <text
            key={m.number}
            x={getX(i)}
            y={VIEWBOX_HEIGHT - PADDING_BOTTOM + 22}
            textAnchor="middle"
            className="text-xs fill-gray-600"
          >
            {m.number === 1
              ? `${m.name} ${financialYear.end}`
              : m.number === 4
              ? `${m.name} ${financialYear.start}`
              : m.name}
          </text>
        ))}

        {chartData.map(team => (
          <path
            key={team.team_id}
            d={team.points
              .map((p, i) => `${i ? 'L' : 'M'} ${getX(i)} ${getY(p.percent)}`)
              .join(' ')}
            fill="none"
            stroke={
              activeTeamId && activeTeamId !== team.team_id
                ? '#9CA3AF'
                : team.color
            }
            strokeWidth={activeTeamId === team.team_id ? 4.5 : 3}
            opacity={activeTeamId && activeTeamId !== team.team_id ? 0.6 : 1}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}

        {activeTeamId &&
          chartData
            .filter(team => team.team_id === activeTeamId)
            .map(team =>
              team.points.map((p, i) => (
                <text
                  key={`label-${team.team_id}-${i}`}
                  x={getX(i)}
                  y={getY(p.percent) - 10}
                  textAnchor="middle"
                  className="text-xs font-semibold fill-gray-800"
                >
                  {Math.round(p.percent)}%
                </text>
              ))
            )}

        {!activeTeamId &&
          chartData.map(team => {
            const lastPoint = team.points[team.points.length - 1];
            const lastX = getX(team.points.length - 1);
            const lastY = getY(lastPoint.percent);

            return (
              <g key={`end-label-${team.team_id}`}>
                <text
                  x={lastX + 8}
                  y={lastY + 4}
                  className="text-xs font-semibold fill-gray-800"
                >
                  {team.name}
                </text>
              </g>
            );
          })}
      </svg>

      <div className="mt-3 flex justify-center gap-3 flex-wrap">
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