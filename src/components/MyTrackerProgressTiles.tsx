import React from 'react';

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
  const getRunRateStatus = (delivered: number, expected: number) => {
    if (expected <= 0) {
      return {
        pct: 0,
        label: 'No Target',
        text: 'text-gray-500',
        bar: 'bg-gray-400',
      };
    }

    const pct = (delivered / expected) * 100;

    if (pct >= 90) {
      return { pct, label: 'On Track', text: 'text-green-600', bar: 'bg-green-500' };
    }
    if (pct >= 75) {
      return { pct, label: 'At Risk', text: 'text-orange-600', bar: 'bg-orange-500' };
    }
    return { pct, label: 'Behind Target', text: 'text-red-600', bar: 'bg-red-500' };
  };

  const renderTile = (label: string, delivered: number, target: number) => {
    const expectedSoFar =
      workingDays > 0 ? (target / workingDays) * workingDaysUpToToday : 0;

    const variance = Math.round(delivered - expectedSoFar);
    const status = getRunRateStatus(delivered, expectedSoFar);

    const progressPct = expectedSoFar > 0
      ? Math.min((delivered / expectedSoFar) * 100, 100)
      : 0;

    const targetMarkerPct = target > 0
      ? Math.min((expectedSoFar / target) * 100, 100)
      : 0;

    return (
      <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
        <div className="flex justify-between items-start mb-2">
          <h3 className="text-sm font-bold text-gray-900 dark:text-white">
            {label}
          </h3>
          <span className={`text-xs font-bold ${status.text}`}>
            {Math.round(status.pct)}%
          </span>
        </div>

        <div className="space-y-2 mb-3">
          <div className="flex justify-between text-xs">
            <span className="text-gray-600 dark:text-gray-400">
              Delivered vs Expected
            </span>
            <span className="font-bold text-gray-900 dark:text-white">
              {delivered} / {Math.round(expectedSoFar)}
            </span>
          </div>

          {/* Progress bar */}
          <div className="relative w-full bg-gray-200 dark:bg-gray-600 rounded-full h-2 overflow-hidden">
            {/* Actual progress */}
            <div
              className={`h-2 ${status.bar}`}
              style={{ width: `${progressPct}%` }}
            />

            {/* Target marker + variance */}
            {expectedSoFar > 0 && (
              <>
                <div
                  className="absolute top-0 bottom-0 w-[2px] bg-black"
                  style={{ left: `${targetMarkerPct}%` }}
                />
                <div
                  className={`absolute -top-5 text-xs font-bold ${
                    variance >= 0 ? 'text-green-600' : 'text-red-600'
                  }`}
                  style={{ left: `${targetMarkerPct}%`, transform: 'translateX(4px)' }}
                >
                  {variance >= 0 ? `+${variance}` : variance}
                </div>
              </>
            )}
          </div>
        </div>

        <div className={`text-xs font-semibold ${status.text}`}>
          {status.label}
        </div>
      </div>
    );
  };

  const overallTotal = Object.values(serviceTotals).reduce((sum, v) => sum + v, 0);
  const overallTarget = Object.values(targets).reduce((sum, v) => sum + v, 0);

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
