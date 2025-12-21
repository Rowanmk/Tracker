import React, { useState, useEffect } from 'react';
import { loadTargets } from '../utils/loadTargets';
import type { FinancialYear } from '../utils/financialYear';

interface EmployeeProgressChartProps {
  services: any[];
  staffPerformance: any[];
  dashboardMode?: "team" | "individual";
  currentStaff?: { staff_id: number; name: string } | null;
  viewMode: "percent" | "numbers";
  workingDays: number;
  workingDaysUpToToday: number;
  month: number;
  financialYear: FinancialYear;
}

const VIEWBOX_HEIGHT = 300;
const BASELINE_Y = 250;
const TOP_MARGIN = 20;
const BAR_AREA_HEIGHT = BASELINE_Y - TOP_MARGIN;

export const EmployeeProgressChart: React.FC<EmployeeProgressChartProps> = ({
  services,
  staffPerformance,
  dashboardMode = "team",
  currentStaff,
  viewMode,
  workingDays,
  workingDaysUpToToday,
  month,
  financialYear,
}) => {

  const [staffTargets, setStaffTargets] = useState<Record<number, number>>({});
  const [serviceTargets, setServiceTargets] = useState<Record<number, number>>({});
  const [loading, setLoading] = useState(false);

  const effectiveStaffPerformance = staffPerformance;

  const sortedStaff = [...effectiveStaffPerformance].sort((a, b) => b.total - a.total);

  useEffect(() => {
    const fetchTargets = async () => {
      setLoading(true);
      try {
        if (dashboardMode === "individual" && currentStaff) {
          // Individual mode: fetch service targets for current staff
          const { perService } = await loadTargets(month, financialYear, currentStaff.staff_id);
          setServiceTargets(perService);
        } else {
          // Team mode: fetch staff targets
          const tMap: Record<number, number> = {};
          for (const staff of staffPerformance) {
            const { totalTarget } = await loadTargets(month, financialYear, staff.staff_id);
            tMap[staff.staff_id] = totalTarget;
          }
          setStaffTargets(tMap);
        }
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    };
    fetchTargets();
  }, [dashboardMode, month, financialYear, staffPerformance.length, currentStaff?.staff_id]);

  const getBarColor = (percentage, staffId) => {
    if (dashboardMode === "individual" && currentStaff && staffId !== currentStaff.staff_id)
      return "#C7C7C7"; // grey-out others
    
    if (percentage >= 90) return "#008A00";     // dark green  
    if (percentage >= 75) return "#FF8A2A";     // orange  
    return "#FF3B30";                           // red  
  };

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md border border-gray-200 dark:border-gray-700 h-[500px] flex flex-col tile-brand transition-all duration-300 ease-in-out">
        <div className="tile-header px-4 py-2">Employee Progress Chart</div>
        <div className="flex-1 flex items-center justify-center text-gray-500">Loading…</div>
      </div>
    );
  }

  // Determine bar count and data based on mode
  const barCount = dashboardMode === "individual" ? services.length : sortedStaff.length;
  
  // Calculate dynamic spacing
  const FIXED_LEFT_MARGIN = 60;
  const CHART_WIDTH = 800; // Total available width
  const AVAILABLE_WIDTH = CHART_WIDTH - FIXED_LEFT_MARGIN - 40; // Right margin
  const BAR_SLOT_WIDTH = AVAILABLE_WIDTH / barCount;
  const BAR_WIDTH = BAR_SLOT_WIDTH * 0.65; // 65% of slot width for consistent density

  if (dashboardMode === "individual" && currentStaff) {
    // Individual mode: render one bar per service
    const currentStaffData = staffPerformance.find(s => s.staff_id === currentStaff.staff_id);
    if (!currentStaffData) {
      return (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md border border-gray-200 dark:border-gray-700 h-[500px] flex flex-col tile-brand transition-all duration-300 ease-in-out">
          <div className="tile-header px-4 py-2">Employee Progress Chart</div>
          <div className="flex-1 flex items-center justify-center text-gray-500">No data available</div>
        </div>
      );
    }

    // Calculate run-rate values for individual services
    const serviceRunRateData = services.map(service => {
      const delivered = currentStaffData.services[service.service_name] || 0;
      const target = serviceTargets[service.service_id] || 0;
      const expectedByToday = workingDays > 0 ? (target / workingDays) * workingDaysUpToToday : 0;
      const runRatePercent = expectedByToday > 0 ? (delivered / expectedByToday) * 100 : 0;
      
      return {
        service,
        delivered,
        target,
        expectedByToday,
        runRatePercent
      };
    });

    // Calculate Y-axis max from run-rate values
    const maxRunRatePercent = Math.max(...serviceRunRateData.map(d => d.runRatePercent), 1);
    const maxDelivered = Math.max(...serviceRunRateData.map(d => d.delivered), 1);
    const maxExpected = Math.max(...serviceRunRateData.map(d => d.expectedByToday), 1);

    const maxValue = viewMode === "percent" ? maxRunRatePercent : Math.max(maxDelivered, maxExpected);
    const yMax = maxValue * 1.20;

    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md border border-gray-200 dark:border-gray-700 h-[500px] flex flex-col tile-brand transition-all duration-300 ease-in-out">
        <div className="tile-header px-4 py-2">
          Employee Progress Chart
        </div>

        <div className="flex-1 flex flex-col justify-end p-4 pb-6">
          <svg
            viewBox={`0 0 ${CHART_WIDTH} ${VIEWBOX_HEIGHT}`}
            preserveAspectRatio="none"
            className="w-full h-full"
          >
            {/* Horizontal X-axis baseline */}
            <line
              x1={FIXED_LEFT_MARGIN}
              y1={BASELINE_Y}
              x2={CHART_WIDTH - 20}
              y2={BASELINE_Y}
              stroke="#6B7280"
              strokeWidth="1"
            />

            {serviceRunRateData.map((data, i) => {
              const { service, delivered, expectedByToday, runRatePercent } = data;
              
              // Bar height and label based on view mode
              let display, barHeight;
              if (viewMode === "percent") {
                display = runRatePercent;
                barHeight = yMax > 0 ? Math.min((runRatePercent / yMax) * BAR_AREA_HEIGHT, BAR_AREA_HEIGHT) : 0;
              } else {
                display = Math.min(delivered, expectedByToday);
                barHeight = yMax > 0 ? Math.min((display / yMax) * BAR_AREA_HEIGHT, BAR_AREA_HEIGHT) : 0;
              }

              const x = FIXED_LEFT_MARGIN + (i * BAR_SLOT_WIDTH) + (BAR_SLOT_WIDTH / 2);
              const barColor = getBarColor(runRatePercent, currentStaff.staff_id);

              return (
                <g key={service.service_id}>
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
                    y={BASELINE_Y - barHeight + 20}
                    textAnchor="middle"
                    fill="#FFF"
                    className="text-sm font-bold transition-all duration-300 ease-in-out"
                  >
                    {viewMode === "percent" ? `${Math.round(runRatePercent)}%` : Math.round(display)}
                  </text>

                  <text
                    x={x}
                    y={BASELINE_Y + 15}
                    textAnchor="middle"
                    className="text-xs fill-gray-700 dark:fill-gray-300 transition-all duration-300 ease-in-out"
                  >
                    {service.service_name}
                  </text>
                </g>
              );
            })}

            {/* % View - Horizontal Run Rate Line positioned at exactly 100% */}
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
  }

  // Team mode: render one bar per staff member using run-rate calculations
  const staffRunRateData = sortedStaff.map(staff => {
    const target = staffTargets[staff.staff_id] || 0;
    const delivered = staff.total;
    const expectedByToday = workingDays > 0 ? (target / workingDays) * workingDaysUpToToday : 0;
    const runRatePercent = expectedByToday > 0 ? (delivered / expectedByToday) * 100 : 0;
    
    return {
      staff,
      delivered,
      target,
      expectedByToday,
      runRatePercent
    };
  });

  // Calculate Y-axis max from run-rate values
  const maxRunRatePercent = Math.max(...staffRunRateData.map(d => d.runRatePercent), 1);
  const maxDelivered = Math.max(...staffRunRateData.map(d => d.delivered), 1);
  const maxExpected = Math.max(...staffRunRateData.map(d => d.expectedByToday), 1);

  const maxValue = viewMode === "percent" ? maxRunRatePercent : Math.max(maxDelivered, maxExpected);
  const yMax = maxValue * 1.10;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md border border-gray-200 dark:border-gray-700 h-[500px] flex flex-col tile-brand transition-all duration-300 ease-in-out">
      <div className="tile-header px-4 py-2">
        Employee Progress Chart
      </div>

      <div className="flex-1 flex flex-col justify-end p-4 pb-6">
        <svg
          viewBox={`0 0 ${CHART_WIDTH} ${VIEWBOX_HEIGHT}`}
          preserveAspectRatio="none"
          className="w-full h-full"
        >
          {/* Horizontal X-axis baseline */}
          <line
            x1={FIXED_LEFT_MARGIN}
            y1={BASELINE_Y}
            x2={CHART_WIDTH - 20}
            y2={BASELINE_Y}
            stroke="#6B7280"
            strokeWidth="1"
          />

          {staffRunRateData.map((data, i) => {
            const { staff, delivered, expectedByToday, runRatePercent } = data;
            
            // Bar height and label based on view mode
            let display, barHeight;
            if (viewMode === "percent") {
              display = runRatePercent;
              barHeight = yMax > 0 ? (runRatePercent / yMax) * BAR_AREA_HEIGHT : 0;
            } else {
              display = Math.min(delivered, expectedByToday);
              barHeight = yMax > 0 ? (display / yMax) * BAR_AREA_HEIGHT : 0;
            }

            const x = FIXED_LEFT_MARGIN + (i * BAR_SLOT_WIDTH) + (BAR_SLOT_WIDTH / 2);
            const barColor = getBarColor(runRatePercent, staff.staff_id);

            return (
              <g key={staff.staff_id}>
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
                  y={BASELINE_Y - barHeight + 20}
                  textAnchor="middle"
                  fill={barColor === "#C7C7C7" ? "#333" : "#FFF"}
                  className="text-sm font-bold transition-all duration-300 ease-in-out"
                >
                  {viewMode === "percent" ? `${Math.round(runRatePercent)}%` : Math.round(display)}
                </text>

                <text
                  x={x}
                  y={BASELINE_Y + 15}
                  textAnchor="middle"
                  className="text-xs fill-gray-700 dark:fill-gray-300 transition-all duration-300 ease-in-out"
                >
                  {staff.name}
                </text>
              </g>
            );
          })}

          {/* % View - Horizontal Run Rate Line positioned at exactly 100% */}
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