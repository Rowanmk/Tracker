import React, { useMemo, useState } from 'react';
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

const VIEWBOX_WIDTH = 800;
const VIEWBOX_HEIGHT = 400;
const PADDING_LEFT = 50;
const PADDING_RIGHT = 150;
const PADDING_TOP = 30;
const PADDING_BOTTOM = 80;

const CHART_WIDTH = VIEWBOX_WIDTH - PADDING_LEFT - PADDING_RIGHT;
const CHART_HEIGHT = VIEWBOX_HEIGHT - PADDING_TOP - PADDING_BOTTOM;

export const SelfAssessmentProgressChart: React.FC<SelfAssessmentProgressChartProps> = ({
  staffProgress,
  financialYear,
  monthlyData,
}) => {
  const [activeStaffId, setActiveStaffId] = useState<number | null>(null);

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
      <div className="text-center py-8 text-gray-500 dark:text-gray-400">
        No staff members with targets to display.
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

  // Determine if a staff member's line should be highlighted
  const isLineHighlighted = (staffId: number): boolean => {
    if (activeStaffId === null) return true; // All lines visible when no selection
    return staffId === activeStaffId;
  };

  // Get opacity for a line
  const getLineOpacity = (staffId: number): number => {
    if (activeStaffId === null) return 0.8; // Normal opacity
    return isLineHighlighted(staffId) ? 0.8 : 0.3; // Highlighted or de-emphasized
  };

  // Get opacity for a point
  const getPointOpacity = (staffId: number): number => {
    if (activeStaffId === null) return 0.8;
    return isLineHighlighted(staffId) ? 0.8 : 0.3;
  };

  // Toggle active staff selection
  const handleLegendClick = (staffId: number) => {
    setActiveStaffId(activeStaffId === staffId ? null : staffId);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 flex flex-col">
        <svg
          viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
          className="w-full flex-1"
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
            // Add year to January and April
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
              opacity={getLineOpacity(staff.staff_id)}
              className="transition-opacity duration-300 ease-in-out"
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
                    opacity={getPointOpacity(staff.staff_id)}
                    className="transition-opacity duration-300 ease-in-out"
                  />
                );
              })}
            </g>
          ))}

          {/* Staff name and % achieved labels at the end (January) - ONLY when no selection active */}
          {activeStaffId === null && staffChartData.map((staff) => {
            const lastPoint = staff.points[staff.points.length - 1];
            const lastX = getXForMonth(displayMonths.length - 1);
            const yScale = CHART_HEIGHT / maxPercent;
            const lastY = VIEWBOX_HEIGHT - PADDING_BOTTOM - lastPoint.percent * yScale;

            return (
              <g key={`end-label-${staff.staff_id}`}>
                {/* Combined label: "Name 99%" on one line */}
                <text
                  x={lastX + 12}
                  y={lastY + 2}
                  textAnchor="start"
                  className="text-xs font-semibold fill-gray-700 dark:fill-gray-300 transition-opacity duration-300 ease-in-out"
                  style={{ pointerEvents: 'none' }}
                >
                  {staff.name} {Math.round(lastPoint.percent)}%
                </text>
              </g>
            );
          })}
        </svg>

        {/* Interactive Legend */}
        <div className="mt-4 flex flex-wrap gap-4 justify-center">
          {staffChartData.map((staff) => {
            const isActive = activeStaffId === staff.staff_id;
            return (
              <button
                key={staff.staff_id}
                onClick={() => handleLegendClick(staff.staff_id)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md transition-all duration-200 ease-in-out ${
                  isActive
                    ? 'bg-blue-100 dark:bg-blue-900/40 ring-2 ring-blue-500 dark:ring-blue-400'
                    : 'hover:bg-gray-100 dark:hover:bg-gray-700/50'
                }`}
                title={isActive ? 'Click to deselect' : 'Click to highlight'}
              >
                <div
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: staff.color }}
                />
                <span
                  className={`text-xs transition-all duration-200 ease-in-out ${
                    isActive
                      ? 'font-bold text-blue-900 dark:text-blue-100'
                      : 'text-gray-700 dark:text-gray-300'
                  }`}
                >
                  {staff.name}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};