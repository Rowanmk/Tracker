import React from 'react';

interface Props {
  services: { service_name: string }[];
  serviceTotals: Record<string, number>;
  targets: Record<string, number>;
  workingDays: number;
  workingDaysUpToToday: number;
}

export const MyTrackerProgressTiles: React.FC<Props> = ({
  services,
  serviceTotals,
  targets,
  workingDays,
  workingDaysUpToToday,
}) => {
  const renderTile = (label: string, delivered: number, target: number) => {
    const expectedByNow =
      workingDays > 0
        ? (target / workingDays) * workingDaysUpToToday
        : 0;

    const variance = delivered - expectedByNow;

    let statusText = 'On run rate';
    let statusClass = 'text-green-600';

    if (variance < -0.5) {
      statusText = `${Math.abs(Math.round(variance))} items behind run rate`;
      statusClass = 'text-red-600';
    } else if (variance > 0.5) {
      statusText = `${Math.round(variance)} items ahead of run rate`;
      statusClass = 'text-green-600';
    }

    const deliveredPercent =
      target > 0 ? Math.min((delivered / target) * 100, 100) : 0;

    const runRateMarkerPercent =
      target > 0
        ? Math.min((expectedByNow / target) * 100, 100)
        : 0;

    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 shadow-sm">
        <h3 className="font-semibold text-gray-900 dark:text-white mb-1">
          {label}
        </h3>

        <div className="font-bold text-gray-900 dark:text-white mb-2">
          {delivered} / {Math.round(target)}
        </div>

        <div className="relative w-full h-3 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden mb-2">
          {/* Delivered bar */}
          <div
            className={`h-3 rounded-full ${
              delivered >= expectedByNow ? 'bg-green-500' : 'bg-red-500'
            }`}
            style={{ width: `${deliveredPercent}%` }}
          />

          {/* Run-rate marker */}
          <div
            className="absolute top-0 h-3 w-0.5 bg-[#001B47]"
            style={{ left: `${runRateMarkerPercent}%` }}
          />
        </div>

        <div className={`text-sm font-medium ${statusClass}`}>
          {statusText}
        </div>
      </div>
    );
  };

  const tiles = services.map(s =>
    renderTile(
      s.service_name,
      serviceTotals[s.service_name] || 0,
      targets[s.service_name] || 0
    )
  );

  const totalDelivered = Object.values(serviceTotals).reduce(
    (a, b) => a + b,
    0
  );
  const totalTarget = Object.values(targets).reduce((a, b) => a + b, 0);

  tiles.push(renderTile('Total', totalDelivered, totalTarget));

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {tiles}
    </div>
  );
};
