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
  date: string; // YYYY-MM-DD
  day: number; // 1..31
  isWeekend: boolean;
  isOnLeave: boolean;
  isBankHoliday: boolean;
  bankHolidayTitle?: string;
  services: Record<string, number>; // key = service_name
}

type LocalInputState = Record<string, string>; // key => "serviceId-day"

export const StaffTracker: React.FC = () => {
  const { selectedMonth, selectedFinancialYear } = useDate();
  const { currentStaff, selectedStaffId, allStaff } = useAuth();
  const { services, loading: servicesLoading, error: servicesError } = useServices();

  const isTeamSelected = selectedStaffId === 'team';
  const financialYear = selectedFinancialYear;

  const year = selectedMonth >= 4 ? selectedFinancialYear.start : selectedFinancialYear.end;

  const { teamWorkingDays, workingDaysUpToToday, loading: workingDaysLoading } = useWorkingDays({
    financialYear,
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

  // Inline edit support
  const [localInputState, setLocalInputState] = useState<LocalInputState>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const daysInMonth = useMemo(() => new Date(year, selectedMonth, 0).getDate(), [year, selectedMonth]);

  const getDayName = (day: number) =>
    ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(year, selectedMonth - 1, day).getDay()];

  const dateString = (day: number) =>
    `${year}-${String(selectedMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  const dayMeta = useMemo(() => {
    return Array.from({ length: daysInMonth }, (_, i) => {
      const day = i + 1;
      const date = dateString(day);
      const bh = isDateBankHoliday(date);
      const dow = new Date(year, selectedMonth - 1, day).getDay();
      const isWeekend = dow === 0 || dow === 6;

      return {
        day,
        date,
        isWeekend,
        isOnLeave: isDateOnLeave(date),
        isBankHoliday: !!bh,
        bankHolidayTitle: bh?.title,
      };
    });
  }, [daysInMonth, year, selectedMonth, isDateBankHoliday, isDateOnLeave]);

  const staffIds = useMemo(() => {
    if (!currentStaff) return [];
    return isTeamSelected ? allStaff.map(s => s.staff_id) : [currentStaff.staff_id];
  }, [isTeamSelected, allStaff, currentStaff]);

  const columnClass = (d: (typeof dayMeta)[number]) => {
    // Weekend OR Bank Holiday => blue-ish background
    if (d.isBankHoliday) return 'bg-blue-100 dark:bg-blue-900/20';
    if (d.isWeekend) return 'bg-blue-50 dark:bg-blue-900/10';

    // Leave days => grey background (only meaningful for individual view)
    if (!isTeamSelected && d.isOnLeave) return 'bg-gray-100 dark:bg-gray-700/40';

    return '';
  };

  const makeBaseEntries = () => {
    return dayMeta.map((d) => ({
      date: d.date,
      day: d.day,
      isWeekend: d.isWeekend,
      isOnLeave: d.isOnLeave,
      isBankHoliday: d.isBankHoliday,
      bankHolidayTitle: d.bankHolidayTitle,
      services: Object.fromEntries(services.map(s => [s.service_name, 0])),
    })) as DailyEntry[];
  };

  const getCellKey = (serviceId: number, day: number) => `${serviceId}-${day}`;

  const getCellValue = (serviceName: string, day: number): number => {
    const entry = dailyEntries.find(e => e.day === day);
    return entry?.services?.[serviceName] ?? 0;
  };

  const getInputValue = (serviceId: number, serviceName: string, day: number): string => {
    const key = getCellKey(serviceId, day);
    if (Object.prototype.hasOwnProperty.call(localInputState, key)) return localInputState[key];
    return String(getCellValue(serviceName, day));
  };

  const setCellValueInState = (serviceName: string, day: number, value: number) => {
    setDailyEntries(prev => prev.map(e => {
      if (e.day !== day) return e;
      return {
        ...e,
        services: {
          ...e.services,
          [serviceName]: value,
        },
      };
    }));
  };

  const fetchData = async () => {
    if (!currentStaff || services.length === 0) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setSaveError(null);

    const entries = makeBaseEntries();

    // Pull activities
    const { data: activities, error: actErr } = await supabase
      .from('dailyactivity')
      .select('day, service_id, delivered_count, staff_id')
      .eq('month', selectedMonth)
      .eq('year', year)
      .in('staff_id', staffIds);

    if (actErr) {
      // Don’t hard-crash; just show empty table
      console.error('Error fetching dailyactivity:', actErr);
    }

    activities?.forEach((a: any) => {
      const service = services.find(s => s.service_id === a.service_id);
      if (!service) return;

      const entry = entries.find(e => e.day === a.day);
      if (!entry) return;

      entry.services[service.service_name] =
        (entry.services[service.service_name] || 0) + (a.delivered_count || 0);
    });

    setDailyEntries(entries);

    // Pull targets (individual vs team)
    const targetTotals: Record<string, number> = {};
    services.forEach(s => (targetTotals[s.service_name] = 0));

    try {
      if (isTeamSelected) {
        for (const sid of staffIds) {
          const { perService } = await loadTargets(selectedMonth, financialYear, sid);
          services.forEach(s => {
            targetTotals[s.service_name] += perService?.[s.service_id] || 0;
          });
        }
      } else {
        const { perService } = await loadTargets(selectedMonth, financialYear, currentStaff.staff_id);
        services.forEach(s => {
          targetTotals[s.service_name] = perService?.[s.service_id] || 0;
        });
      }
    } catch (e) {
      console.error('Error loading targets:', e);
    }

    setTargets(targetTotals);
    setLoading(false);
  };

  useEffect(() => {
    if (leaveHolidayLoading || servicesLoading) return;
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    leaveHolidayLoading,
    servicesLoading,
    currentStaff?.staff_id,
    selectedStaffId,
    services.length,
    selectedMonth,
    selectedFinancialYear,
    allStaff.length,
  ]);

  // Totals for tiles
  const serviceTotals = useMemo(() => {
    return Object.fromEntries(
      services.map(s => [
        s.service_name,
        dailyEntries.reduce((sum, e) => sum + (e.services[s.service_name] || 0), 0),
      ])
    );
  }, [services, dailyEntries]);

  const dayTotals = useMemo(() => {
    return dayMeta.map(d => {
      const total = services.reduce((sum, s) => sum + (getCellValue(s.service_name, d.day) || 0), 0);
      return { day: d.day, total };
    });
  }, [dayMeta, services, dailyEntries]);

  const grandTotal = useMemo(() => dayTotals.reduce((s, d) => s + d.total, 0), [dayTotals]);

  const saveCell = async (serviceId: number, serviceName: string, day: number, raw: string) => {
    if (!currentStaff) return;

    setSaveError(null);

    // Normalise input
    let num = 0;
    const trimmed = raw.trim();
    if (trimmed !== '') {
      const parsed = parseInt(trimmed, 10);
      if (!Number.isFinite(parsed) || parsed < 0) {
        // revert visual input to committed value
        const key = getCellKey(serviceId, day);
        setLocalInputState(prev => {
          const next = { ...prev };
          delete next[key];
          return next;
        });
        return;
      }
      num = parsed;
    }

    // Update UI immediately
    setCellValueInState(serviceName, day, num);

    // Team mode is read-only
    if (isTeamSelected) return;

    const key = getCellKey(serviceId, day);
    setSavingKey(key);

    const date = dateString(day);

    try {
      if (num === 0) {
        // remove row to keep table clean
        const { error } = await supabase
          .from('dailyactivity')
          .delete()
          .eq('staff_id', currentStaff.staff_id)
          .eq('service_id', serviceId)
          .eq('day', day)
          .eq('month', selectedMonth)
          .eq('year', year);

        if (error) throw error;
      } else {
        // upsert activity row
        const payload = {
          staff_id: currentStaff.staff_id,
          service_id: serviceId,
          delivered_count: num,
          day,
          month: selectedMonth,
          year,
          date,
        };

        const { error } = await supabase
          .from('dailyactivity')
          .upsert(payload, { onConflict: 'staff_id,service_id,day,month,year' });

        if (error) throw error;
      }

      // Clear local edit state
      setLocalInputState(prev => {
        const next = { ...prev };
        delete next[key];
        return next;
      });

      // Let other pages refresh if they listen
      window.dispatchEvent(new Event('activity-updated'));
    } catch (e: any) {
      console.error('Error saving cell:', e);
      setSaveError('Could not save that change (database rejected it).');
      // Refresh from DB so UI never drifts
      fetchData();
    } finally {
      setSavingKey(null);
    }
  };

  if (loading || servicesLoading || leaveHolidayLoading || workingDaysLoading) {
    return <div className="py-6 text-center text-gray-500">Loading tracker…</div>;
  }

  if (servicesError) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-md">
        <p className="text-red-800">⚠️ {servicesError}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl lg:text-3xl font-bold mb-2">My Tracker</h2>
        {saveError && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-md text-red-800 text-sm">
            ❌ {saveError}
          </div>
        )}
      </div>

      <MyTrackerProgressTiles
        services={services}
        serviceTotals={serviceTotals}
        targets={targets}
        dashboardMode={isTeamSelected ? 'team' : 'individual'}
        workingDays={teamWorkingDays}
        workingDaysUpToToday={workingDaysUpToToday}
      />

      {/* INPUT TABLE: Services down the left, Days across the top */}
      <div className="bg-white dark:bg-gray-800 shadow-md rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full table-fixed border-collapse">
            <thead>
              {/* Blue header row (matches your other tables using .table-header) */}
              <tr className="table-header">
                {/* Sticky left label */}
                <th
                  className="sticky left-0 z-30 px-2 py-2 text-left text-xs font-bold text-white uppercase tracking-wider w-[220px] bg-[#001B47]"
                >
                  Service
                </th>

                {dayMeta.map((d) => (
                  <th
                    key={`day-${d.day}`}
                    className={`px-2 py-2 text-center text-xs font-bold text-white uppercase tracking-wider w-[72px] ${columnClass(d)}`}
                    title={
                      d.isBankHoliday
                        ? `Bank Holiday: ${d.bankHolidayTitle || ''}`
                        : !isTeamSelected && d.isOnLeave
                          ? 'On Leave'
                          : d.isWeekend
                            ? 'Weekend'
                            : ''
                    }
                  >
                    {d.day}
                  </th>
                ))}

                {/* Sticky right total */}
                <th
                  className="sticky right-0 z-30 px-2 py-2 text-center text-xs font-bold text-white uppercase tracking-wider w-[110px] bg-[#001B47]"
                >
                  Total
                </th>
              </tr>

              {/* Day-name row */}
              <tr className="bg-gray-100 dark:bg-gray-700">
                <th className="sticky left-0 z-20 px-2 py-2 text-left text-xs font-semibold text-gray-700 dark:text-gray-200 w-[220px] bg-gray-100 dark:bg-gray-700">
                  Day
                </th>
                {dayMeta.map((d) => (
                  <th
                    key={`dow-${d.day}`}
                    className={`px-2 py-2 text-center text-xs font-semibold text-gray-700 dark:text-gray-200 w-[72px] ${columnClass(d)}`}
                  >
                    {getDayName(d.day)}
                  </th>
                ))}
                <th className="sticky right-0 z-20 px-2 py-2 text-center text-xs font-semibold text-gray-700 dark:text-gray-200 w-[110px] bg-gray-100 dark:bg-gray-700">
                  —
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {services.map((service, idx) => {
                const rowTotal = dayMeta.reduce((sum, d) => sum + (getCellValue(service.service_name, d.day) || 0), 0);
                const zebra = idx % 2 === 0 ? 'bg-white dark:bg-gray-800' : 'bg-gray-50 dark:bg-gray-750';

                return (
                  <tr key={service.service_id} className={zebra}>
                    {/* Sticky service name */}
                    <td className={`sticky left-0 z-20 px-2 py-2 text-sm font-semibold text-gray-900 dark:text-white w-[220px] ${zebra} bg-white dark:bg-gray-800`}>
                      {service.service_name}
                    </td>

                    {dayMeta.map((d) => {
                      const key = getCellKey(service.service_id, d.day);
                      const isSaving = savingKey === key;

                      return (
                        <td
                          key={`${service.service_id}-${d.day}`}
                          className={`px-1 py-1 text-center w-[72px] ${columnClass(d)}`}
                        >
                          <input
                            type="number"
                            min={0}
                            disabled={isTeamSelected}
                            value={getInputValue(service.service_id, service.service_name, d.day)}
                            onFocus={(e) => e.currentTarget.select()}
                            onChange={(e) => {
                              const v = e.target.value;
                              setLocalInputState((prev) => ({
                                ...prev,
                                [key]: v,
                              }));
                            }}
                            onBlur={(e) => saveCell(service.service_id, service.service_name, d.day, e.target.value)}
                            className={`w-full px-2 py-1 rounded-md border text-sm text-center font-medium
                              ${isTeamSelected ? 'bg-gray-100 dark:bg-gray-700 cursor-not-allowed' : 'bg-white dark:bg-gray-700'}
                              border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white
                              focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                            `}
                            title={
                              d.isBankHoliday
                                ? `Bank Holiday: ${d.bankHolidayTitle || ''}`
                                : !isTeamSelected && d.isOnLeave
                                  ? 'On Leave'
                                  : d.isWeekend
                                    ? 'Weekend'
                                    : ''
                            }
                          />
                          {isSaving && (
                            <div className="text-[10px] text-gray-500 mt-0.5">Saving…</div>
                          )}
                        </td>
                      );
                    })}

                    {/* Sticky row total */}
                    <td className={`sticky right-0 z-20 px-2 py-2 text-sm font-bold text-gray-900 dark:text-white text-center w-[110px] ${zebra} bg-white dark:bg-gray-800`}>
                      {rowTotal}
                    </td>
                  </tr>
                );
              })}

              {/* Totals row */}
              <tr className="bg-gray-200 dark:bg-gray-600 border-t-2 border-gray-300 dark:border-gray-500">
                <td className="sticky left-0 z-20 px-2 py-2 text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider w-[220px] bg-gray-200 dark:bg-gray-600">
                  Daily Total
                </td>

                {dayTotals.map((d) => {
                  const meta = dayMeta.find(x => x.day === d.day)!;
                  return (
                    <td
                      key={`total-${d.day}`}
                      className={`px-2 py-2 text-sm font-bold text-gray-900 dark:text-white text-center w-[72px] ${columnClass(meta)}`}
                    >
                      {d.total}
                    </td>
                  );
                })}

                <td className="sticky right-0 z-20 px-2 py-2 text-sm font-bold text-white text-center w-[110px] bg-[#001B47]">
                  {grandTotal}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {isTeamSelected && (
          <div className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300 border-t border-gray-200 dark:border-gray-700">
            Team mode is read-only here (shows combined totals). Switch back to an individual staff member to edit.
          </div>
        )}
      </div>
    </div>
  );
};
