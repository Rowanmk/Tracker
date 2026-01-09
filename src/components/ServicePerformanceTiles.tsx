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
          Object.entries(perService).forEach(([sid, val]) => {
            targetMap[Number(sid)] = val;
          });
        } else {
          for (const staff of effectiveStaffPerformance) {
            const { perService } = await loadTargets(month, financialYear, staff.staff_id);
            Object.entries(perService).forEach(([sid, val]) => {
              const id = Number(sid);
              targetMap[id] = (targetMap[id] || 0) + val;
            });
          }
        }

        setServiceTargets(targetMap);
      } catch {
        setServiceTargets({});
      } finally {
        setLoading(false);
      }
    };

    if (effectiveStaffPerformance.length) fetchServiceTargets();
  }, [dashboardMode, currentStaff?.staff_id, month, financialYear, effectiveStaffPerformance.length]);

  const getStatus = (delivered: number, expected: number) => {
    if (expected <= 0) {
      return { pct: 0, bg: 'bg-gray-100', text: 'text-gray-600', bar: 'bg-gray-400' };
    }

    const pct = (delivered / expected) * 100;

    if (pct >= 90) return { pct, bg: 'bg-green-100', text: 'text-green-700', bar: 'bg-green-500' };
    if (pct >= 75) return { pct, bg: 'bg-orange-100', text: 'text-orange-700', bar: 'bg-orange-500' };
    return { pct, bg: 'bg-red-100', text: 'text-red-700', bar: 'bg-red-500' };
  };

  if (loading) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
      {services.map(service => {
        const delivered = effectiveStaffPerformance.reduce(
          (sum, s) => sum + (s.services[service.service_name] || 0),
          0
        );

        const target = serviceTargets[service.service_id] || 0;
        const expectedSoFar =
          workingDays > 0 ? (target / workingDays) * workingDaysUpToToday : 0;

        const variance = Math.round(delivered - expectedSoFar);
        const status = getStatus(delivered, expectedSoFar);

        return (
          <div
            key={service.service_id}
            className={`p-4 rounded-lg border shadow-sm ${status.bg}`}
          >
            <div className="flex justify-between mb-2">
              <h3 className="text-sm font-bold">{service.service_name}</h3>
              <span className={`text-xs font-bold ${status.text}`}>
                {Math.round(status.pct)}%
              </span>
            </div>

            <div className="text-sm space-y-1 mb-3">
              <div className="flex justify-between"><span>Delivered</span><span className="font-bold">{delivered}</span></div>
              <div className="flex justify-between"><span>Target</span><span className="font-bold">{target}</span></div>
              <div className="flex justify-between"><span>Expected</span><span className="font-bold">{Math.round(expectedSoFar)}</span></div>
            </div>

            {/* Progress bar */}
            <div className="relative w-full h-2 bg-gray-300 rounded overflow-hidden">
              {/* Actual progress */}
              <div
                className={`h-full ${status.bar}`}
                style={{ width: `${Math.min(status.pct, 100)}%` }}
              />

              {/* Target marker */}
              {expectedSoFar > 0 && (
                <>
                  <div
                    className="absolute top-0 bottom-0 w-[2px] bg-black"
                    style={{ left: '100%' }}
                  />
                  <div
                    className={`absolute -top-5 text-xs font-bold ${
                      variance >= 0 ? 'text-green-700' : 'text-red-700'
                    }`}
                    style={{ left: '100%', transform: 'translateX(4px)' }}
                  >
                    {variance >= 0 ? `+${variance}` : variance}
                  </div>
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
