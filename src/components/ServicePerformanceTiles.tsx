import React, { useState, useEffect } from 'react';
import { loadTargets } from '../utils/loadTargets';
import type { FinancialYear } from '../utils/financialYear';

interface ServicePerformanceTilesProps {
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

export const ServicePerformanceTiles: React.FC<ServicePerformanceTilesProps> = ({
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

  const getServiceColor = (delivered: number, target: number) => {
    if (target === 0) return 'bg-gray-100 dark:bg-gray-700';
    const percentage = (delivered / target) * 100;
    if (percentage >= 100) return 'bg-green-100 dark:bg-green-900/30';
    if (percentage >= 75) return 'bg-yellow-100 dark:bg-yellow-900/30';
    return 'bg-red-100 dark:bg-red-900/30';
  };

  const getServiceTextColor = (delivered: number, target: number) => {
    if (target === 0) return 'text-gray-700 dark:text-gray-300';
    const percentage = (delivered / target) * 100;
    if (percentage >= 100) return 'text-green-700 dark:text-green-300';
    if (percentage >= 75) return 'text-yellow-700 dark:text-yellow-300';
    return 'text-red-700 dark:text-red-300';
  };

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {services.map(service => (
          <div key={service.service_id} className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 animate-pulse">
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mb-2"></div>
            <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
      {services.map(service => {
        const delivered = effectiveStaffPerformance.reduce(
          (sum, staff) => sum + (staff.services[service.service_name] || 0),
          0
        );
        const target = serviceTargets[service.service_id] || 0;
        const percentage = target > 0 ? (delivered / target) * 100 : 0;
        const expectedSoFar = workingDays > 0 ? (target / workingDays) * workingDaysUpToToday : 0;
        const variance = delivered - expectedSoFar;

        return (
          <div
            key={service.service_id}
            className={`p-4 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 transition-all duration-300 ease-in-out ${getServiceColor(delivered, target)}`}
          >
            <div className="flex justify-between items-start mb-3">
              <h3 className="text-sm font-bold text-gray-900 dark:text-white">
                {service.service_name}
              </h3>
              <span className={`text-xs font-bold px-2 py-1 rounded ${getServiceTextColor(delivered, target)}`}>
                {Math.round(percentage)}%
              </span>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-700 dark:text-gray-300">Delivered:</span>
                <span className="font-bold text-gray-900 dark:text-white">{delivered}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-700 dark:text-gray-300">Target:</span>
                <span className="font-bold text-gray-900 dark:text-white">{target}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-700 dark:text-gray-300">Expected:</span>
                <span className="font-bold text-gray-900 dark:text-white">{Math.round(expectedSoFar)}</span>
              </div>

              <div className="pt-2 border-t border-gray-300 dark:border-gray-600">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-700 dark:text-gray-300">Variance:</span>
                  <span className={`font-bold ${variance >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                    {variance >= 0 ? '+' : ''}{Math.round(variance)}
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-3 w-full bg-gray-300 dark:bg-gray-600 rounded-full h-2 overflow-hidden">
              <div
                className={`h-full transition-all duration-300 ease-in-out ${
                  percentage >= 100 ? 'bg-green-500' :
                  percentage >= 75 ? 'bg-yellow-500' :
                  'bg-red-500'
                }`}
                style={{ width: `${Math.min(percentage, 100)}%` }}
              ></div>
            </div>
          </div>
        );
      })}
    </div>
  );
};