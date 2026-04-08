import React, { useEffect, useMemo, useRef, useState } from 'react';
import { loadTargets } from '../utils/loadTargets';
import { useAuth } from '../context/AuthContext';
import type { FinancialYear } from '../utils/financialYear';
import { calculateExpectedRaw, calculateRunRateDelta } from '../utils/runRate';

interface TeamProgressTileProps {
  services: Array<{
    service_id: number;
    service_name: string;
  }>;
  staffPerformance: Array<{
    staff_id: number;
    name: string;
    services: { [key: string]: number };
    total: number;
    target: number;
    achieved_percent: number;
    historicalAverage: number;
    previousMonthRatio?: number;
  }>;
  viewMode: 'percent' | 'numbers';
  workingDays: number;
  workingDaysUpToToday: number;
  month: number;
  financialYear: FinancialYear;
}

interface AccountantBreakdown {
  staff_id: number;
  name: string;
  delivered: number;
  target: number;
}

interface ProgressRow {
  id: string;
  label: string;
  delivered: number;
  target: number;
  achievedPercent: number;
  expectedPercent: number;
  difference: number;
  barColor: string;
  expectedSoFar: number;
  accountantBreakdown: AccountantBreakdown[];
}

interface TooltipState {
  visible: boolean;
  x: number;
  y: number;
  rowId: string;
}

const getRunRateBarColor = (achievedPercent: number, elapsedWorkingDayPercent: number) => {
  if (elapsedWorkingDayPercent <= 0) return '#008A00';
  const paceRatio = (achievedPercent / elapsedWorkingDayPercent) * 100;
  if (paceRatio >= 100) return '#008A00';
  if (paceRatio >= 80) return '#FF8A2A';
  return '#FF3B30';
};

