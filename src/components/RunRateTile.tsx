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
  dailyActivities,
  month,
  financialYear,
  viewMode = "numbers",
}) => {
  const [runRateTarget, setRunRateTarget] = useState(0);

  useEffect(() => {
    const load = async () => {
      try {
        const { totalTarget } = await loadTargets(month, financialYear);
        setRunRateTarget(totalTarget);
      } catch {
        setRunRateTarget(0);
      }
    };
    load();
  }, [month, financialYear]);

  const selectedYear = month >= 4 ? financialYear.start : financialYear.end;
  const daysInSelectedMonth = new Date(selectedYear, month, 0).getDate();
  
  const today = new Date();
  const currentDay = today.getDate();
  const currentMonth = today.getMonth() + 1;
  const currentYear = today.getFullYear();
  const isCurrentMonth = (month === currentMonth && selectedYear === currentYear);

  const dailyTarget = workingDays > 0 ? runRateTarget / workingDays : 0;

  const workingDaysList = [];
  for (let d = 1; d <= daysInSelectedMonth; d++) {
    const dow = new Date(selectedYear, month - 1, d).getDay();
    if (dow !== 0 && dow !== 6) workingDaysList.push(d);
  }

  const deliveredByDay: Record<number, number> = {};
  dailyActivities.forEach(a => {
    deliveredByDay[a.day] = (deliveredByDay[a.day] || 0) + a.delivered_count;
  });

  let expectedCumulative = [];
  const actualCumulative = [];
  let eSum = 0, aSum = 0;

  for (let d = 1; d <= daysInSelectedMonth; d++) {
    if (workingDaysList.includes(d)) eSum += dailyTarget;
    expectedCumulative.push(eSum);
    aSum += deliveredByDay[d] || 0;
    actualCumulative.push(aSum);
  }

  const rawExpectedEnd = expectedCumulative[expectedCumulative.length - 1] || 0;
  if (rawExpectedEnd > 0 && runRateTarget > 0) {
    const scaleFactor = runRateTarget / rawExpectedEnd;
    expectedCumulative = expectedCumulative.map(value => value * scaleFactor);
  }

  let maxValue;
  let barValues = [];
  let expectedValues = [];

  if (viewMode === "percent") {
    maxValue = 100;
    for (let d = 1; d <= daysInSelectedMonth; d++) {
      const actualPercent = runRateTarget > 0 ? Math.min((actualCumulative[d - 1] / runRateTarget) * 100, 100) : 0;
      const expectedPercent = runRateTarget > 0 ? Math.min((expectedCumulative[d - 1] / runRateTarget) * 100, 100) : 0;
      barValues.push(actualPercent);
      expectedValues.push(expectedPercent);
    }
  } else {
    maxValue = Math.max(...actualCumulative, ...expectedCumulative, 1);
    for (let d = 1; d <= daysInSelectedMonth; d++) {
      barValues.push(actualCumulative[d - 1]);
      expectedValues.push(expectedCumulative[d - 1]);
    }
  }

  const daysToRenderBars = isCurrentMonth ? Math.min(currentDay, daysInSelectedMonth) : daysInSelectedMonth;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md border border-gray-200 dark:border-gray-700 h-[500px] flex flex-col tile-brand transition-all duration-300 ease-in-out">
      <div className="tile-header px-4 py-1.5">
        Run Rate
      </div>

      <div className="flex-1 flex flex-col justify-end p-3 pb-4 overflow-hidden">
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
                <text x={x} y={BASELINE_Y + 15} textAnchor="middle" className="text-xs fill-gray-600">
                  {day}
                </text>
              </g>
            );
          })}

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