import React from 'react';

    interface RunRateChartProps {
      workingDays: number;
      workingDaysUpToToday: number;
      actualTotal: number;
      targetTotal: number;
    }

    export const RunRateChart: React.FC<RunRateChartProps> = ({
      workingDays,
      workingDaysUpToToday,
      actualTotal,
      targetTotal,
    }) => {
      const dailyTarget = workingDays > 0 ? targetTotal / workingDays : 0;
      const cumulativeTarget = dailyTarget * workingDaysUpToToday;
      const variance = actualTotal - cumulativeTarget;
      const displayWorkingDaysUpToToday = Math.min(workingDaysUpToToday, workingDays);

      const progressPercentage = cumulativeTarget > 0 ? (actualTotal / cumulativeTarget) * 100 : 0;
      
      const getGaugeColor = () => {
        if (progressPercentage >= 100) return '#10B981';
        if (progressPercentage >= 80) return '#F59E0B';
        return '#EF4444';
      };

      const getGaugeColorClass = () => {
        if (progressPercentage >= 100) return 'text-green-600 dark:text-green-400';
        if (progressPercentage >= 80) return 'text-yellow-600 dark:text-yellow-400';
        return 'text-red-600 dark:text-red-400';
      };

      const needleAngle = Math.min(progressPercentage, 100) * 1.8 - 90;

      return (
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Run Rate Analysis</h3>
          
          <div className="flex flex-col items-center mb-4">
            <div className="relative w-32 h-16 mb-2">
              <svg viewBox="0 0 200 100" className="w-full h-full">
                <path
                  d="M 20 80 A 80 80 0 0 1 180 80"
                  fill="none"
                  stroke="#E5E7EB"
                  strokeWidth="12"
                  className="dark:stroke-gray-600"
                />
                <path
                  d="M 20 80 A 80 80 0 0 1 180 80"
                  fill="none"
                  stroke={getGaugeColor()}
                  strokeWidth="12"
                  strokeDasharray={`${(progressPercentage / 100) * 251.3} 251.3`}
                  strokeLinecap="round"
                />
                <line
                  x1="100"
                  y1="80"
                  x2={100 + 60 * Math.cos((needleAngle * Math.PI) / 180)}
                  y2={80 + 60 * Math.sin((needleAngle * Math.PI) / 180)}
                  stroke="#374151"
                  strokeWidth="3"
                  strokeLinecap="round"
                  className="dark:stroke-gray-300"
                />
                <circle cx="100" cy="80" r="4" fill="#374151" className="dark:fill-gray-300" />
              </svg>
            </div>
            <div className={`text-2xl font-bold ${getGaugeColorClass()}`}>
              {Math.round(progressPercentage)}%
            </div>
            <div className="text-sm text-gray-500 dark:text-gray-400">On Track</div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{actualTotal}</div>
              <div className="text-sm text-gray-500 dark:text-gray-400">Actual Total</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-600 dark:text-gray-400">{Math.round(cumulativeTarget)}</div>
              <div className="text-sm text-gray-500 dark:text-gray-400">Expected by Now</div>
            </div>
            <div className="text-center">
              <div className={`text-2xl font-bold ${variance >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                {variance >= 0 ? '+' : ''}{Math.round(variance)}
              </div>
              <div className="text-sm text-gray-500 dark:text-gray-400">Variance</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">{displayWorkingDaysUpToToday}/{workingDays}</div>
              <div className="text-sm text-gray-500 dark:text-gray-400">Working Days</div>
            </div>
          </div>
        </div>
      );
    };