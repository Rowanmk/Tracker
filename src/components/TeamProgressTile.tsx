import React, { useEffect, useMemo, useState } from 'react';
import { loadTargets } from '../utils/loadTargets';
import { useAuth } from '../context/AuthContext';
import type { FinancialYear } from '../utils/financialYear';

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

const getRunRateBarColor = (achievedPercent: number, elapsedWorkingDayPercent: number) => {
  if (elapsedWorkingDayPercent <= 0) return '#008A00';

  const paceRatio = (achievedPercent / elapsedWorkingDayPercent) * 100;

  if (paceRatio >= 100) return '#008A00';
  if (paceRatio >= 80) return '#FF8A2A';
  return '#FF3B30';
};

export const TeamProgressTile: React.FC<TeamProgressTileProps> = ({
  staffPerformance,
  workingDays,
  workingDaysUpToToday,
  month,
  financialYear,
}) => {
  const { selectedTeamId } = useAuth();
  const [selectedTarget, setSelectedTarget] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchSelectedTarget = async () => {
      setLoading(true);
      try {
        let totalTarget = 0;

        if (selectedTeamId === 'team-view' || selectedTeamId === 'all' || !selectedTeamId) {
          for (const staffMember of staffPerformance) {
            const { totalTarget: staffTarget } = await loadTargets(month, financialYear, staffMember.staff_id);
            totalTarget += staffTarget;
          }
        } else {
          const selectedStaffId = Number(selectedTeamId);
          if (!Number.isNaN(selectedStaffId)) {
            const { totalTarget: staffTarget } = await loadTargets(month, financialYear, selectedStaffId);
            totalTarget = staffTarget;
          }
        }

        setSelectedTarget(totalTarget);
      } catch {
        setSelectedTarget(0);
      } finally {
        setLoading(false);
      }
    };

    void fetchSelectedTarget();
  }, [month, financialYear, selectedTeamId, staffPerformance]);

  const todayExpectedPercentage = useMemo(
    () => (workingDays > 0 ? (workingDaysUpToToday / workingDays) * 100 : 0),
    [workingDays, workingDaysUpToToday]
  );

  const summaryRow = useMemo(() => {
    const delivered = staffPerformance.reduce((sum, staff) => sum + staff.total, 0);
    const target = selectedTarget;
    const achievedPercent = target > 0 ? (delivered / target) * 100 : 0;
    const barColor = getRunRateBarColor(achievedPercent, todayExpectedPercentage);
    const expectedSoFar = workingDays > 0 ? (target / workingDays) * workingDaysUpToToday : 0;
    const difference = delivered - expectedSoFar;

    return {
      delivered,
      target,
      achievedPercent,
      barColor,
      difference,
    };
  }, [staffPerformance, selectedTarget, todayExpectedPercentage, workingDays, workingDaysUpToToday]);

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

  const roundedDifference = Math.round(summaryRow.difference * 10) / 10;
  const formattedDifference =
    roundedDifference > 0 ? `+${roundedDifference}` : `${roundedDifference}`;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md border border-gray-200 dark:border-gray-700 h-[418px] flex flex-col tile-brand transition-all duration-300 ease-in-out">
      <div className="tile-header px-4 py-1.5">
        Accountant Progress
      </div>

      <div className="flex-1 flex flex-col justify-center p-6">
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <span className="font-bold text-gray-900 dark:text-white">Accounts</span>
            <div className="flex items-center space-x-2">
              <span className="font-bold text-gray-900 dark:text-white">
                {Math.round(summaryRow.delivered * 10) / 10} / {Math.round(summaryRow.target * 10) / 10}
              </span>
              <span className="text-sm text-gray-600 dark:text-gray-400">
                ({Math.round(summaryRow.achievedPercent)}%)
              </span>
            </div>
          </div>

          <div className="relative flex items-center">
            <div className="flex-1 relative">
              <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-8 overflow-hidden shadow-inner">
                <div
                  className="h-8 rounded-full shadow-sm transition-[width] duration-[800ms] ease-in-out"
                  style={{
                    width: `${Math.min(summaryRow.achievedPercent, 100)}%`,
                    backgroundColor: summaryRow.barColor,
                  }}
                  title={`Accounts: ${Math.round(summaryRow.delivered * 10) / 10}/${Math.round(summaryRow.target * 10) / 10} (${Math.round(summaryRow.achievedPercent)}%)`}
                />
                {summaryRow.target > 0 && (
                  <div
                    className="absolute top-0 h-8 w-0.5 bg-[#001B47] transition-[left] duration-[800ms] ease-in-out"
                    style={{ left: `${Math.min(todayExpectedPercentage, 100)}%` }}
                    title={`Expected by today: ${Math.round(((summaryRow.target / Math.max(workingDays, 1)) * workingDaysUpToToday) * 10) / 10}`}
                  />
                )}
              </div>
            </div>
            <div className="ml-3 flex items-center" style={{ minWidth: '52px' }}>
              <span
                className="inline-flex items-center px-2 py-1 rounded text-sm font-bold"
                style={{
                  color:
                    roundedDifference > 0
                      ? '#008A00'
                      : roundedDifference < 0
                      ? '#FF3B30'
                      : '#6B7280',
                }}
              >
                {formattedDifference}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};