import React, { useEffect, useMemo, useState } from 'react';
import { useDate } from '../context/DateContext';
import { useAuth } from '../context/AuthContext';
import { useServices } from '../hooks/useServices';
import { useWorkingDays } from '../hooks/useWorkingDays';
import { useStaffLeaveAndHolidays } from '../hooks/useStaffLeaveAndHolidays';
import { MyTrackerProgressTiles } from '../components/MyTrackerProgressTiles';
import { StaffPerformanceBar } from '../components/StaffPerformanceBar';
import { supabase } from '../supabase/client';
import { loadTargets } from '../utils/loadTargets';

interface DailyEntry {
  date: string;
  day: number;
  isWeekend: boolean;
  isOnLeave: boolean;
  isBankHoliday: boolean;
  bankHolidayTitle?: string;
  services: Record<string, number>;
}

interface DailyActivityRow {
  staff_id: number;
  service_id: number;
  delivered_count: number;
  day: number;
}

interface StaffPerformance {
  staff_id: number;
  name: string;
  total: number;
}

type LocalInputState = Record<string, string>;

export const StaffTracker: React.FC = () => {
  const { selectedMonth, selectedFinancialYear } = useDate();
  const { currentStaff, selectedStaffId, allStaff } = useAuth();
  const { services, loading: servicesLoading } = useServices();

  const isTeamSelected = selectedStaffId === 'team';

  const year =
    selectedMonth >= 4
      ? selectedFinancialYear.start
      : selectedFinancialYear.end;

  const { teamWorkingDays, workingDaysUpToToday, loading: workingDaysLoading } =
    useWorkingDays({
      financialYear: selectedFinancialYear,
      month: selectedMonth,
    });

  const {
    isDateOnLeave,
    isDateBankHoliday,
    loading: leaveHolidayLoading,
  } = useStaffLeaveAndHolidays({
    staffId: currentStaff?.staff_id ?? 0,
    month: selectedMonth,
    year,
    homeRegion: currentStaff?.home_region || 'england-and-wales',
  });

  const [dailyEntries, setDailyEntries] = useState<DailyEntry[]>([]);
  const [targets, setTargets] = useState<Record<string, number>>({});
  const [staffPerformance, setStaffPerformance] = useState<StaffPerformance[]>([]);
  const [localInputState, setLocalInputState] = useState<LocalInputState>({});
  const [loading, setLoading] = useState(true);

  const daysInMonth = new Date(year, selectedMonth, 0).getDate();

  const staffIds = isTeamSelected
    ? allStaff.map(s => s.staff_id)
    : currentStaff
    ? [currentStaff.staff_id]
    : [];

  const getDayName = (day: number) =>
    ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][
      new Date(year, selectedMonth - 1, day).getDay()
    ];

  const dayMeta = useMemo(() => {
    return Array.from({ length: daysInMonth }, (_, i) => {
      const day = i + 1;
      const date = `${year}-${String(selectedMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const bh = isDateBankHoliday(date);
      const dow = new Date(year, selectedMonth - 1, day).getDay();

      return {
        day,
        date,
        isWeekend: dow === 0 || dow === 6,
        isOnLeave: isDateOnLeave(date),
        isBankHoliday: !!bh,
        bankHolidayTitle: bh?.title,
      };
    });
  }, [daysInMonth, year, selectedMonth, isDateBankHoliday, isDateOnLeave]);

  const columnClass = (d: {
    isWeekend: boolean;
    isBankHoliday: boolean;
    isOnLeave: boolean;
  }) => {
    if (d.isBankHoliday) return 'bg-blue-100';
    if (d.isWeekend) return 'bg-blue-100';
    if (!isTeamSelected && d.isOnLeave) return 'bg-gray-100';
    return '';
  };

  const fetchData = async () => {
    if (services.length === 0 || staffIds.length === 0) {
      setLoading(false);
      return;
    }

    setLoading(true);

    /* ---------- BASE GRID ---------- */
    const baseEntries: DailyEntry[] = dayMeta.map(d => ({
      date: d.date,
      day: d.day,
      isWeekend: d.isWeekend,
      isOnLeave: d.isOnLeave,
      isBankHoliday: d.isBankHoliday,
      bankHolidayTitle: d.bankHolidayTitle,
      services: Object.fromEntries(
        services.map(s => [s.service_name, 0])
      ),
    }));

    /* ---------- DAILY ACTIVITY (SOURCE OF TRUTH) ---------- */
    const { data: activities } = await supabase
      .from('dailyactivity')
      .select('staff_id, service_id, delivered_count, day')
      .eq('month', selectedMonth)
      .eq('year', year)
      .in('staff_id', staffIds);

    activities?.forEach((a: DailyActivityRow) => {
      const service = services.find(s => s.service_id === a.service_id);
      const entry = baseEntries.find(e => e.day === a.day);
      if (service && entry) {
        entry.services[service.service_name] += a.delivered_count || 0;
      }
    });

    setDailyEntries(baseEntries);

    /* ---------- TARGETS ---------- */
    const targetTotals: Record<string, number> = {};
    services.forEach(s => (targetTotals[s.service_name] = 0));

    if (isTeamSelected) {
      for (const staff of allStaff) {
        const { perService } = await loadTargets(
          selectedMonth,
          selectedFinancialYear,
          staff.staff_id
        );
        services.forEach(s => {
          targetTotals[s.service_name] += perService?.[s.service_id] || 0;
        });
      }
    } else if (currentStaff) {
      const { perService } = await loadTargets(
        selectedMonth,
        selectedFinancialYear,
        currentStaff.staff_id
      );
      services.forEach(s => {
        targetTotals[s.service_name] = perService?.[s.service_id] || 0;
      });
    }

    setTargets(targetTotals);

    /* ---------- PERFORMANCE BAR (MATCH DASHBOARD) ---------- */
    const deliveredTotal =
      activities?.reduce(
        (
          sum: number,
          a: { delivered_count: number }
        ) => sum + (a.delivered_count || 0),
        0
      ) || 0;

    const performance: StaffPerformance[] = staffIds.map(id => {
      const staff =
        allStaff.find(s => s.staff_id === id) || currentStaff!;
      return {
        staff_id: staff.staff_id,
        name: staff.name,
        total: deliveredTotal,
      };
    });

    setStaffPerformance(performance);
    setLoading(false);
  };

  useEffect(() => {
    if (!servicesLoading && !leaveHolidayLoading) {
      fetchData();
    }
  }, [
    selectedMonth,
    selectedFinancialYear,
    selectedStaffId,
    servicesLoading,
    leaveHolidayLoading,
  ]);

  const serviceTotals = useMemo(() => {
    return Object.fromEntries(
      services.map(s => [
        s.service_name,
        dailyEntries.reduce(
          (sum: number, e) => sum + (e.services[s.service_name] || 0),
          0
        ),
      ])
    );
  }, [dailyEntries, services]);

  if (loading || servicesLoading || leaveHolidayLoading || workingDaysLoading) {
    return <div className="py-6 text-center text-gray-500">Loading tracker…</div>;
  }

  return (
    <div className="space-y-4">
      <h2 className="text-2xl lg:text-3xl font-bold">My Tracker</h2>

      <StaffPerformanceBar
        staffPerformance={staffPerformance}
        workingDays={teamWorkingDays}
        workingDaysUpToToday={workingDaysUpToToday}
      />

      <MyTrackerProgressTiles
        services={services}
        serviceTotals={serviceTotals}
        targets={targets}
        workingDays={teamWorkingDays}
        workingDaysUpToToday={workingDaysUpToToday}
      />

      {/* ================= TRACKER TABLE ================= */}
      <div className="bg-white shadow-md rounded-xl border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full table-fixed border-collapse">
            <thead>
              <tr className="bg-[#001B47]">
                <th className="sticky left-0 z-30 px-3 py-2 text-left text-xs font-bold text-white w-[240px]">
                  SERVICE
                </th>
                {dayMeta.map(d => (
                  <th key={d.day} className="px-2 py-2 text-xs font-bold text-white w-[72px]">
                    {d.day}
                  </th>
                ))}
                <th className="sticky right-0 z-30 px-2 py-2 text-xs font-bold text-white w-[110px]">
                  Total
                </th>
              </tr>

              <tr className="bg-gray-100">
                <th className="sticky left-0 z-20 px-3 py-2 text-xs font-semibold w-[240px]">
                  Day
                </th>
                {dayMeta.map(d => (
                  <th
                    key={`dow-${d.day}`}
                    className={`px-2 py-2 text-xs font-semibold w-[72px] ${columnClass(d)}`}
                  >
                    {getDayName(d.day)}
                  </th>
                ))}
                <th className="sticky right-0 z-20 px-2 py-2 text-xs font-semibold w-[110px]">
                  —
                </th>
              </tr>
            </thead>

            <tbody className="divide-y">
              {services.map((service, idx) => {
                const zebra = idx % 2 === 0 ? 'bg-white' : 'bg-gray-50';

                const rowTotal = dayMeta.reduce(
                  (sum: number, d) =>
                    sum +
                    (dailyEntries.find(e => e.day === d.day)
                      ?.services[service.service_name] || 0),
                  0
                );

                return (
                  <tr key={service.service_id} className={zebra}>
                    <td className={`sticky left-0 z-20 px-3 py-2 font-semibold whitespace-nowrap ${zebra}`}>
                      {service.service_name}
                    </td>

                    {dayMeta.map(d => {
                      const key = `${service.service_id}-${d.day}`;
                      const value =
                        localInputState[key] ??
                        dailyEntries.find(e => e.day === d.day)
                          ?.services[service.service_name] ??
                        0;

                      return (
                        <td
                          key={key}
                          className={`px-1 py-1 text-center ${columnClass(d)}`}
                        >
                          <input
                            type="number"
                            min={0}
                            disabled={isTeamSelected}
                            value={value}
                            onChange={e =>
                              setLocalInputState(prev => ({
                                ...prev,
                                [key]: e.target.value,
                              }))
                            }
                            className="w-full px-2 py-1 text-sm text-center rounded-md border"
                          />
                        </td>
                      );
                    })}

                    <td className={`sticky right-0 z-20 px-2 py-2 font-bold text-center ${zebra}`}>
                      {rowTotal}
                    </td>
                  </tr>
                );
              })}

              <tr className="bg-gray-200">
                <td className="sticky left-0 z-20 px-3 py-2 font-bold bg-gray-200">
                  Daily Total
                </td>

                {dayMeta.map(d => (
                  <td key={`total-${d.day}`} className="px-2 py-2 font-bold text-center bg-gray-200">
                    {services.reduce(
                      (sum: number, s) =>
                        sum +
                        (dailyEntries.find(e => e.day === d.day)
                          ?.services[s.service_name] || 0),
                      0
                    )}
                  </td>
                ))}

                <td className="sticky right-0 z-20 px-2 py-2 font-bold text-center bg-[#001B47] text-white">
                  {Object.values(serviceTotals).reduce(
                    (a: number, b: number) => a + b,
                    0
                  )}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
