import React, { useState } from 'react';

    interface ProgressChartProps {
      data: {
        name: string;
        actual: number;
        target: number;
        color: string;
      }[];
      workingDays: number;
      workingDaysUpToToday: number;
    }

    export const ProgressChart: React.FC<ProgressChartProps> = ({ data, workingDays, workingDaysUpToToday }) => {
      const [viewMode, setViewMode] = useState<'grouped' | 'stacked'>('grouped');
      const maxValue = Math.max(...data.map(d => Math.max(d.actual, d.target)));

      const getStatusColor = (delivered: number, target: number) => {
        if (delivered >= target) return 'text-green-600 dark:text-green-400';
        if (delivered >= target * 0.5) return 'text-yellow-600 dark:text-yellow-400';
        return 'text-red-600 dark:text-red-400';
      };

      const getBarColor = (delivered: number, target: number) => {
        if (delivered >= target) return 'bg-green-500 dark:bg-green-600';
        if (delivered >= target * 0.5) return 'bg-yellow-500 dark:bg-yellow-600';
        return 'bg-red-500 dark:bg-red-600';
      };

      const totalActual = data.reduce((sum, item) => sum + item.actual, 0);
      const totalTarget = data.reduce((sum, item) => sum + item.target, 0);
      const expectedSoFar = workingDays > 0 ? (totalTarget / workingDays) * workingDaysUpToToday : 0;
      const variance = totalActual - expectedSoFar;

      return (
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white">Team Progress (Actual vs Target)</h3>
            <div className="flex space-x-2">
              <button
                onClick={() => setViewMode('grouped')}
                className={viewMode === 'grouped' ? 'btn-primary' : 'btn-secondary'}
              >
                Grouped View
              </button>
              <button
                onClick={() => setViewMode('stacked')}
                className={viewMode === 'stacked' ? 'btn-primary' : 'btn-secondary'}
              >
                Stacked View
              </button>
            </div>
          </div>
          
          <div className="space-y-4">
            {data.map((item, index) => {
              const percentage = item.target > 0 ? (item.actual / item.target) * 100 : 0;
              const statusColor = getStatusColor(item.actual, item.target);
              const barColor = getBarColor(item.actual, item.target);
              const expectedForService = workingDays > 0 ? (item.target / workingDays) * workingDaysUpToToday : 0;
              
              return (
                <div key={index} className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="font-medium text-gray-900 dark:text-white">{item.name}</span>
                    <span className={statusColor}>
                      {item.actual} / {item.target} ({Math.round(percentage)}%)
                    </span>
                  </div>
                  
                  {viewMode === 'grouped' ? (
                    <div className="flex space-x-2">
                      <div className="flex-1 relative">
                        <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-4">
                          <div
                            className={`h-4 rounded-full ${barColor}`}
                            style={{ width: `${Math.min((item.actual / maxValue) * 100, 100)}%` }}
                            title={`Delivered: ${item.actual}`}
                          />
                        </div>
                        <span className="text-xs text-gray-600 dark:text-gray-400 mt-1 block">Delivered</span>
                      </div>
                      <div className="flex-1 relative">
                        <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-4">
                          <div
                            className="h-4 rounded-full bg-gray-400 dark:bg-gray-500"
                            style={{ width: `${Math.min((item.target / maxValue) * 100, 100)}%` }}
                            title={`Target: ${item.target}`}
                          />
                          <div
                            className="absolute top-0 h-4 border-r-2 border-orange-500"
                            style={{ left: `${Math.min((expectedForService / maxValue) * 100, 100)}%` }}
                            title={`Expected by now: ${Math.round(expectedForService)}`}
                          />
                        </div>
                        <span className="text-xs text-gray-600 dark:text-gray-400 mt-1 block">Target</span>
                      </div>
                    </div>
                  ) : (
                    <div className="relative">
                      <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-6">
                        <div
                          className={`h-6 rounded-full ${barColor}`}
                          style={{ width: `${Math.min((item.actual / item.target) * 100, 100)}%` }}
                          title={`${item.name}: ${item.actual}/${item.target} (${Math.round(percentage)}%)`}
                        />
                        <div
                          className="absolute top-0 h-6 border-r-2 border-orange-500"
                          style={{ left: `${Math.min((expectedForService / item.target) * 100, 100)}%` }}
                          title={`Expected by now: ${Math.round(expectedForService)}`}
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-600">
            <div className="text-sm text-gray-600 dark:text-gray-400">
              Team is {variance >= 0 ? 'ahead by' : 'behind by'} <span className={variance >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>{Math.abs(Math.round(variance))} items</span>
            </div>
          </div>
        </div>
      );
    };