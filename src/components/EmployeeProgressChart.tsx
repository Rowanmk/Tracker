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

  useEffect(() => {
    const fetchTargets = async () => {
      setLoading(true);
      try {
        if (dashboardMode === "individual" && currentStaff) {
          const { perService } = await loadTargets(month, financialYear, currentStaff.staff_id);
          setServiceTargets(perService);
        } else {
          const tMap: Record<number, number> = {};
          for (const staff of staffPerformance) {
            const { totalTarget } = await loadTargets(month, financialYear, staff.staff_id);
            tMap[staff.staff_id] = totalTarget;
          }
          setStaffTargets(tMap);
        }
      } catch (e) { 
        console.error(e); 
      } finally { 
        setLoading(false); 
      }
    };
    fetchTargets();
  }, [dashboardMode, month, financialYear, staffPerformance.length, currentStaff?.staff_id]);

  const getBarColor = (percentage: number) => {
    if (percentage >= 90) return "#008A00";     // dark green  
    if (percentage >= 75) return "#FF8A2A";     // orange  
    return "#FF3B30";                           // red  
  };

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md border border-gray-200 dark:border-gray-700 h-[500px] flex flex-col tile-brand transition-all duration-300 ease-in-out">
        <div className="tile-header px-4 py-1.5">Employee Progress Chart</div>
        <div className="flex-1 flex items-center justify-center text-gray-500">Loading…</div>
      </div>
    );
  }

  const barCount = dashboardMode === "individual" ? services.length : staffPerformance.length;
  const FIXED_LEFT_MARGIN = 60;
  const CHART_WIDTH = 800;
  const AVAILABLE_WIDTH = CHART_WIDTH - FIXED_LEFT_MARGIN - 40;
  const BAR_SLOT_WIDTH = AVAILABLE_WIDTH / Math.max(barCount, 1);
  const BAR_WIDTH = Math.min(BAR_SLOT_WIDTH * 0.65, 60);

  if (dashboardMode === "individual" && currentStaff) {
    const currentStaffData = staffPerformance.find(s => s.staff_id === currentStaff.staff_id);
    
    if (!currentStaffData) {
      return (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md border border-gray-200 dark:border-gray-700 h-[500px] flex flex-col tile-brand transition-all duration-300 ease-in-out">
          <div className="tile-header px-4 py-1.5">Employee Progress Chart</div>
          <div className="flex-1 flex items-center justify-center text-gray-500">No data available for {currentStaff.name}</div>
        </div>
      );
    }

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

    const maxRunRatePercent = Math.max(...serviceRunRateData.map(d => d.runRatePercent), 1);
    const maxDelivered = Math.max(...serviceRunRateData.map(d => d.delivered), 1);
    const maxExpected = Math.max(...serviceRunRateData.map(d => d.expectedByToday), 1);

    const maxValue = viewMode === "percent" ? maxRunRatePercent : Math.max(maxDelivered, maxExpected);
    const yMax = Math.max(maxValue * 1.20, 1);

    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md border border-gray-200 dark:border-gray-700 h-[500px] flex flex-col tile-brand transition-all duration-300 ease-in-out">
        <div className="tile-header px-4 py-1.5">
          {currentStaff.name} - Service Progress
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

            {serviceRunRateData.map((data, i) => {
              const { service, delivered, expectedByToday, runRatePercent } = data;
              
              let display, barHeight;
              if (viewMode === "percent") {
                display = runRatePercent;
                barHeight = (runRatePercent / yMax) * BAR_AREA_HEIGHT;
              } else {
                display = Math.min(delivered, expectedByToday);
                barHeight = (display / yMax) * BAR_AREA_HEIGHT;
              }

              const x = FIXED_LEFT_MARGIN + (i * BAR_SLOT_WIDTH) + (BAR_SLOT_WIDTH / 2);
              const barColor = getBarColor(runRatePercent);

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
                    y={BASELINE_Y - barHeight - 8}
                    textAnchor="middle"
                    className="text-xs font-bold fill-gray-700 dark:fill-gray-300 transition-all duration-300 ease-in-out"
                  >
                    {viewMode === "percent" ? `${Math.round(runRatePercent)}%` : Math.round(display)}
                  </text>

                  <text
                    x={x}
                    y={BASELINE_Y + 15}
                    textAnchor="middle"
                    className="text-[10px] font-medium fill-gray-600 dark:fill-gray-400 transition-all duration-300 ease-in-out"
                  >
                    {service.service_name}
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
  }

  const sortedStaff = [...staffPerformance].sort((a, b) => b.total - a.total);
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

  const maxRunRatePercent = Math.max(...staffRunRateData.map(d => d.runRatePercent), 1);
  const maxDelivered = Math.max(...staffRunRateData.map(d => d.delivered), 1);
  const maxExpected = Math.max(...staffRunRateData.map(d => d.expectedByToday), 1);

  const maxValue = viewMode === "percent" ? maxRunRatePercent : Math.max(maxDelivered, maxExpected);
  const yMax = Math.max(maxValue * 1.10, 1);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md border border-gray-200 dark:border-gray-700 h-[500px] flex flex-col tile-brand transition-all duration-300 ease-in-out">
      <div className="tile-header px-4 py-1.5">
        Employee Progress Chart
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

          {staffRunRateData.map((data, i) => {
            const { staff, delivered, expectedByToday, runRatePercent } = data;
            
            let display, barHeight;
            if (viewMode === "percent") {
              display = runRatePercent;
              barHeight = (runRatePercent / yMax) * BAR_AREA_HEIGHT;
            } else {
              display = Math.min(delivered, expectedByToday);
              barHeight = (display / yMax) * BAR_AREA_HEIGHT;
            }

            const x = FIXED_LEFT_MARGIN + (i * BAR_SLOT_WIDTH) + (BAR_SLOT_WIDTH / 2);
            const barColor = getBarColor(runRatePercent);

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
                  y={BASELINE_Y - barHeight - 8}
                  textAnchor="middle"
                  className="text-[10px] font-bold fill-gray-700 dark:fill-gray-300 transition-all duration-300 ease-in-out"
                >
                  {viewMode === "percent" ? `${Math.round(runRatePercent)}%` : Math.round(display)}
                </text>

                <text
                  x={x}
                  y={BASELINE_Y + 15}
                  textAnchor="middle"
                  className="text-[10px] font-medium fill-gray-600 dark:fill-gray-400 transition-all duration-300 ease-in-out"
                >
                  {staff.name}
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