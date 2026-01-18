import React, { useMemo } from 'react';
import type { FinancialYear } from '../utils/financialYear';
import { getFinancialYearMonths } from '../utils/financialYear';

interface StaffProgressData {
  staff_id: number;
  name: string;
  fullYearTarget: number;
  submitted: number;
  leftToDo: number;
}

interface SelfAssessmentProgressChartProps {
  staffProgress: StaffProgressData[];
  financialYear: FinancialYear;
  monthlyData: Record<number, Record<number, { submitted: number; target: number }>>;
}

const VIEWBOX_WIDTH = 1200;
const VIEWBOX_HEIGHT = 500;
const PADDING_LEFT = 60;
const PADDING_RIGHT = 200;
const PADDING_TOP = 30;
const PADDING_BOTTOM = 100;

const CHART_WIDTH = VIEWBOX_WIDTH - PADDING_LEFT - PADDING_RIGHT;
const CHART_HEIGHT = VIEWBOX_HEIGHT - PADDING_TOP - PADDING_BOTTOM;

export const SelfAssessmentProgressChart: React.FC<SelfAssessmentProgressChartProps> = ({
  staffProgress,
  financialYear,
  monthlyData,
}) => {
  const allMonthData = getFinancialYearMonths();

  // Filter to only months April through January (10 months)
  const displayMonths = allMonthData.filter((m) => {
    // April (4) through January (1)
    return m.number >= 4 || m.number <= 1;
  });

  // Filter to only staff with targets
  const visibleStaff = staffProgress.filter(
    (staff) => staff.fullYearTarget > 0
  );

  if (visibleStaff.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 mt-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Monthly Progress Chart
        </h3>
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
          No staff members with targets to display.
        </div>
      </div>
    );
  }

  // Generate color palette for staff members
  const colors = [
    '#001B47', // Dark blue
    '#0060B8', // Medium blue
    '#007EE0', // Light blue
    '#FF8A2A', // Orange
    '#FFB000', // Gold
    '#008A00', // Green
    '#FF3B30', // Red
    '#9C27B0', // Purple
    '#00BCD4', // Cyan
    '#FF5722', // Deep orange
  ];

  const getColor = (index: number) => colors[index % colors.length];

  // Build cumulative data for each staff member
  const staffChartData = useMemo(() => {
    return visibleStaff.map((staff, staffIndex) => {
      const points: Array<{ month: number; percent: number }> = [];

      let cumulativeSubmitted = 0;

      displayMonths.forEach((m) => {
        const staffMonthData = monthlyData[staff.staff_id]?.[m.number];
        if (staffMonthData) {
          cumulativeSubmitted += staffMonthData.submitted;
        }

        const percentAchieved =
          staff.fullYearTarget > 0
            ? (cumulativeSubmitted / staff.fullYearTarget) * 100
            : 0;

        points.push({
          month: m.number,
          percent: Math.min(percentAchieved, 100),
        });
      });

      return {
        staff_id: staff.staff_id,
        name: staff.name,
        color: getColor(staffIndex),
        points,
      };
    });
  }, [visibleStaff, monthlyData, displayMonths]);

  // Calculate Y-axis max (cap at 100%)
  const maxPercent = 100;

  // Generate smooth curve path using quadratic Bezier curves
  const generatePath = (points: Array<{ month: number; percent: number }>) => {
    if (points.length === 0) return '';

    const xStep = CHART_WIDTH / (displayMonths.length - 1 || 1);
    const yScale = CHART_HEIGHT / maxPercent;

    const pathPoints = points.map((p, idx) => {
      const x = PADDING_LEFT + idx * xStep;
      const y = VIEWBOX_HEIGHT - PADDING_BOTTOM - p.percent * yScale;
      return { x, y };
    });

    if (pathPoints.length === 1) {
      return `M ${pathPoints[0].x} ${pathPoints[0].y}`;
    }

    let path = `M ${pathPoints[0].x} ${pathPoints[0].y}`;

    for (let i = 1; i < pathPoints.length; i++) {
      const prev = pathPoints[i - 1];
      const curr = pathPoints[i];
      const next = pathPoints[i + 1];

      // Control point for smooth curve
      const cpx = (prev.x + curr.x) / 2;
      const cpy = (prev.y + curr.y) / 2;

      path += ` Q ${cpx} ${cpy} ${curr.x} ${curr.y}`;
    }

    return path;
  };

  // Calculate x positions for shaded regions
  const getXForMonth = (monthIndex: number) => {
    const xStep = CHART_WIDTH / (displayMonths.length - 1 || 1);
    return PADDING_LEFT + monthIndex * xStep;
  };

  // Shaded regions: April-July (indices 0-3) and October-January (indices 6-9)
  const aprilJulyStart = getXForMonth(0);
  const aprilJulyEnd = getXForMonth(3);
  const octoberJanuaryStart = getXForMonth(6);
  const octoberJanuaryEnd = getXForMonth(displayMonths.length - 1);

  // Get year for January label
  const januaryYear = financialYear.end;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 mt-6">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
        Monthly Progress Chart
      </h3>

      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
          className="w-full h-96 min-w-max"
          preserveAspectRatio="xMidYMid meet"
        >
          {/* Shaded background regions */}
          {/* April-July shading */}
          <rect
            x={aprilJulyStart}
            y={PADDING_TOP}
            width={aprilJulyEnd - aprilJulyStart}
            height={CHART_HEIGHT}
            fill="#E0E7FF"
            opacity="0.4"
            className="dark:fill-blue-900"
          />

          {/* October-January shading */}
          <rect
            x={octoberJanuaryStart}
            y={PADDING_TOP}
            width={octoberJanuaryEnd - octoberJanuaryStart}
            height={CHART_HEIGHT}
            fill="#E0E7FF"
            opacity="0.4"
            className="dark:fill-blue-900"
          />

          {/* Y-axis */}
          <line
            x1={PADDING_LEFT}
            y1={PADDING_TOP}
            x2={PADDING_LEFT}
            y2={VIEWBOX_HEIGHT - PADDING_BOTTOM}
            stroke="#6B7280"
            strokeWidth="2"
          />

          {/* X-axis */}
          <line
            x1={PADDING_LEFT}
            y1={VIEWBOX_HEIGHT - PADDING_BOTTOM}
            x2={VIEWBOX_WIDTH - PADDING_RIGHT}
            y2={VIEWBOX_HEIGHT - PADDING_BOTTOM}
            stroke="#6B7280"
            strokeWidth="2"
          />

          {/* Y-axis gridlines and labels */}
          {[0, 25, 50, 75, 100].map((percent) => {
            const y =
              VIEWBOX_HEIGHT -
              PADDING_BOTTOM -
              (percent / maxPercent) * CHART_HEIGHT;
            return (
              <g key={`y-${percent}`}>
                <line
                  x1={PADDING_LEFT - 5}
                  y1={y}
                  x2={PADDING_LEFT}
                  y2={y}
                  stroke="#6B7280"
                  strokeWidth="1"
                />
                <text
                  x={PADDING_LEFT - 10}
                  y={y + 4}
                  textAnchor="end"
                  className="text-xs fill-gray-600 dark:fill-gray-400"
                >
                  {percent}%
                </text>
                {percent > 0 && percent < 100 && (
                  <line
                    x1={PADDING_LEFT}
                    y1={y}
                    x2={VIEWBOX_WIDTH - PADDING_RIGHT}
                    y2={y}
                    stroke="#E5E7EB"
                    strokeWidth="1"
                    strokeDasharray="4,4"
                    className="dark:stroke-gray-700"
                  />
                )}
              </g>
            );
          })}

          {/* X-axis labels (months with year) */}
          {displayMonths.map((m, idx) => {
            const x = getXForMonth(idx);
            // Add year to January
            const monthLabel = m.number === 1 ? `${m.name} ${januaryYear}` : m.number === 4 ? `${m.name} ${financialYear.start}` : m.name;
            return (
              <g key={`x-${m.number}`}>
                <line
                  x1={x}
                  y1={VIEWBOX_HEIGHT - PADDING_BOTTOM}
                  x2={x}
                  y2={VIEWBOX_HEIGHT - PADDING_BOTTOM + 5}
                  stroke="#6B7280"
                  strokeWidth="1"
                />
                <text
                  x={x}
                  y={VIEWBOX_HEIGHT - PADDING_BOTTOM + 20}
                  textAnchor="middle"
                  className="text-xs fill-gray-600 dark:fill-gray-400"
                >
                  {monthLabel}
                </text>
              </g>
            );
          })}

          {/* 100% reference line */}
          <line
            x1={PADDING_LEFT}
            y1={VIEWBOX_HEIGHT - PADDING_BOTTOM - CHART_HEIGHT}
            x2={VIEWBOX_WIDTH - PADDING_RIGHT}
            y2={VIEWBOX_HEIGHT - PADDING_BOTTOM - CHART_HEIGHT}
            stroke="#001B47"
            strokeWidth="2"
            strokeDasharray="6,4"
            opacity="0.5"
          />

          {/* Data lines */}
          {staffChartData.map((staff) => (
            <path
              key={staff.staff_id}
              d={generatePath(staff.points)}
              fill="none"
              stroke={staff.color}
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity="0.8"
            />
          ))}

          {/* Data points (circles) */}
          {staffChartData.map((staff) => (
            <g key={`points-${staff.staff_id}`}>
              {staff.points.map((p, idx) => {
                const x = getXForMonth(idx);
                const yScale = CHART_HEIGHT / maxPercent;
                const y =
                  VIEWBOX_HEIGHT - PADDING_BOTTOM - p.percent * yScale;

                return (
                  <circle
                    key={`point-${idx}`}
                    cx={x}
                    cy={y}
                    r="4"
                    fill={staff.color}
                    opacity="0.8"
                  />
                );
              })}
            </g>
          ))}

          {/* Staff name and % achieved labels at the end (January) */}
          {staffChartData.map((staff) => {
            const lastPoint = staff.points[staff.points.length - 1];
            const lastX = getXForMonth(displayMonths.length - 1);
            const yScale = CHART_HEIGHT / maxPercent;
            const lastY = VIEWBOX_HEIGHT - PADDING_BOTTOM - lastPoint.percent * yScale;

            return (
              <g key={`end-label-${staff.staff_id}`}>
                {/* Staff name */}
                <text
                  x={lastX + 12}
                  y={lastY - 8}
                  textAnchor="start"
                  className="text-xs font-semibold fill-gray-700 dark:fill-gray-300"
                  style={{ pointerEvents: 'none' }}
                >
                  {staff.name}
                </text>

                {/* % achieved */}
                <text
                  x={lastX + 12}
                  y={lastY + 6}
                  textAnchor="start"
                  className="text-xs font-semibold fill-gray-700 dark:fill-gray-300"
                  style={{ pointerEvents: 'none' }}
                >
                  {Math.round(lastPoint.percent)}%
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Centered Legend */}
      <div className="mt-8 flex flex-wrap gap-6 justify-center">
        {staffChartData.map((staff) => (
          <div key={staff.staff_id} className="flex items-center gap-2">
            <div
              className="w-4 h-4 rounded-full"
              style={{ backgroundColor: staff.color }}
            />
            <span className="text-sm text-gray-700 dark:text-gray-300">
              {staff.name}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};