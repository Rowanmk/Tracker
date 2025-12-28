import React, { useState, useEffect } from 'react';
import { loadTargets } from '../utils/loadTargets';
import type { FinancialYear } from '../utils/financialYear';

interface MyTrackerProgressTilesProps {
  services: Array<{
    service_id: number;
    service_name: string;
  }>;
  staffPerformance: Array<{
    staff_id: number;
    name: string;
    services: { [key: string]: number };
    total: number;
  }>;
  dashboardMode?: "team" | "individual";
  currentStaff?: { staff_id: number; name: string } | null;
  workingDays: number;
  workingDaysUpToToday: number;
  month: number;
  financialYear: FinancialYear;
}

export const MyTrackerProgressTiles: React.FC<MyTrackerProgressTilesProps> = ({
  services,
  staffPerformance,
  dashboardMode = "team",
  currentStaff,
  workingDays,
  workingDaysUpToToday,
  month,
  financialYear,
}) => {
  const [serviceTargets, setServiceTargets] = useState<Record<number, number>>({});
  const [loading, setLoading] = useState(false);

  const effectiveStaffPerformance =
    dashboardMode === "individual" && currentStaff
      ? staffPerformance.filter(s => s.staff_id === currentStaff.staff_id)
      : staffPerformance;

  useEffect(() => {
    const fetchServiceTargets = async () => {
      setLoading(true);
      try {
        const targetMap: Record<number, number> = {};

        if (dashboardMode === "individual" && currentStaff) {
          const { perService } = await loadTargets(month, financialYear, currentStaff.staff_id);
          Object.entries(perService).forEach(([serviceId, value]) => {
            targetMap[parseInt(serviceId)] = value;
          });
        } else {
          for (const staff of effectiveStaffPerformance) {
            const { perService } = await loadTargets(month, financialYear, staff.staff_id);
            Object.entries(perService).forEach(([serviceId, value]) => {
              const sid = parseInt(serviceId);
              targetMap[sid] = (targetMap[sid] || 0) + value;
            });
          }
        }

        setServiceTargets(targetMap);
      } catch (error) {
        console.error('Error fetching service targets:', error);
        setServiceTargets({});
      } finally {
        setLoading(false);
      }
    };

    if (effectiveStaffPerformance.length > 0) {
      fetchServiceTargets();
    }
  }, [dashboardMode, currentStaff?.staff_id, month, financialYear, effectiveStaffPerformance.length]);

  const getStatusBadge = (delivered: number, target: number) => {
    if (target === 0) return { text: 'No Target', color: 'text-gray-600 dark:text-gray-400' };
    const expectedSoFar = workingDays > 0 ? (target / workingDays) * workingDaysUpToToday : 0;
    const difference = delivered - expectedSoFar;

    if (Math.abs(difference) < 0.5) {
      return { text: 'On Track', color: 'text-blue-600 dark:text-blue-400' };
    }
    if (difference >= 0) {
      return { text: 'Ahead', color: 'text-green-600 dark:text-green-400' };
    }
    return { text: 'Behind Target', color: 'text-orange-600 dark:text-orange-400' };
  };

  const getProgressBarColor = (delivered: number, target: number) => {
    if (target === 0) return 'bg-gray-400 dark:bg-gray-600';
    const percentage = (delivered / target) * 100;
    if (percentage >= 100) return 'bg-green-500 dark:bg-green-600';
    if (percentage >= 75) return 'bg-yellow-500 dark:bg-yellow-600';
    return 'bg-red-500 dark:bg-red-600';
  };

  const renderTile = (label: string, delivered: number, target: number) => {
    const percentage = target > 0 ? (delivered / target) * 100 : 0;
    const status = getStatusBadge(delivered, target);
    const barColor = getProgressBarColor(delivered, target);

    return (
      <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 transition-all duration-300 ease-in-out">
        <div className="flex justify-between items-start mb-2">
          <h3 className="text-sm font-bold text-gray-900 dark:text-white">{label}</h3>
          <span className={`text-xs font-bold ${status.color}`}>{Math.round(percentage)}%</span>
        </div>

        <div className="space-y-2 mb-3">
          <div className="flex justify-between text-xs">
            <span className="text-gray-600 dark:text-gray-400">Delivered vs Target</span>
            <span className="font-bold text-gray-900 dark:text-white">{delivered} / {target}</span>
          </div>

          <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-2 overflow-hidden">
            <div
              className={`h-2 rounded-full transition-all duration-300 ease-in-out ${barColor}`}
              style={{ width: `${Math.min(percentage, 100)}%` }}
            ></div>
          </div>
        </div>

        <div className={`text-xs font-semibold ${status.color}`}>
          {status.text}
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 animate-pulse">
            <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mb-2"></div>
            <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded w-full mb-2"></div>
            <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
          </div>
        ))}
      </div>
    );
  }

  // Calculate totals for each service
  const serviceTotals: Record<string, number> = {};
  services.forEach(service => {
    serviceTotals[service.service_name] = effectiveStaffPerformance.reduce(
      (sum, staff) => sum + (staff.services[service.service_name] || 0),
      0
    );
  });

  const overallTotal = Object.values(serviceTotals).reduce((sum, val) => sum + val, 0);
  const overallTarget = Object.values(serviceTargets).reduce((sum, val) => sum + val, 0);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
      {services.map(service => (
        <div key={service.service_id}>
          {renderTile(
            service.service_name,
            serviceTotals[service.service_name] || 0,
            serviceTargets[service.service_id] || 0
          )}
        </div>
      ))}
      <div>
        {renderTile('Total', overallTotal, overallTarget)}
      </div>
    </div>
  );
};