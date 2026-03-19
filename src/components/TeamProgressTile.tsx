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

export const TeamProgressTile: React.FC<TeamProgressTileProps> = ({
  services,
  staffPerformance,
  workingDays,
  workingDaysUpToToday,
  month,
  financialYear,
}) => {
  const { selectedTeamId } = useAuth();
  const [serviceTargets, setServiceTargets] = useState<Record<number, number>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchServiceTargets = async () => {
      setLoading(true);
      try {
        const targetMap: Record<number, number> = {};

        if (selectedTeamId === 'team-view' || selectedTeamId === 'all' || !selectedTeamId) {
          for (const staffMember of staffPerformance) {
            const { perService } = await loadTargets(month, financialYear, staffMember.staff_id);
            Object.entries(perService).forEach(([serviceId, value]) => {
              const sid = parseInt(serviceId, 10);
              targetMap[sid] = (targetMap[sid] || 0) + value;
            });
          }
        } else {
          const selectedStaffId = Number(selectedTeamId);
          if (!Number.isNaN(selectedStaffId)) {
            const { perService } = await loadTargets(month, financialYear, selectedStaffId);
            Object.entries(perService).forEach(([serviceId, value]) => {
              const sid = parseInt(serviceId, 10);
              targetMap[sid] = value;
            });
          }
        }

        setServiceTargets(targetMap);
      } catch {
        setServiceTargets({});
      } finally {
        setLoading(false);
      }
    };

    void fetchServiceTargets();
  }, [month, financialYear, selectedTeamId, staffPerformance]);

  const todayExpectedPercentage = useMemo(
    () => (workingDays > 0 ? (workingDaysUpToToday / workingDays) * 100 : 0),
    [workingDays, workingDaysUpToToday]
  );

  const getBarColor = (delivered: number, target: number) => {
    const expectedSoFar = workingDays > 0 ? (target / workingDays) * workingDaysUpToToday : 0;
    const difference = delivered - expectedSoFar;
    const twentyFivePercent = target * 0.25;

    if (difference >= 0) {
      return '#008A00';
    }
    if (difference >= -twentyFivePercent) {
      return '#FF8A2A';
    }
    return '#FF3B30';
  };

  const rows = useMemo(() => {
    return services.map((service) => {
      const delivered = staffPerformance.reduce((sum, staff) => sum + (staff.services[service.service_name] || 0), 0);
      const target = serviceTargets[service.service_id] || 0;
      const percentage = target > 0 ? (delivered / target) * 100 : 0;
      const barColor = getBarColor(delivered, target);
      const expectedSoFar = workingDays > 0 ? (target / workingDays) * workingDaysUpToToday : 0;
      const difference = delivered - expectedSoFar;
      const twentyFivePercent = target * 0.25;

      let badgeColor = '#FF3B30';
      if (difference >= 0) {
        badgeColor = '#008A00';
      } else if (difference >= -twentyFivePercent) {
        badgeColor = '#FF8A2A';
      }

      return {
        ...service,
        delivered,
        target,
        percentage,
        barColor,
        difference,
        badgeColor,
      };
    });
  }, [services, staffPerformance, serviceTargets, workingDays, workingDaysUpToToday]);

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
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md border border-gray-200 dark:border-gray-700 h-[418px] flex flex-col tile-brand transition-all duration-300 ease-in-out">
      <div className="tile-header px-4 py-1.5">
        Accountant Progress
      </div>

      <div className="flex-1 flex flex-col justify-end p-3 pb-2">
        <div className="space-y-4 flex-1 flex flex-col justify-center">
          {rows.map((row) => {
            const roundedDifference = Math.round(row.difference);

            return (
              <div key={row.service_id} className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-gray-900 dark:text-white">{row.service_name}</span>
                  <div className="flex items-center space-x-2">
                    <span className="font-bold text-gray-900 dark:text-white">
                      {Math.round(row.delivered)} / {Math.round(row.target)}
                    </span>
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      ({Math.round(row.percentage)}%)
                    </span>
                  </div>
                </div>

                <div className="relative flex items-center">
                  <div className="flex-1 relative">
                    <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-8 overflow-hidden shadow-inner">
                      <div
                        className="h-8 rounded-full shadow-sm"
                        style={{
                          width: `${Math.min(row.percentage, 100)}%`,
                          backgroundColor: row.barColor,
                        }}
                        title={`${row.service_name}: ${Math.round(row.delivered)}/${Math.round(row.target)} (${Math.round(row.percentage)}%)`}
                      />
                      {row.target > 0 && (
                        <div
                          className="absolute top-0 h-8 w-0.5 bg-[#001B47]"
                          style={{ left: `${Math.min(todayExpectedPercentage, 100)}%` }}
                          title={`Expected by today: ${Math.round(todayExpectedPercentage)}%`}
                        />
                      )}
                    </div>
                  </div>
                  <div className="ml-3 flex items-center" style={{ minWidth: '40px' }}>
                    <span
                      className="inline-flex items-center px-2 py-1 rounded text-sm font-bold"
                      style={{ color: Math.abs(row.difference) < 0.5 ? '#6B7280' : row.badgeColor }}
                    >
                      {roundedDifference > 0 ? `+${roundedDifference}` : roundedDifference}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};