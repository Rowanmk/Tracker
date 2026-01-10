import React, { useEffect, useMemo, useState } from 'react';
import { useDate } from '../context/DateContext';
import { useAuth } from '../context/AuthContext';
import { useServices } from '../hooks/useServices';
import { useWorkingDays } from '../hooks/useWorkingDays';
import { useStaffLeaveAndHolidays } from '../hooks/useStaffLeaveAndHolidays';
import { MyTrackerProgressTiles } from '../components/MyTrackerProgressTiles';
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
  day: number;
  service_id: number;
  delivered_count: number;
  staff_id: number;
}

type LocalInputState = Record<string, string>;

export const StaffTracker: React.FC = () => {
  const { selectedMonth, selectedFinancialYear } = useDate();
  const { currentStaff, selectedStaffId, allStaff } = useAuth();
  const { services, loading: servicesLoading, error: servicesError } = useServices();

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
  const [loading, setLoading] = useState(true);
  const [localInputState, setLocalInputState] = useState<LocalInputState>({});

  const daysInMonth = new Date(year, selectedMonth, 0).getDate();

  const getDayName = (day: number) =>
    ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][
      new Date(year, selectedMonth - 1, day).getDay()
    ];

  const dateString = (day: number) =>
    `${year}-${String(selectedMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  const dayMeta = useMemo(() => {
    return Array.from({ length: daysInMonth }, (_, i) => {
      const day = i + 1;
      const date = dateString(day);
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

  const staffIds = isTeamSelected
    ? allStaff.map(s => s.staff_id)
    : currentStaff
      ? [currentStaff.staff_id]
      : [];

  const columnClass = (d: any) => {
    if (d.isBankHoliday) return 'bg-blue-100 dark:bg-blue-900/20';
    if (d.isWeekend) return 'bg-blue-50 dark:bg-blue-900/10';
    if (!isTeamSelected && d.isOnLeave)
      return 'bg-gray-100 dark:bg-gray-700/40';
    return '';
  };

  const makeBaseEntries = (): DailyEntry[] =>
    dayMeta.map(d => ({
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

  const getCellValue = (serviceName: string, day: number) =>
    dailyEntries.find(e => e.day === day)?.services?.[serviceName] ?? 0;

  const fetchData = async () => {
    if (!currentStaff || services.length === 0) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const entries = makeBaseEntries();

    const { data: activities } = await supabase
      .from('dailyactivity')
      .select('day, service_id, delivered_count, staff_id')
      .eq('month', selectedMonth)
      .eq('year', year)
      .in('staff_id', staffIds);

    activities?.forEach((a: DailyActivityRow) => {
      const service = services.find(s => s.service_id === a.service_id);
      const entry = entries.find(e => e.day === a.day);

      if (service && entry) {
        entry.services[service.service_name] += a.delivered_count || 0;
      }
    });

    setDailyEntries(entries);

    const targetTotals: Record<string, number> = {};
    services.forEach(s => (targetTotals[s.service_name] = 0));

    if (isTeamSelected) {
      for (const sid of staffIds) {
        const { perService } = await loadTargets(
          selectedMonth,
          selectedFinancialYear,
          sid
        );
        services.forEach(s => {
          targetTotals[s.service_name] +=
            perService?.[s.service_id] || 0;
        });
      }
    } else if (currentStaff) {
      const { perService } = await loadTargets(
        selectedMonth,
        selectedFinancialYear,
        currentStaff.staff_id
      );
      services.forEach(s => {
        targetTotals[s.service_name] =
          perService?.[s.service_id] || 0;
      });
    }

    setTargets(targetTotals);
    setLoading(false);
  };

  useEffect(() => {
    if (!leaveHolidayLoading && !servicesLoading) {
      fetchData();
    }
  }, [
    leaveHolidayLoading,
    servicesLoading,
    selectedMonth,
    selectedFinancialYear,
    currentStaff?.staff_id,
    selectedStaffId,
    allStaff.length,
  ]);

  const serviceTotals = Object.fromEntries(
    services.map(s => [
      s.service_name,
      dailyEntries.reduce(
        (sum, e) => sum + (e.services[s.service_name] || 0),
        0
      ),
    ])
  );

  if (loading || servicesLoading || leaveHolidayLoading || workingDaysLoading) {
    return <div className="py-6 text-center text-gray-500">Loading tracker…</div>;
  }

  if (servicesError) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-md text-red-800">
        ⚠️ {servicesError}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-2xl lg:text-3xl font-bold">My Tracker</h2>

      <MyTrackerProgressTiles
        services={services}
        serviceTotals={serviceTotals}
        targets={targets}
        dashboardMode={isTeamSelected ? 'team' : 'individual'}
        workingDays={teamWorkingDays}
        workingDaysUpToToday={workingDaysUpToToday}
      />

      {/* TABLE */}
      <div className="bg-white dark:bg-gray-800 shadow-md rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full table-fixed border-collapse">
            <thead>
              <tr className="bg-[#001B47]">
                <th className="sticky left-0 z-30 px-3 py-2 text-left text-xs font-bold text-white uppercase w-[240px]">
                  Service
                </th>
                {dayMeta.map(d => (
                  <th
                    key={d.day}
                    className="px-2 py-2 text-xs font-bold text-white w-[72px]"
                  >
                    {d.day}
                  </th>
                ))}
                <th className="sticky right-0 z-30 px-2 py-2 text-xs font-bold text-white w-[110px]">
                  Total
                </th>
              </tr>

              <tr className="bg-gray-100 dark:bg-gray-700">
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

            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {services.map((service, idx) => {
                const zebra =
                  idx % 2 === 0
                    ? 'bg-white dark:bg-gray-800'
                    : 'bg-gray-50 dark:bg-gray-750';

                const rowTotal = dayMeta.reduce(
                  (sum, d) => sum + getCellValue(service.service_name, d.day),
                  0
                );

                return (
                  <tr key={service.service_id} className={zebra}>
                    <td className={`sticky left-0 z-20 px-3 py-2 text-sm font-semibold w-[240px] whitespace-nowrap ${zebra}`}>
                      {service.service_name}
                    </td>

                    {dayMeta.map(d => (
                      <td
                        key={`${service.service_id}-${d.day}`}
                        className={`px-1 py-1 text-center w-[72px] ${columnClass(d)}`}
                      >
                        <input
                          type="number"
                          min={0}
                          disabled={isTeamSelected}
                          value={
                            localInputState[`${service.service_id}-${d.day}`] ??
                            getCellValue(service.service_name, d.day)
                          }
                          onChange={e =>
                            setLocalInputState(prev => ({
                              ...prev,
                              [`${service.service_id}-${d.day}`]: e.target.value,
                            }))
                          }
                          className="w-full px-2 py-1 text-sm text-center rounded-md border border-gray-300"
                        />
                      </td>
                    ))}

                    <td className={`sticky right-0 z-20 px-2 py-2 text-sm font-bold text-center w-[110px] ${zebra}`}>
                      {rowTotal}
                    </td>
                  </tr>
                );
              })}

              {/* DAILY TOTALS */}
              <tr className="bg-gray-200 dark:bg-gray-600">
                <td className="sticky left-0 z-20 px-3 py-2 text-sm font-bold w-[240px] bg-gray-200 dark:bg-gray-600">
                  Daily Total
                </td>

                {dayMeta.map(d => (
                  <td
                    key={`total-${d.day}`}
                    className="px-2 py-2 text-sm font-bold text-center w-[72px] bg-gray-200 dark:bg-gray-600"
                  >
                    {services.reduce(
                      (sum, s) => sum + getCellValue(s.service_name, d.day),
                      0
                    )}
                  </td>
                ))}

                <td className="sticky right-0 z-20 px-2 py-2 text-sm font-bold text-center w-[110px] bg-[#001B47] text-white">
                  {Object.values(serviceTotals).reduce((a, b) => a + b, 0)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
