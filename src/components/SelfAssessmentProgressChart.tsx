import * as React from 'react';
import type { FinancialYear } from '../utils/financialYear';
import { getFinancialYearMonths } from '../utils/financialYear';

interface StaffProgressData {
  staff_id: number;
  name: string;
  fullYearTarget: number;
  submitted: number;
  leftToDo: number;
}

interface MonthlyPoint {
  month: number;
  percent: number;
}

interface StaffChartLine {
  staff_id: number;
  name: string;
  color: string;
  points: MonthlyPoint[];
}

interface SelfAssessmentProgressChartProps {
  staffProgress: StaffProgressData[];
  financialYear: FinancialYear;
  monthlyData: Record<
    number,
    Record<number, { submitted: number; target: number }>
  >;
  activeStaffId: number | null;
  onActiveStaffChange: (id: number | null) => void;
}

/* ---------------- Layout constants ---------------- */
const VIEWBOX_WIDTH = 800;
const VIEWBOX_HEIGHT = 460;
const PADDING_LEFT = 50;
const PADDING_RIGHT = 140;
const PADDING_TOP = 30;
const PADDING_BOTTOM = 55;

const CHART_WIDTH = VIEWBOX_WIDTH - PADDING_LEFT - PADDING_RIGHT;
const CHART_HEIGHT = VIEWBOX_HEIGHT - PADDING_TOP - PADDING_BOTTOM;
const MAX_PERCENT = 100;

export const SelfAssessmentProgressChart: React.FC<
  SelfAssessmentProgressChartProps
> = ({
  staffProgress,
  financialYear,
  monthlyData,
  activeStaffId,
  onActiveStaffChange,
}) => {
  const months = getFinancialYearMonths().filter(
    (m) => m.number >= 4 || m.number <= 1
  );

  const visibleStaff = staffProgress.filter(
    (s) => s.fullYearTarget > 0
  );

  if (visibleStaff.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        No staff members with targets to display.
      </div>
    );
  }

  const colours: string[] = [
    '#001B47',
    '#0060B8',
    '#007EE0',
    '#FF8A2A',
    '#FFB000',
    '#008A00',
    '#9C27B0',
  ];

  const chartData: StaffChartLine[] = React.useMemo(() => {
    return visibleStaff.map((staff, idx) => {
      let cumulative = 0;

      const points: MonthlyPoint[] = months.map((m) => {
        cumulative +=
          monthlyData[staff.staff_id]?.[m.number]?.submitted ?? 0;

        const percent =
          staff.fullYearTarget > 0
            ? Math.min((cumulative / staff.fullYearTarget) * 100, 100)
            : 0;

        return { month: m.number, percent };
      });

      return {
        staff_id: staff.staff_id,
        name: staff.name,
        color: colours[idx % colours.length],
        points,
      };
    });
  }, [visibleStaff, months, monthlyData]);

  const getX = (index: number): number =>
    PADDING_LEFT +
    (CHART_WIDTH / (months.length - 1)) * index;

  const getY = (percent: number): number =>
    VIEWBOX_HEIGHT -
    PADDING_BOTTOM -
    (percent / MAX_PERCENT) * CHART_HEIGHT;

  const strokeWidth = (id: number): number =>
    activeStaffId === null ? 3 : id === activeStaffId ? 4.5 : 2;

  const strokeOpacity = (id: number): number =>
    activeStaffId === null ? 0.85 : id === activeStaffId ? 1 : 0.5;

  const strokeColor = (id: number, c: string): string =>
    activeStaffId === null ? c : id === activeStaffId ? c : '#9CA3AF';

  const toggleStaff = (id: number): void =>
    onActiveStaffChange(activeStaffId === id ? null : id);

  return (
    <div className="flex flex-col h-full">
      <svg
        viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
        className="w-full flex-1"
        preserveAspectRatio="xMidYMid meet"
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

        {/* Y grid */}
        {[0, 25, 50, 75, 100].map((p: number) => {
          const y = getY(p);
          return (
            <g key={p}>
              <text
                x={PADDING_LEFT - 10}
                y={y + 4}
                textAnchor="end"
                className="text-xs fill-gray-500"
              >
                {p}%
              </text>
              {p > 0 && (
                <line
                  x1={PADDING_LEFT}
                  y1={y}
                  x2={VIEWBOX_WIDTH - PADDING_RIGHT}
                  y2={y}
                  stroke="#E5E7EB"
                  strokeDasharray="4 4"
                />
              )}
            </g>
          );
        })}

        {/* Lines & points */}
        {chartData.map((staff) => (
          <g key={staff.staff_id}>
            <path
              d={staff.points
                .map(
                  (p: MonthlyPoint, i: number) =>
                    `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY(
                      p.percent
                    )}`
                )
                .join(' ')}
              fill="none"
              stroke={strokeColor(staff.staff_id, staff.color)}
              strokeWidth={strokeWidth(staff.staff_id)}
              opacity={strokeOpacity(staff.staff_id)}
            />

            {staff.points.map((p: MonthlyPoint, i: number) => {
              const x = getX(i);
              const y = getY(p.percent);

              return (
                <g key={i}>
                  <circle
                    cx={x}
                    cy={y}
                    r={4}
                    fill={strokeColor(staff.staff_id, staff.color)}
                    opacity={strokeOpacity(staff.staff_id)}
                  />

                  {activeStaffId === staff.staff_id && (
                    <text
                      x={x}
                      y={y - 10}
                      textAnchor="middle"
                      className="text-xs font-medium"
                      fill={staff.color}
                    >
                      {Math.round(p.percent)}%
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        ))}
      </svg>

      {/* Legend */}
      <div className="mt-3 flex flex-wrap justify-center gap-3">
        {chartData.map((staff) => {
          const active = staff.staff_id === activeStaffId;
          return (
            <button
              key={staff.staff_id}
              onClick={() => toggleStaff(staff.staff_id)}
              className={`px-4 py-2 rounded-lg border text-sm font-medium transition-all
                ${
                  active
                    ? 'text-white shadow-md'
                    : 'bg-white border-gray-300 hover:bg-gray-50'
                }
              `}
              style={
                active
                  ? {
                      backgroundColor: staff.color,
                      borderColor: staff.color,
                    }
                  : {}
              }
            >
              {staff.name}
            </button>
          );
        })}
      </div>
    </div>
  );
};
