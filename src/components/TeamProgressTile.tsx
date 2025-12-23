import React, { useState, useEffect } from 'react';
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
  dashboardMode?: "team" | "individual";
  currentStaff?: { staff_id: number; name: string } | null;
  viewMode: 'percent' | 'numbers';
  workingDays: number;
  workingDaysUpToToday: number;
  month: number;
  financialYear: FinancialYear;
}

export const TeamProgressTile: React.FC<TeamProgressTileProps> = ({
  services,
  staffPerformance,
  dashboardMode = "team",
  currentStaff,
  viewMode,
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

  const totalDelivered = effectiveStaffPerformance.reduce((sum, s) => sum + s.total, 0);

  useEffect(() => {
    const fetchServiceTargets = async () => {
      setLoading(true);
      try {
        const targetMap: Record<number, number> = {};

        if (dashboardMode === "individual" && currentStaff) {
          // Individual View: load targets ONLY for currentStaff.staff_id
          const { perService } = await loadTargets(month, financialYear, currentStaff.staff_id);
          Object.entries(perService).forEach(([serviceId, value]) => {
            targetMap[parseInt(serviceId)] = value;
          });
        } else {
          // Team View: load targets for every staff member in staffPerformance
          // This ensures SA targets are properly calculated for each staff member
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

  const getBarColor = (delivered: number, target: number) => {
    const expectedSoFar = workingDays > 0 ? (target / workingDays) * workingDaysUpToToday : 0;
    const difference = delivered - expectedSoFar;

    if (difference >= 0) {
      return '#008A00'; // Green - ahead or on-track
    } else if (difference >= -0.25 * expectedSoFar) {
      return '#FF8A2A'; // Orange - slightly behind
    } else {
      return '#FF3B30'; // Red - significantly behind
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
    } else {
      return (
        <span className="inline-flex items-center px-2 py-1 rounded text-sm font-bold transition-all duration-300 ease-in-out" style={{ color: '#FF3B30' }}>
          {Math.round(difference)}
        </span>
      );
    }
  };

  const renderServiceRow = (serviceId: number, serviceName: string) => {
    const delivered = effectiveStaffPerformance.reduce((sum, staff) => sum + (staff.services[serviceName] || 0), 0);
    const target = serviceTargets[serviceId] || 0;
    const percentage = target > 0 ? (delivered / target) * 100 : 0;
    const barColor = getBarColor(delivered, target);

    // Calculate today's expected percentage for the marker
    const todayExpectedPercentage = workingDays > 0 ? (workingDaysUpToToday / workingDays) * 100 : 0;

    return (
      <div key={serviceId} className="space-y-3 animate-fade-in">
        <div className="flex justify-between items-center">
          <span className="font-bold text-gray-900 dark:text-white transition-all duration-300 ease-in-out">{serviceName}</span>
          <div className="flex items-center space-x-2">
            <span className="font-bold text-gray-900 dark:text-white transition-all duration-300 ease-in-out">{delivered} / {Math.round(target)}</span>
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
                title={`${serviceName}: ${delivered}/${Math.round(target)} (${Math.round(percentage)}%)`}
              />
              {/* Today Progress Marker */}
              <div
                className="absolute top-0 h-8 w-0.5 bg-[#001B47] transition-all duration-300 ease-in-out"
                style={{ left: `${Math.min(todayExpectedPercentage, 100)}%` }}
                title={`Expected by today: ${Math.round(todayExpectedPercentage)}%`}
              />
            </div>
          </div>
          {/* Ahead/Behind Badge positioned to the right of the today marker */}
          <div className="ml-3 flex items-center" style={{ minWidth: '40px' }}>
            {getAheadBehindBadge(delivered, target)}
          </div>
        </div>
      </div>
    );
  };

  const renderTotalRow = () => {
    const trueTotalTarget = Object.values(serviceTargets).reduce((s, v) => s + v, 0);
    const percentage = trueTotalTarget > 0 ? (totalDelivered / trueTotalTarget) * 100 : 0;
    const barColor = getBarColor(totalDelivered, trueTotalTarget);
    const totalLabel = dashboardMode === "team" ? "Team Total" : "My Total";

    // Calculate today's expected percentage for the marker
    const todayExpectedPercentage = workingDays > 0 ? (workingDaysUpToToday / workingDays) * 100 : 0;

    return (
      <div className="space-y-3 pt-6 border-t border-gray-200 dark:border-gray-600 animate-fade-in">
        <div className="flex justify-between items-center">
          <span className="font-bold text-lg text-gray-900 dark:text-white transition-all duration-300 ease-in-out">{totalLabel}</span>
          <div className="flex items-center space-x-3">
            <span className="font-bold text-lg text-gray-900 dark:text-white transition-all duration-300 ease-in-out">{totalDelivered} / {trueTotalTarget}</span>
            <span className="text-sm text-gray-600 dark:text-gray-400 transition-all duration-300 ease-in-out">({Math.round(percentage)}%)</span>
          </div>
        </div>
        
        <div className="relative flex items-center">
          <div className="flex-1 relative">
            <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-10 overflow-hidden shadow-inner">
              <div
                className="h-10 rounded-full transition-all duration-500 ease-in-out shadow-md"
                style={{ 
                  width: `${Math.min(percentage, 100)}%`,
                  backgroundColor: barColor
                }}
                title={`${totalLabel}: ${totalDelivered}/${trueTotalTarget} (${Math.round(percentage)}%)`}
              />
              {/* Today Progress Marker */}
              <div
                className="absolute top-0 h-10 w-0.5 bg-[#001B47] transition-all duration-300 ease-in-out"
                style={{ left: `${Math.min(todayExpectedPercentage, 100)}%` }}
                title={`Expected by today: ${Math.round(todayExpectedPercentage)}%`}
              />
            </div>
          </div>
          {/* Ahead/Behind Badge positioned to the right of the today marker */}
          <div className="ml-3 flex items-center" style={{ minWidth: '40px' }}>
            {getAheadBehindBadge(totalDelivered, trueTotalTarget)}
          </div>
        </div>
      </div>
    );
  };

  const progressTitle = dashboardMode === "team" ? "Team Progress" : `${currentStaff?.name || "My"} Progress`;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md border border-gray-200 dark:border-gray-700 h-[500px] flex flex-col tile-brand transition-all duration-300 ease-in-out">
      <div className="tile-header px-4 py-2">
        {progressTitle}
      </div>

      <div className="flex-1 flex flex-col justify-end p-4 pb-6">
        <div className="space-y-6 flex-1 flex flex-col justify-center">
          {services.map(service => renderServiceRow(service.service_id, service.service_name))}
          {renderTotalRow()}
        </div>
      </div>
    </div>
  );
};