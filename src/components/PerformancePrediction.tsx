import React from 'react';

    interface PerformancePredictionProps {
      currentDelivered: number;
      target: number;
      workingDays: number;
      workingDaysUpToToday: number;
      historicalAverage: number;
      staffName: string;
    }

    export const PerformancePrediction: React.FC<PerformancePredictionProps> = ({
      currentDelivered,
      target,
      workingDays,
      workingDaysUpToToday,
      historicalAverage,
      staffName,
    }) => {
      const daysPassed = Math.max(workingDaysUpToToday, 1);
      const totalWorkingDays = workingDays;
      
      const currentRunRate = currentDelivered / daysPassed;
      const projectedFromRunRate = Math.round(currentRunRate * totalWorkingDays);
      const projectedFromAverage = Math.round(historicalAverage);
      
      const projectedThisMonth = Math.round((projectedFromRunRate + projectedFromAverage) / 2);
      const gap = projectedThisMonth - target;
      const gapPercentage = target > 0 ? (gap / target) * 100 : 0;

      const getStatusColor = () => {
        if (gap >= 0) return 'text-green-600 dark:text-green-400';
        if (gapPercentage >= -10) return 'text-yellow-600 dark:text-yellow-400';
        return 'text-red-600 dark:text-red-400';
      };

      const getStatusBg = () => {
        if (gap >= 0) return 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800';
        if (gapPercentage >= -10) return 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800';
        return 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800';
      };

      const getStatusText = () => {
        if (gap >= 0) return 'On track / ahead';
        if (gapPercentage >= -10) return 'Slightly behind';
        return 'Significantly behind';
      };

      return (
        <div className={`p-4 rounded-lg border ${getStatusBg()}`}>
          <h4 className="text-lg font-medium text-gray-900 dark:text-white mb-3">{staffName} - Performance Prediction</h4>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-sm text-gray-600 dark:text-gray-400">Projected Month-End:</span>
              <span className="font-bold text-blue-600 dark:text-blue-400">{projectedThisMonth}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-600 dark:text-gray-400">Target:</span>
              <span className="font-bold text-gray-900 dark:text-white">{target}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-600 dark:text-gray-400">Gap:</span>
              <span className={`font-bold ${getStatusColor()}`}>
                {gap >= 0 ? '+' : ''}{gap}
              </span>
            </div>
            <div className="pt-2 border-t border-gray-200 dark:border-gray-600">
              <span className={`text-sm font-medium ${getStatusColor()}`}>
                Status: {getStatusText()}
              </span>
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              Based on current run rate ({Math.round(currentRunRate)}/day) and historical average ({Math.round(historicalAverage)}/month)
            </div>
          </div>
        </div>
      );
    };