export const TeamProgressTile: React.FC<TeamProgressTileProps> = ({
  services,
  staffPerformance,
  workingDays,
  workingDaysUpToToday,
  month,
  financialYear,
}) => {
  const { selectedTeamId } = useAuth();
  const [selectedTarget, setSelectedTarget] = useState(0);
  const [serviceTargets, setServiceTargets] = useState<Record<number, number>>({});
  const [perStaffServiceTargets, setPerStaffServiceTargets] = useState<Record<number, Record<number, number>>>({});
  const [loading, setLoading] = useState(false);
  const [tooltip, setTooltip] = useState<TooltipState>({ visible: false, x: 0, y: 0, rowId: '' });
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchSelectedTargets = async () => {
      setLoading(true);
      try {
        let totalTarget = 0;
        const nextServiceTargets: Record<number, number> = {};
        const nextPerStaffServiceTargets: Record<number, Record<number, number>> = {};

        if (selectedTeamId === 'team-view' || selectedTeamId === 'all' || !selectedTeamId) {
          for (const staffMember of staffPerformance) {
            const { totalTarget: staffTarget, perService } = await loadTargets(month, financialYear, staffMember.staff_id);
            totalTarget += staffTarget;
            nextPerStaffServiceTargets[staffMember.staff_id] = perService;

            Object.entries(perService).forEach(([serviceId, value]) => {
              const numericServiceId = Number(serviceId);
              nextServiceTargets[numericServiceId] = (nextServiceTargets[numericServiceId] || 0) + value;
            });
          }
        } else {
          const selectedStaffId = Number(selectedTeamId);
          if (!Number.isNaN(selectedStaffId)) {
            const { totalTarget: staffTarget, perService } = await loadTargets(month, financialYear, selectedStaffId);
            totalTarget = staffTarget;
            nextPerStaffServiceTargets[selectedStaffId] = perService;

            Object.entries(perService).forEach(([serviceId, value]) => {
              nextServiceTargets[Number(serviceId)] = value;
            });
          }
        }

        setSelectedTarget(totalTarget);
        setServiceTargets(nextServiceTargets);
        setPerStaffServiceTargets(nextPerStaffServiceTargets);
      } catch {
        setSelectedTarget(0);
        setServiceTargets({});
        setPerStaffServiceTargets({});
      } finally {
        setLoading(false);
      }
    };

    void fetchSelectedTargets();
  }, [month, financialYear, selectedTeamId, staffPerformance]);

  const todayExpectedPercentage = useMemo(
    () => (workingDays > 0 ? (workingDaysUpToToday / workingDays) * 100 : 0),
    [workingDays, workingDaysUpToToday]
  );

  const progressRows = useMemo<ProgressRow[]>(() => {
    const baseRows = services.map((service) => {
      const delivered = staffPerformance.reduce(
        (sum, staff) => sum + (staff.services[service.service_name] || 0),
        0
      );
      const target = serviceTargets[service.service_id] || 0;
      const achievedPercent = target > 0 ? (delivered / target) * 100 : 0;
      const expectedSoFar = calculateExpectedRaw(target, workingDays, workingDaysUpToToday);
      const difference = calculateRunRateDelta(delivered, target, workingDays, workingDaysUpToToday).variance;
      const expectedPercent = target > 0 ? Math.min((expectedSoFar / target) * 100, 100) : 0;

      const accountantBreakdown: AccountantBreakdown[] = staffPerformance.map((staff) => {
        const staffDelivered = staff.services[service.service_name] || 0;
        const staffTarget = perStaffServiceTargets[staff.staff_id]?.[service.service_id] || 0;
        return {
          staff_id: staff.staff_id,
          name: staff.name,
          delivered: staffDelivered,
          target: staffTarget,
        };
      }).filter((b) => b.delivered > 0 || b.target > 0);

      return {
        id: `service-${service.service_id}`,
        label: service.service_name,
        delivered,
        target,
        achievedPercent,
        expectedPercent,
        difference,
        barColor: getRunRateBarColor(achievedPercent, todayExpectedPercentage),
        expectedSoFar,
        accountantBreakdown,
      };
    });

    const totalDelivered = staffPerformance.reduce((sum, staff) => sum + staff.total, 0);
    const totalTarget = selectedTarget;
    const totalAchievedPercent = totalTarget > 0 ? (totalDelivered / totalTarget) * 100 : 0;
    const totalExpectedSoFar = calculateExpectedRaw(totalTarget, workingDays, workingDaysUpToToday);
    const totalDifference = calculateRunRateDelta(totalDelivered, totalTarget, workingDays, workingDaysUpToToday).variance;
    const totalExpectedPercent = totalTarget > 0 ? Math.min((totalExpectedSoFar / totalTarget) * 100, 100) : 0;

    const totalAccountantBreakdown: AccountantBreakdown[] = staffPerformance.map((staff) => {
      const staffTotalTarget = Object.values(perStaffServiceTargets[staff.staff_id] || {}).reduce((s, v) => s + v, 0);
      return {
        staff_id: staff.staff_id,
        name: staff.name,
        delivered: staff.total,
        target: staffTotalTarget,
      };
    }).filter((b) => b.delivered > 0 || b.target > 0);

    return [
      ...baseRows,
      {
        id: 'total',
        label: 'Total',
        delivered: totalDelivered,
        target: totalTarget,
        achievedPercent: totalAchievedPercent,
        expectedPercent: totalExpectedPercent,
        difference: totalDifference,
        barColor: getRunRateBarColor(totalAchievedPercent, todayExpectedPercentage),
        expectedSoFar: totalExpectedSoFar,
        accountantBreakdown: totalAccountantBreakdown,
      },
    ];
  }, [
    services,
    staffPerformance,
    serviceTargets,
    perStaffServiceTargets,
    workingDays,
    workingDaysUpToToday,
    selectedTarget,
    todayExpectedPercentage,
  ]);

  const activeRow = tooltip.visible ? progressRows.find((r) => r.id === tooltip.rowId) : null;

  const handleBarMouseEnter = (e: React.MouseEvent<HTMLDivElement>, rowId: string) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const barRect = e.currentTarget.getBoundingClientRect();
    setTooltip({
      visible: true,
      x: barRect.left - rect.left + barRect.width / 2,
      y: barRect.top - rect.top,
      rowId,
    });
  };

  const handleBarMouseLeave = () => {
    setTooltip((prev) => ({ ...prev, visible: false }));
  };

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md border border-gray-200 dark:border-gray-700 h-[418px] flex flex-col tile-brand transition-all duration-300 ease-in-out">
        <div className="tile-header px-4 py-1.5">
          Accountant Progress
        </div>
        <div className="flex-1 flex items-center justify-center text-gray-500">Loading…</div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="bg-white dark:bg-gray-800 rounded-xl shadow-md border border-gray-200 dark:border-gray-700 h-[418px] flex flex-col tile-brand transition-all duration-300 ease-in-out relative"
    >
      <div className="tile-header px-4 py-1.5">
        Accountant Progress
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {progressRows.map((row) => {
          const formattedDifference =
            row.difference > 0 ? `+${row.difference}` : `${row.difference}`;

          return (
            <div key={row.id} className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="font-bold text-gray-900 dark:text-white">{row.label}</span>
                <div className="flex items-center space-x-2">
                  <span className="font-bold text-gray-900 dark:text-white">
                    {Math.round(row.delivered * 10) / 10} / {Math.round(row.target * 10) / 10}
                  </span>
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    ({Math.round(row.achievedPercent)}%)
                  </span>
                </div>
              </div>

              <div className="relative flex items-center">
                <div className="flex-1 relative">
                  <div
                    className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-7 overflow-hidden shadow-inner cursor-pointer"
                    onMouseEnter={(e) => handleBarMouseEnter(e, row.id)}
                    onMouseLeave={handleBarMouseLeave}
                  >
                    <div
                      className="h-7 rounded-full shadow-sm transition-[width] duration-[800ms] ease-in-out"
                      style={{
                        width: `${Math.min(row.achievedPercent, 100)}%`,
                        backgroundColor: row.barColor,
                      }}
                      title={`${row.label}: ${Math.round(row.delivered * 10) / 10}/${Math.round(row.target * 10) / 10} (${Math.round(row.achievedPercent)}%)`}
                    />
                    {row.target > 0 && (
                      <div
                        className="absolute top-0 h-7 w-0.5 bg-[#001B47] transition-[left] duration-[800ms] ease-in-out"
                        style={{ left: `${row.expectedPercent}%` }}
                        title={`Expected by today: ${Math.round(row.expectedSoFar * 10) / 10}`}
                      />
                    )}
                  </div>
                </div>
                <div className="ml-3 flex items-center justify-end" style={{ minWidth: '56px' }}>
                  <span
                    className="inline-flex items-center px-2 py-1 rounded text-sm font-bold"
                    style={{
                      color:
                        row.difference > 0
                          ? '#008A00'
                          : row.difference < 0
                          ? '#FF3B30'
                          : '#6B7280',
                    }}
                  >
                    {formattedDifference}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Tooltip */}
      {tooltip.visible && activeRow && activeRow.accountantBreakdown.length > 0 && (
        <div
          className="absolute z-50 pointer-events-none"
          style={{
            left: Math.min(tooltip.x, 260),
            top: tooltip.y - 8,
            transform: 'translate(-50%, -100%)',
          }}
        >
          <div
            className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-2xl overflow-hidden"
            style={{ minWidth: '220px', maxWidth: '280px' }}
          >
            {/* Header */}
            <div className="bg-[#001B47] px-3 py-2">
              <span className="text-white text-xs font-bold uppercase tracking-wide">
                {activeRow.label} — Accountant Split
              </span>
            </div>

            {/* Rows */}
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {activeRow.accountantBreakdown.map((entry) => {
                const pct = entry.target > 0 ? Math.round((entry.delivered / entry.target) * 100) : 0;
                return (
                  <div key={entry.staff_id} className="px-3 py-2 flex items-center justify-between gap-3">
                    <span className="text-xs font-semibold text-gray-800 dark:text-gray-200 truncate flex-1">
                      {entry.name}
                    </span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-xs font-bold text-[#001B47] dark:text-blue-300">
                        {entry.delivered}
                      </span>
                      <span className="text-xs text-gray-400">/</span>
                      <span className="text-xs text-gray-600 dark:text-gray-400">
                        {entry.target}
                      </span>
                      <span
                        className="text-[10px] font-bold ml-1"
                        style={{
                          color: pct >= 90 ? '#008A00' : pct >= 75 ? '#FF8A2A' : '#FF3B30',
                        }}
                      >
                        {pct}%
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Footer hint */}
            <div className="bg-gray-50 dark:bg-gray-800/60 px-3 py-1.5 border-t border-gray-100 dark:border-gray-700">
              <span className="text-[10px] text-gray-400">Delivered / Target</span>
            </div>
          </div>

          {/* Arrow */}
          <div className="flex justify-center">
            <div
              className="w-3 h-3 bg-white dark:bg-gray-900 border-r border-b border-gray-200 dark:border-gray-700 rotate-45 -mt-1.5"
            />
          </div>
        </div>
      )}
    </div>
  );
};