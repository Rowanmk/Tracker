import React, { useState, useEffect } from 'react';
    import { loadTargets } from '../utils/loadTargets';
    import type { FinancialYear } from '../utils/financialYear';

    const VIEWBOX_HEIGHT = 300;
    const BASELINE_Y = 250;
    const TOP_MARGIN = 20;
    const BAR_AREA_HEIGHT = BASELINE_Y - TOP_MARGIN;

    export const RunRateTile = ({
      workingDays,
      workingDaysUpToToday,
      totalActual,
      dailyActivities,
      month,
      financialYear,
      dashboardMode = "team",
      currentStaff,
      viewMode = "numbers",
    }) => {

      const [runRateTarget, setRunRateTarget] = useState(0);

      const filteredActivities =
        dashboardMode === "individual" && currentStaff?.staff_id
          ? dailyActivities.filter(a => a.staff_id === currentStaff.staff_id)
          : dailyActivities;

      const runRateActual = filteredActivities.reduce(
        (s, a) => s + a.delivered_count, 0
      );

      useEffect(() => {
        const load = async () => {
          try {
            const id = dashboardMode === "individual" ? currentStaff?.staff_id : undefined;
            const { totalTarget } = await loadTargets(month, financialYear, id);
            setRunRateTarget(totalTarget);
          } catch {
            setRunRateTarget(0);
          }
        };
        load();
      }, [dashboardMode, month, financialYear, currentStaff?.staff_id]);

      // Use selected month/year consistently
      const selectedYear = month >= 4 ? financialYear.start : financialYear.end;
      
      // Calendar-correct days in month calculation (leap-year safe)
      const daysInSelectedMonth = new Date(selectedYear, month, 0).getDate();
      
      // Today's date only used to determine if selected month is current month
      const today = new Date();
      const currentDay = today.getDate();
      const currentMonth = today.getMonth() + 1;
      const currentYear = today.getFullYear();
      const isCurrentMonth = (month === currentMonth && selectedYear === currentYear);

      const dailyTarget = workingDays > 0 ? runRateTarget / workingDays : 0;
      const expectedByToday = dailyTarget * Math.min(workingDaysUpToToday, workingDays);

      // Working days calculation using selected month/year
      const workingDaysList = [];
      for (let d = 1; d <= daysInSelectedMonth; d++) {
        const dow = new Date(selectedYear, month - 1, d).getDay();
        if (dow !== 0 && dow !== 6) workingDaysList.push(d);
      }

      const deliveredByDay: Record<number, number> = {};
      filteredActivities.forEach(a => {
        deliveredByDay[a.day] = (deliveredByDay[a.day] || 0) + a.delivered_count;
      });

      let expectedCumulative = [];
      const actualCumulative = [];
      let eSum = 0, aSum = 0;

      // Loop using selected month's days for full month axis
      for (let d = 1; d <= daysInSelectedMonth; d++) {
        if (workingDaysList.includes(d)) eSum += dailyTarget;
        expectedCumulative.push(eSum);
        aSum += deliveredByDay[d] || 0;
        actualCumulative.push(aSum);
      }

      // NORMALIZE expectedCumulative so its final value equals runRateTarget
      const rawExpectedEnd = expectedCumulative[expectedCumulative.length - 1] || 0;
      if (rawExpectedEnd > 0 && runRateTarget > 0) {
        const scaleFactor = runRateTarget / rawExpectedEnd;
        expectedCumulative = expectedCumulative.map(value => value * scaleFactor);
      }

      // Calculate values based on viewMode
      let maxValue;
      let barValues = [];
      let expectedValues = [];

      if (viewMode === "percent") {
        // % View: Convert to percentages relative to full monthly target
        maxValue = 100; // Cap at 100%
        
        for (let d = 1; d <= daysInSelectedMonth; d++) {
          const actualPercent = runRateTarget > 0 ? Math.min((actualCumulative[d - 1] / runRateTarget) * 100, 100) : 0;
          const expectedPercent = runRateTarget > 0 ? Math.min((expectedCumulative[d - 1] / runRateTarget) * 100, 100) : 0;
          
          barValues.push(actualPercent);
          expectedValues.push(expectedPercent);
        }
      } else {
        // Numbers View: Use actual values
        maxValue = Math.max(...actualCumulative, ...expectedCumulative, 1);
        
        for (let d = 1; d <= daysInSelectedMonth; d++) {
          barValues.push(actualCumulative[d - 1]);
          expectedValues.push(expectedCumulative[d - 1]);
        }
      }

      // Determine which days to render bars for (only up to today for current month, all days for past months)
      const daysToRenderBars = isCurrentMonth ? Math.min(currentDay, daysInSelectedMonth) : daysInSelectedMonth;

      return (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md border border-gray-200 dark:border-gray-700 h-[500px] flex flex-col tile-brand transition-all duration-300 ease-in-out">
          <div className="tile-header px-4 py-2">
            {dashboardMode === "team" ? "Run Rate" : `${currentStaff?.name} Run Rate`}
          </div>

          <div className="flex-1 flex flex-col justify-end p-4 pb-6 overflow-hidden">
            <svg
              viewBox={`0 0 ${daysInSelectedMonth * 15 + 60} ${VIEWBOX_HEIGHT}`}
              preserveAspectRatio="none"
              className="w-full h-full"
              style={{ overflow: "hidden", display: "block" }}
            >
              <line x1="40" y1={BASELINE_Y} x2="40" y2={TOP_MARGIN} stroke="#999" strokeWidth="1.5" />
              <line x1="40" y1={BASELINE_Y} x2={daysInSelectedMonth * 15 + 40} y2={BASELINE_Y} stroke="#001B47" strokeWidth="2" />

              {Array.from({ length: Math.ceil(daysInSelectedMonth / 5) }, (_, i) => {
                const day = (i + 1) * 5;
                if (day > daysInSelectedMonth) return null;
                const x = day * 15 + 40;
                return (
                  <g key={day}>
                    <text
                      x={x}
                      y={BASELINE_Y + 15}
                      textAnchor="middle"
                      className="text-xs fill-gray-600"
                    >
                      {day}
                    </text>
                  </g>
                );
              })}

              {/* Render target line for full month with smooth transitions */}
              <polyline
                points={expectedValues
                  .map((v, i) => {
                    const x = (i + 1) * 15 + 40;
                    const y = BASELINE_Y - (v / maxValue) * BAR_AREA_HEIGHT;
                    return `${x},${y}`;
                  })
                  .join(" ")}
                fill="none"
                stroke="#6B7280"
                strokeWidth="3"
                strokeDasharray="8,4"
                className="transition-all duration-300 ease-in-out"
              />

              {/* Render bars only for today and past dates with smooth transitions */}
              {barValues.slice(0, daysToRenderBars).map((value, idx) => {
                const day = idx + 1;
                const ratio = value / maxValue;
                const barHeight = ratio * BAR_AREA_HEIGHT;
                const x = day * 15 + 40;

                return (
                  <rect
                    key={day}
                    x={x - 5}
                    y={BASELINE_Y - barHeight}
                    width={10}
                    height={barHeight}
                    fill="#001B47"
                    rx={2}
                    className="transition-all duration-300 ease-in-out"
                  />
                );
              })}
            </svg>
          </div>
        </div>
      );
    };