import React from 'react';

interface Props {
  services: { service_name: string }[];
  serviceTotals: Record<string, number>;
  targets: Record<string, number>;
  dashboardMode: 'team' | 'individual';
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
    const percentage = target > 0 ? (delivered / target) * 100 : 0;

    const expectedByNow =
      workingDays > 0 ? (target / workingDays) * workingDaysUpToToday : 0;

    const variance = delivered - expectedByNow;

    let statusText = 'On run rate';
    let statusColour = 'text-green-600';

    if (variance < -0.5) {
      statusText = `${Math.abs(Math.round(variance))} items behind run rate`;
      statusColour = 'text-red-600';
    } else if (variance > 0.5) {
      statusText = `${Math.round(variance)} items ahead of run rate`;
      statusColour = 'text-green-600';
    }

    const markerPosition =
      target > 0 ? Math.min((expectedByNow / target) * 100, 100) : 0;

    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 shadow-sm">
        <div className="flex justify-between items-center mb-2">
          <h3 className="font-semibold text-gray-900 dark:text-white">
            {label}
          </h3>
        </div>

        <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">
          Delivered vs Expected
        </div>

        <div className="flex justify-between items-center mb-2">
          <span className="font-bold text-gray-900 dark:text-white">
            {delivered} / {Math.round(target)}
          </span>
        </div>

        <div className="relative w-full h-3 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden mb-2">
          {/* Delivered bar */}
          <div
            className={`h-3 rounded-full ${
              percentage >= 100 ? 'bg-green-500' : 'bg-red-500'
            }`}
            style={{ width: `${Math.min(percentage, 100)}%` }}
          />

          {/* Run-rate marker */}
          <div
            className="absolute top-0 h-3 w-0.5 bg-[#001B47]"
            style={{ left: `${markerPosition}%` }}
          />
        </div>

        <div className={`text-sm font-medium ${statusColour}`}>
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
