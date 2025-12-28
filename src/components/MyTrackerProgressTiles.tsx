import React from 'react';
import type { FinancialYear } from '../utils/financialYear';

interface MyTrackerProgressTilesProps {
  services: Array<{
    service_id: number;
    service_name: string;
  }>;
  serviceTotals: { [key: string]: number };
  targets: { [key: string]: number };
  dashboardMode?: "team" | "individual";
  workingDays: number;
  workingDaysUpToToday: number;
}

export const MyTrackerProgressTiles: React.FC<MyTrackerProgressTilesProps> = ({
  services,
  serviceTotals,
  targets,
  dashboardMode = "team",
  workingDays,
  workingDaysUpToToday,
}) => {
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

  // Calculate totals from passed-in serviceTotals (source of truth from grid)
  const overallTotal = Object.values(serviceTotals).reduce((sum, val) => sum + val, 0);
  const overallTarget = Object.values(targets).reduce((sum, val) => sum + val, 0);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
      {services.map(service => (
        <div key={service.service_id}>
          {renderTile(
            service.service_name,
            serviceTotals[service.service_name] || 0,
            targets[service.service_name] || 0
          )}
        </div>
      ))}
      <div>
        {renderTile('Total', overallTotal, overallTarget)}
      </div>
    </div>
  );
};