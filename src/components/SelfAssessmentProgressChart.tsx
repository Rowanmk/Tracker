import * as React from 'react';
import type { FinancialYear } from '../utils/financialYear';
import { useChartTheme } from '../context/ChartThemeContext';

interface TeamProgressData {
  team_id: number;
  name: string;
  fullYearTarget: number;
  submitted: number;
  leftToDo: number;
}

interface SelfAssessmentProgressChartProps {
  teamProgress: TeamProgressData[];
  financialYear: FinancialYear;
  monthlyData: Record<number, Record<number, { submitted: number; target: number }>>;
  dailyActuals: Record<number, Record<string, number>>;
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

const SA_MONTHS = [4, 5, 6, 7, 8, 9, 10, 11, 12, 1];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function getCalendarYear(monthNumber: number, financialYear: FinancialYear): number {
  return monthNumber >= 4 ? financialYear.end : financialYear.end + 1;
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function isWeekend(year: number, month: number, day: number): boolean {
  const dow = new Date(year, month - 1, day).getDay();
  return dow === 0 || dow === 6;
}

interface DayPoint {
  dateStr: string;
  monthNumber: number;
  year: number;
  day: number;
  isWorkingDay: boolean;
  isMonthStart: boolean;
  monthIndex: number;
  monthDayFraction: number;
}

function buildDayPoints(financialYear: FinancialYear): DayPoint[] {
  const points: DayPoint[] = [];
  SA_MONTHS.forEach((monthNumber, monthIndex) => {
    const year = getCalendarYear(monthNumber, financialYear);
    const daysInMonth = getDaysInMonth(year, monthNumber);
    for (let day = 1; day <= daysInMonth; day++) {
      const mm = String(monthNumber).padStart(2, '0');
      const dd = String(day).padStart(2, '0');
      points.push({
        dateStr: `${year}-${mm}-${dd}`,
        monthNumber,
        year,
        day,
        isWorkingDay: !isWeekend(year, monthNumber, day),
        isMonthStart: day === 1,
        monthIndex,
        monthDayFraction: day / daysInMonth,
      });
    }
  });
  return points;
}

interface TooltipState {
  visible: boolean;
  x: number;
  y: number;
  teamId: number;
  teamName: string;
  color: string;
  completed: number;
  remaining: number;
  target: number;
}

export const SelfAssessmentProgressChart: React.FC<SelfAssessmentProgressChartProps> = ({
  teamProgress,
  financialYear,
  monthlyData,
  dailyActuals,
  activeTeamId,
  onActiveTeamChange,
}) => {
  const { theme } = useChartTheme();
  const containerRef = React.useRef<HTMLDivElement>(null);
  const svgRef = React.useRef<SVGSVGElement>(null);

  const [tooltip, setTooltip] = React.useState<TooltipState>({
    visible: false,
    x: 0,
    y: 0,
    teamId: 0,
    teamName: '',
    color: '',
    completed: 0,
    remaining: 0,
    target: 0,
  });

  const today = React.useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const todayStr = React.useMemo(() => {
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }, [today]);

  const dayPoints = React.useMemo(() => buildDayPoints(financialYear), [financialYear]);
  const totalDays = dayPoints.length;
  const visibleTeams = teamProgress.filter(t => t.fullYearTarget > 0);

  const colours = React.useMemo(() => {
    return Array.from({ length: Math.max(visibleTeams.length, 1) }, (_, index) => theme.palette[index % theme.palette.length]);
  }, [theme.palette, visibleTeams.length]);

  const chartData = React.useMemo(() => {
    return visibleTeams.map((team, idx) => {
      const denominator = team.fullYearTarget > 0 ? team.fullYearTarget : 1;
      const teamDaily = dailyActuals[team.team_id] || {};

      let cum = 0;
      const percents = dayPoints.map((dp) => {
        const isVisible = dp.dateStr <= todayStr;
        cum += teamDaily[dp.dateStr] || 0;
        return {
          dateStr: dp.dateStr,
          percent: isVisible ? Math.min((cum / denominator) * 100, 100) : 0,
          cumulativeCount: cum,
          isVisible,
        };
      });

      return {
        team_id: team.team_id,
        name: team.name,
        color: colours[idx % colours.length],
        percents,
        finalPercent: (team.submitted / denominator) * 100,
        totalSubmitted: team.submitted,
        fullYearTarget: team.fullYearTarget,
      };
    });
  }, [visibleTeams, dailyActuals, dayPoints, todayStr, colours]);

  const targetLinePercents = React.useMemo(() => {
    const teamCount = visibleTeams.length;
    if (teamCount === 0) return dayPoints.map(() => 0);

    const totalDenominator = visibleTeams.reduce((s, t) => s + t.fullYearTarget, 0);
    if (totalDenominator <= 0) return dayPoints.map(() => 0);

    const wdPerMonth = SA_MONTHS.map((_, mi) =>
      dayPoints.filter(dp => dp.monthIndex === mi && dp.isWorkingDay).length
    );

    const plannedPerMonth = SA_MONTHS.map((m) =>
      visibleTeams.reduce((s, t) => s + (monthlyData[t.team_id]?.[m]?.target ?? 0), 0)
    );

    let cumPlanned = 0;

    return dayPoints.map((dp) => {
      if (dp.isWorkingDay) {
        const wd = wdPerMonth[dp.monthIndex] || 1;
        cumPlanned += plannedPerMonth[dp.monthIndex] / wd;
      }
      return Math.min((cumPlanned / totalDenominator) * 100, 100);
    });
  }, [visibleTeams, monthlyData, dayPoints]);

  const getX = (dayIndex: number) =>
    PADDING_LEFT + (CHART_WIDTH / Math.max(totalDays - 1, 1)) * dayIndex;

  const getY = (p: number) =>
    VIEWBOX_HEIGHT - PADDING_BOTTOM - (p / 100) * CHART_HEIGHT;

  const targetPolylinePoints = targetLinePercents
    .map((p, i) => `${getX(i)},${getY(p)}`)
    .join(' ');

  const monthBoundaries = React.useMemo(() => {
    const boundaries: Array<{ x: number; label: string; monthNumber: number }> = [];
    SA_MONTHS.forEach((monthNumber, monthIndex) => {
      const firstDayIdx = dayPoints.findIndex(dp => dp.monthIndex === monthIndex);
      if (firstDayIdx >= 0) {
        const year = getCalendarYear(monthNumber, financialYear);
        const label = monthNumber === 1
          ? `${MONTH_NAMES[0]} ${year}`
          : monthNumber === 4
          ? `${MONTH_NAMES[3]} ${year}`
          : MONTH_NAMES[monthNumber - 1];
        boundaries.push({ x: getX(firstDayIdx), label, monthNumber });
      }
    });
    return boundaries;
  }, [dayPoints, financialYear]);

  const todayDayIndex = dayPoints.findIndex(dp => dp.dateStr === todayStr);
  const todayX = todayDayIndex >= 0 ? getX(todayDayIndex) : null;

  const todayTargetPercent = React.useMemo(() => {
    if (todayDayIndex < 0) return null;
    const pct = targetLinePercents[todayDayIndex];
    if (pct === undefined) return null;
    return Math.round(pct * 10) / 10;
  }, [todayDayIndex, targetLinePercents]);

  const handleLineMouseEnter = (
    e: React.MouseEvent<SVGPathElement>,
    team: typeof chartData[number]
  ) => {
    if (!svgRef.current || !containerRef.current) return;

    const containerRect = containerRef.current.getBoundingClientRect();
    const completed = Math.round(team.totalSubmitted);
    const remaining = Math.max(0, team.fullYearTarget - completed);

    const pixelX = e.clientX - containerRect.left;
    const pixelY = e.clientY - containerRect.top;

    setTooltip({
      visible: true,
      x: pixelX,
      y: pixelY,
      teamId: team.team_id,
      teamName: team.name,
      color: team.color,
      completed,
      remaining,
      target: team.fullYearTarget,
    });
  };

  const handleLineMouseMove = (
    e: React.MouseEvent<SVGPathElement>
  ) => {
    if (!containerRef.current) return;
    const containerRect = containerRef.current.getBoundingClientRect();
    setTooltip((prev) => prev.visible ? {
      ...prev,
      x: e.clientX - containerRect.left,
      y: e.clientY - containerRect.top,
    } : prev);
  };

  const handleLineMouseLeave = () => {
    setTooltip((prev) => ({ ...prev, visible: false }));
  };

  const gridDashArray =
    theme.gridStyle === 'dashed' ? '4 4' : theme.gridStyle === 'solid' ? undefined : undefined;

  return (
    <div ref={containerRef} className="flex flex-col h-full relative" style={{ fontFamily: theme.fontFamily }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
        className="w-full flex-1"
      >
        <line
          x1={PADDING_LEFT}
          y1={PADDING_TOP}
          x2={PADDING_LEFT}
          y2={VIEWBOX_HEIGHT - PADDING_BOTTOM}
          stroke={theme.axisLabelColor}
        />
        <line
          x1={PADDING_LEFT}
          y1={VIEWBOX_HEIGHT - PADDING_BOTTOM}
          x2={VIEWBOX_WIDTH - PADDING_RIGHT}
          y2={VIEWBOX_HEIGHT - PADDING_BOTTOM}
          stroke={theme.axisLabelColor}
        />

        {[0, 25, 50, 75, 100].map(p => (
          <g key={p}>
            <text
              x={PADDING_LEFT - 10}
              y={getY(p) + 4}
              textAnchor="end"
              className={`${theme.axisLabelSize} ${theme.axisLabelWeight}`}
              fill={theme.axisLabelColor}
            >
              {p}%
            </text>
            {p > 0 && theme.gridStyle !== 'none' && (
              <line
                x1={PADDING_LEFT}
                y1={getY(p)}
                x2={VIEWBOX_WIDTH - PADDING_RIGHT}
                y2={getY(p)}
                stroke={theme.gridColor}
                strokeDasharray={gridDashArray}
              />
            )}
          </g>
        ))}

        {monthBoundaries.map(({ x, label, monthNumber }) => (
          <g key={monthNumber}>
            <line
              x1={x}
              y1={PADDING_TOP}
              x2={x}
              y2={VIEWBOX_HEIGHT - PADDING_BOTTOM}
              stroke={theme.gridColor}
              strokeWidth="1"
            />
            <text
              x={x + 4}
              y={VIEWBOX_HEIGHT - PADDING_BOTTOM + 22}
              textAnchor="start"
              className={`${theme.axisLabelSize} ${theme.axisLabelWeight}`}
              fill={theme.axisLabelColor}
              fontSize="11"
            >
              {label}
            </text>
          </g>
        ))}

        {todayX !== null && (
          <g>
            <line
              x1={todayX}
              y1={PADDING_TOP}
              x2={todayX}
              y2={VIEWBOX_HEIGHT - PADDING_BOTTOM}
              stroke={theme.palette[3] || theme.palette[0]}
              strokeWidth="1.5"
              strokeDasharray="4 3"
              opacity="0.8"
            />
            <text
              x={todayX + 3}
              y={PADDING_TOP + 12}
              fill={theme.palette[3] || theme.palette[0]}
              fontSize="10"
              fontWeight="bold"
            >
              {todayTargetPercent !== null
                ? `Today (${todayTargetPercent}%)`
                : 'Today'}
            </text>
          </g>
        )}

        <polyline
          points={targetPolylinePoints}
          fill="none"
          stroke={theme.palette[1] || theme.axisLabelColor}
          strokeWidth="2.5"
          strokeDasharray="6 4"
          strokeLinecap="round"
          opacity="0.85"
        />

        <text
          x={getX(totalDays - 1) + 8}
          y={getY(targetLinePercents[targetLinePercents.length - 1] ?? 100) + 4}
          className={`${theme.axisLabelSize} ${theme.axisLabelWeight}`}
          fill={theme.axisLabelColor}
          fontSize="11"
        >
          Target
        </text>

        {chartData.map(team => {
          const visiblePoints = team.percents
            .map((p, i) => ({ ...p, i }))
            .filter(p => p.isVisible);

          if (visiblePoints.length === 0) return null;

          const pathD = visiblePoints
            .map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${getX(p.i)} ${getY(p.percent)}`)
            .join(' ');

          const isDimmed = activeTeamId !== null && activeTeamId !== team.team_id;
          const isActive = activeTeamId === team.team_id;

          return (
            <g key={team.team_id}>
              <path
                d={pathD}
                fill="none"
                stroke="transparent"
                strokeWidth={14}
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ cursor: 'pointer', pointerEvents: 'stroke' }}
                onMouseEnter={(e) => handleLineMouseEnter(e, team)}
                onMouseMove={handleLineMouseMove}
                onMouseLeave={handleLineMouseLeave}
              />
              <path
                d={pathD}
                fill="none"
                stroke={isDimmed ? theme.gridColor : team.color}
                strokeWidth={isActive ? 4.5 : 3}
                opacity={isDimmed ? 0.5 : 1}
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ pointerEvents: 'none' }}
              />
            </g>
          );
        })}

        {activeTeamId &&
          chartData
            .filter(team => team.team_id === activeTeamId)
            .map(team => {
              const lastVisible = [...team.percents]
                .map((p, i) => ({ ...p, i }))
                .filter(p => p.isVisible)
                .pop();

              if (!lastVisible) return null;

              const displayPct = Math.round(team.finalPercent * 10) / 10;

              return (
                <text
                  key={`label-${team.team_id}`}
                  x={getX(lastVisible.i)}
                  y={getY(lastVisible.percent) - 10}
                  textAnchor="middle"
                  fill={theme.axisLabelColor}
                  fontSize="11"
                  fontWeight="600"
                >
                  {displayPct}%
                </text>
              );
            })}

        {!activeTeamId &&
          chartData.map(team => {
            const lastVisible = [...team.percents]
              .map((p, i) => ({ ...p, i }))
              .filter(p => p.isVisible)
              .pop();

            if (!lastVisible) return null;

            return (
              <g key={`end-label-${team.team_id}`}>
                <text
                  x={getX(lastVisible.i) + 8}
                  y={getY(lastVisible.percent) + 4}
                  fill={theme.axisLabelColor}
                  fontSize="11"
                  fontWeight="600"
                >
                  {team.name}
                </text>
              </g>
            );
          })}
      </svg>

      {tooltip.visible && (
        <div
          className="absolute z-50 pointer-events-none"
          style={{
            left: Math.min(
              Math.max(tooltip.x, 130),
              containerRef.current ? containerRef.current.offsetWidth - 130 : tooltip.x
            ),
            top: tooltip.y - 12,
            transform: 'translate(-50%, -100%)',
          }}
        >
          <div
            className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-2xl overflow-hidden"
            style={{ minWidth: '220px', maxWidth: '280px', fontFamily: theme.fontFamily }}
          >
            <div
              className="px-3 py-2 flex items-center gap-2"
              style={{ backgroundColor: tooltip.color }}
            >
              <span className="w-2 h-2 rounded-full bg-white/80 inline-block" />
              <span className="text-white text-xs font-bold uppercase tracking-wide truncate">
                {tooltip.teamName}
              </span>
            </div>

            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              <div className="px-3 py-2 flex items-center justify-between gap-3">
                <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">
                  Completed
                </span>
                <span className="text-sm font-bold" style={{ color: theme.palette[0] }}>
                  {tooltip.completed.toLocaleString()}
                </span>
              </div>
              <div className="px-3 py-2 flex items-center justify-between gap-3">
                <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">
                  Remaining
                </span>
                <span className="text-sm font-bold" style={{ color: theme.palette[3] || theme.palette[1] }}>
                  {tooltip.remaining.toLocaleString()}
                </span>
              </div>
            </div>

            <div className="bg-gray-50 dark:bg-gray-800/60 px-3 py-1.5 border-t border-gray-100 dark:border-gray-700">
              <span className="text-[10px] text-gray-400">
                Target: {tooltip.target.toLocaleString()} self assessments
              </span>
            </div>
          </div>

          <div className="flex justify-center">
            <div className="w-3 h-3 bg-white dark:bg-gray-900 border-r border-b border-gray-200 dark:border-gray-700 rotate-45 -mt-1.5" />
          </div>
        </div>
      )}

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