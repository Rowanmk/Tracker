import React, { useState, useEffect, useMemo } from 'react';
import { loadTargets } from '../utils/loadTargets';
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
  const [serviceTargets, setServiceTargets] = useState<Record<number, number>>({});
  const [loading, setLoading] = useState(false);

  // Use a string of IDs to prevent the useEffect from re-running every frame during playback
  const staffIdsString = useMemo(() => 
    staffPerformance.map(s => s.staff_id).sort().join(','), 
  [staffPerformance]);

  useEffect(() => {
    const fetchServiceTargets = async () => {
      setLoading(true);
      try {
        const targetMap: Record<number, number> = {};
        const staffIds = staffIdsString ? staffIdsString.split(',').map(Number) : [];
        
        for (const staffId of staffIds) {
          const { perService } = await loadTargets(month, financialYear, staffId);
          Object.entries(perService).forEach(([serviceId, value]) => {
            const sid = parseInt(serviceId);
            targetMap[sid] = (targetMap[sid] || 0) + value;
          });
        }
        setServiceTargets(targetMap);
      } catch {
        setServiceTargets({});
      } finally {
        setLoading(false);
      }
    };

    if (staffIdsString) {
      fetchServiceTargets();
    }
  }, [month, financialYear, staffIdsString]);

  const getBarColor = (delivered: number, target: number) => {
    const expectedSoFar = workingDays > 0 ? (target / workingDays) * workingDaysUpToToday : 0;
    const difference = delivered - expectedSoFar;

    if (difference >= 0) {
      return '#008A00';
    } else if (difference >= -0.25 * expectedSoFar) {
      return '#FF8A2A';
    } else {
      return '#FF3B30';
    }
  };

  const getAheadBehindBadge = (delivered: number, target: number) => {
    const expectedSoFar = workingDays > 0 ? (target / workingDays) * workingDaysUpToToday : 0;
    const difference = delivered - expectedSoFar;

    if (Math.abs(difference) < 0.5) {
      return (
        <span className="inline-flex items-center px-2 py-1 rounded text-sm font-bold text-gray-600 transition-all duration-300 ease-in-out" style={{ color: '#6B7280' }}>
          0
        </span>
      );
    }

    if (difference > 0) {
      return (
        <span className="inline-flex items-center px-2 py-1 rounded text-sm font-bold transition-all duration-300 ease-in-out" style={{ color: '#008A00' }}>
          +{Math.round(difference)}
        </span>
      );
    }

    return (
      <span className="inline-flex items-center px-2 py-1 rounded text-sm font-bold transition-all duration-300 ease-in-out" style={{ color: '#FF3B30' }}>
        {Math.round(difference)}
      </span>
    );
  };

  const renderServiceRow = (serviceId: number, serviceName: string) => {
    const delivered = staffPerformance.reduce((sum, staff) => sum + (staff.services[serviceName] || 0), 0);
    const target = serviceTargets[serviceId] || 0;
    const percentage = target > 0 ? (delivered / target) * 100 : 0;
    const barColor = getBarColor(delivered, target);

    const todayExpectedPercentage = workingDays > 0 ? (workingDaysUpToToday / workingDays) * 100 : 0;

    return (
      <div key={serviceId} className="space-y-2 animate-fade-in">
        <div className="flex justify-between items-center">
          <span className="font-bold text-gray-900 dark:text-white transition-all duration-300 ease-in-out">{serviceName}</span>
          <div className="flex items-center space-x-2">
            <span className="font-bold text-gray-900 dark:text-white transition-all duration-300 ease-in-out">{Math.round(delivered)} / {Math.round(target)}</span>
            <span className="text-sm text-gray-600 dark:text-gray-400 transition-all duration-300 ease-in-out">({Math.round(percentage)}%)</span>
          </div>
        </div>

        <div className="relative flex items-center">
          <div className="flex-1 relative">
            <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-8 overflow-hidden shadow-inner">
              <div
                className="h-8 rounded-full transition-all duration-500 ease-in-out shadow-sm"
                style={{
                  width: `${Math.min(percentage, 100)}%`,
                  backgroundColor: barColor
                }}
                title={`${serviceName}: ${Math.round(delivered)}/${Math.round(target)} (${Math.round(percentage)}%)`}
              />
              <div
                className="absolute top-0 h-8 w-0.5 bg-[#001B47] transition-all duration-300 ease-in-out"
                style={{ left: `${Math.min(todayExpectedPercentage, 100)}%` }}
                title={`Expected by today: ${Math.round(todayExpectedPercentage)}%`}
              />
            </div>
          </div>
          <div className="ml-3 flex items-center" style={{ minWidth: '40px' }}>
            {getAheadBehindBadge(delivered, target)}
          </div>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md border border-gray-200 dark:border-gray-700 h-[380px] flex flex-col tile-brand transition-all duration-300 ease-in-out">
        <div className="tile-header px-4 py-1.5">
          Team Progress
        </div>
        <div className="flex-1 flex items-center justify-center text-gray-500">Loading…</div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md border border-gray-200 dark:border-gray-700 h-[380px] flex flex-col tile-brand transition-all duration-300 ease-in-out">
      <div className="tile-header px-4 py-1.5">
        Team Progress
      </div>

      <div className="flex-1 flex flex-col justify-end p-3 pb-2">
        <div className="space-y-4 flex-1 flex flex-col justify-center">
          {services.map(service => renderServiceRow(service.service_id, service.service_name))}
        </div>
      </div>
    </div>
  );
};