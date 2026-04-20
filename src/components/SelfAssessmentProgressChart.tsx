import * as React from 'react';
import type { FinancialYear } from '../utils/financialYear';

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
  dateStr: string; // YYYY-MM-DD
  monthNumber: number;
  year: number;
  day: number;
  isWorkingDay: boolean;
  isMonthStart: boolean;
  monthIndex: number; // index in SA_MONTHS
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
      });
    }
  });
  return points;
}

export const SelfAssessmentProgressChart: React.FC<SelfAssessmentProgressChartProps> = ({
  teamProgress,
  financialYear,
  monthlyData,
  activeTeamId,
  onActiveTeamChange,
}) => {
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

  const colours = [
    '#001B47',
    '#0060B8',
    '#007EE0',
    '#FF8A2A',
    '#FFB000',
    '#008A00',
  ];

  // Build cumulative working days count per day index
  const cumulativeWorkingDays = React.useMemo(() => {
    let count = 0;
    return dayPoints.map(dp => {
      if (dp.isWorkingDay) count++;
      return count;
    });
  }, [dayPoints]);

  const totalWorkingDays = cumulativeWorkingDays[cumulativeWorkingDays.length - 1] ?? 0;

  // Build target line: advances only on working days, proportional to monthly targets
  // The end-of-month target % is determined by cumulative monthly targets
  const targetLinePercents = React.useMemo(() => {
    // Sum monthly targets across all visible teams for each SA month
    const monthlyTargetTotals = SA_MONTHS.map(m => {
      return visibleTeams.reduce((sum, team) => {
        return sum + (monthlyData[team.team_id]?.[m]?.target ?? 0);
      }, 0);
    });

    const trueTotalTarget = monthlyTargetTotals.reduce((a, b) => a + b, 0);

    if (trueTotalTarget <= 0 || totalWorkingDays === 0) {
      // Fallback: linear across working days
      return dayPoints.map((_, i) => {
        const wd = cumulativeWorkingDays[i];
        return (wd / Math.max(totalWorkingDays, 1)) * 100;
      });
    }

    // For each day, compute what % of the total target should be reached
    // by distributing each month's target evenly across its working days
    const workingDaysPerMonth = SA_MONTHS.map((monthNumber, monthIndex) => {
      return dayPoints.filter(dp => dp.monthIndex === monthIndex && dp.isWorkingDay).length;
    });

    // Build cumulative target per working day
    // For each working day in month i, it contributes monthlyTargetTotals[i] / workingDaysPerMonth[i]
    const targetPerWorkingDay: number[] = [];
    SA_MONTHS.forEach((_, monthIndex) => {
      const monthWD = workingDaysPerMonth[monthIndex];
      const monthTarget = monthlyTargetTotals[monthIndex];
      const perWD = monthWD > 0 ? monthTarget / monthWD : 0;
      dayPoints
        .filter(dp => dp.monthIndex === monthIndex)
        .forEach(dp => {
          targetPerWorkingDay.push(dp.isWorkingDay ? perWD : 0);
        });
    });

    // Build cumulative target percents per day
    let cumTarget = 0;
    return dayPoints.map((_, i) => {
      cumTarget += targetPerWorkingDay[i] ?? 0;
      return (cumTarget / trueTotalTarget) * 100;
    });
  }, [visibleTeams, monthlyData, dayPoints, cumulativeWorkingDays, totalWorkingDays]);

  // For each team, build cumulative submitted % per day (only up to today)
  const chartData = React.useMemo(() => {
    return visibleTeams.map((team, idx) => {
      // Build submitted per month
      const submittedPerMonth: Record<number, number> = {};
      SA_MONTHS.forEach(m => {
        submittedPerMonth[m] = monthlyData[team.team_id]?.[m]?.submitted ?? 0;
      });

      // Total target for denominator
      const teamTotalTarget = SA_MONTHS.reduce((sum, m) => sum + (monthlyData[team.team_id]?.[m]?.target ?? 0), 0);
      const denominator = teamTotalTarget > 0 ? teamTotalTarget : team.fullYearTarget;

      // Distribute each month's submitted evenly across its working days
      const submittedPerWorkingDay: number[] = dayPoints.map(dp => {
        const monthWDs = dayPoints.filter(d => d.monthIndex === dp.monthIndex && d.isWorkingDay).length;
        if (!dp.isWorkingDay || monthWDs === 0) return 0;
        return (submittedPerMonth[dp.monthNumber] ?? 0) / monthWDs;
      });

      // Build cumulative percent per day, only for days up to today
      let cumSubmitted = 0;
      const percents: Array<{ dateStr: string; percent: number; isVisible: boolean }> = dayPoints.map((dp, i) => {
        const isVisible = dp.dateStr <= todayStr;
        if (isVisible) {
          cumSubmitted += submittedPerWorkingDay[i] ?? 0;
        }
        return {
          dateStr: dp.dateStr,
          percent: isVisible && denominator > 0 ? Math.min((cumSubmitted / denominator) * 100, 100) : 0,
          isVisible,
        };
      });

      return {
        team_id: team.team_id,
        name: team.name,
        color: colours[idx % colours.length],
        percents,
      };
    });
  }, [visibleTeams, monthlyData, dayPoints, todayStr]);

  const getX = (dayIndex: number) =>
    PADDING_LEFT + (CHART_WIDTH / Math.max(totalDays - 1, 1)) * dayIndex;

  const getY = (p: number) =>
    VIEWBOX_HEIGHT - PADDING_BOTTOM - (p / 100) * CHART_HEIGHT;

  // Target polyline — all days
  const targetPolylinePoints = targetLinePercents
    .map((p, i) => `${getX(i)},${getY(p)}`)
    .join(' ');

  // Month boundary x positions and labels
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

  // Today marker
  const todayDayIndex = dayPoints.findIndex(dp => dp.dateStr === todayStr);
  const todayX = todayDayIndex >= 0 ? getX(todayDayIndex) : null;

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

        {/* Month boundary vertical lines and labels */}
        {monthBoundaries.map(({ x, label, monthNumber }) => (
          <g key={monthNumber}>
            <line
              x1={x}
              y1={PADDING_TOP}
              x2={x}
              y2={VIEWBOX_HEIGHT - PADDING_BOTTOM}
              stroke="#E5E7EB"
              strokeWidth="1"
            />
            <text
              x={x + 4}
              y={VIEWBOX_HEIGHT - PADDING_BOTTOM + 22}
              textAnchor="start"
              className="text-xs fill-gray-600"
              fontSize="11"
            >
              {label}
            </text>
          </g>
        ))}

        {/* Today marker */}
        {todayX !== null && (
          <g>
            <line
              x1={todayX}
              y1={PADDING_TOP}
              x2={todayX}
              y2={VIEWBOX_HEIGHT - PADDING_BOTTOM}
              stroke="#FF8A2A"
              strokeWidth="1.5"
              strokeDasharray="4 3"
              opacity="0.8"
            />
            <text
              x={todayX + 3}
              y={PADDING_TOP + 12}
              className="fill-orange-500"
              fontSize="10"
              fontWeight="bold"
            >
              Today
            </text>
          </g>
        )}

        {/* Target line — dotted grey, advances only on working days */}
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
          x={getX(totalDays - 1) + 8}
          y={getY(targetLinePercents[targetLinePercents.length - 1] ?? 100) + 4}
          className="text-xs fill-gray-400"
          fontSize="11"
        >
          Target
        </text>

        {/* Actual lines — only plot points up to today */}
        {chartData.map(team => {
          const visiblePoints = team.percents
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

        {/* Value labels for active team at today's position */}
        {activeTeamId &&
          chartData
            .filter(team => team.team_id === activeTeamId)
            .map(team => {
              const lastVisible = [...team.percents]
                .map((p, i) => ({ ...p, i }))
                .filter(p => p.isVisible)
                .pop();

              if (!lastVisible) return null;

              return (
                <text
                  key={`label-${team.team_id}`}
                  x={getX(lastVisible.i)}
                  y={getY(lastVisible.percent) - 10}
                  textAnchor="middle"
                  className="text-xs font-semibold fill-gray-800"
                  fontSize="11"
                >
                  {Math.round(lastVisible.percent)}%
                </text>
              );
            })}

        {/* End-of-line name labels when no team is active */}
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
                  className="text-xs font-semibold fill-gray-800"
                  fontSize="11"
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
          <span>Target (working days only)</span>
        </div>

        {/* Today marker legend */}
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-orange-200 bg-orange-50 text-sm text-orange-600">
          <svg width="12" height="10">
            <line x1="6" y1="0" x2="6" y2="10" stroke="#FF8A2A" strokeWidth="1.5" strokeDasharray="3 2" />
          </svg>
          <span>Today</span>
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