import React, { useState, useEffect } from 'react';
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

interface ActivityRow {
  day: number;
  service_id: number;
  delivered_count: number;
}

export const StaffTracker: React.FC = () => {
  const {
    selectedMonth,
    selectedYear,
    setSelectedMonth,
    setSelectedYear,
    financialYear,
  } = useDate();

  const { currentStaff, allStaff, selectedStaffId } = useAuth();
  const { services } = useServices();

  const [dailyEntries, setDailyEntries] = useState<DailyEntry[]>([]);
  const [targets, setTargets] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [dirtyCells, setDirtyCells] = useState<Set<string>>(new Set());

  const isTeamSelected = selectedStaffId === 'team' || !selectedStaffId;
  const year = selectedYear;

  const { teamWorkingDays, workingDaysUpToToday } = useWorkingDays({
    financialYear,
    month: selectedMonth,
  });

  const {
    isDateOnLeave,
    isDateBankHoliday,
    loading: leaveHolidayLoading,
  } = useStaffLeaveAndHolidays({
    staffId: currentStaff?.staff_id || 0,
    month: selectedMonth,
    year,
    homeRegion: currentStaff?.home_region || 'england-and-wales',
  });

  const getDayName = (day: number) =>
    ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][
      new Date(year, selectedMonth - 1, day).getDay()
    ];

  const getCellBg = (e: DailyEntry) => {
    if (e.isBankHoliday) return 'bg-red-200 dark:bg-red-800/40';
    if (e.isOnLeave) return 'bg-gray-200 dark:bg-gray-600';
    if (e.isWeekend) return 'bg-red-100 dark:bg-red-800/20';
    return 'bg-white dark:bg-gray-800';
  };

  const fetchData = async () => {
    if (!currentStaff || services.length === 0) return;
    setLoading(true);

    const daysInMonth = new Date(year, selectedMonth, 0).getDate();

    const entries: DailyEntry[] = Array.from({ length: daysInMonth }, (_, i) => {
      const day = i + 1;
      const date = `${year}-${String(selectedMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const bh = isDateBankHoliday(date);

      return {
        date,
        day,
        isWeekend: [0, 6].includes(new Date(year, selectedMonth - 1, day).getDay()),
        isOnLeave: isDateOnLeave(date),
        isBankHoliday: !!bh,
        bankHolidayTitle: bh?.title,
        services: Object.fromEntries(services.map(s => [s.service_name, 0])),
      };
    });

    const { data: activities } = await supabase
      .from('dailyactivity')
      .select('day, service_id, delivered_count')
      .eq('month', selectedMonth)
      .eq('year', year)
      .in(
        'staff_id',
        isTeamSelected ? allStaff.map(s => s.staff_id) : [currentStaff.staff_id]
      );

    activities?.forEach((a: ActivityRow) => {
      const service = services.find(s => s.service_id === a.service_id);
      if (!service) return;
      const entry = entries.find(e => e.day === a.day);
      if (entry) entry.services[service.service_name] += a.delivered_count;
    });

    setDailyEntries(entries);

    if (isTeamSelected) {
      const totals: Record<string, number> = {};
      services.forEach(s => (totals[s.service_name] = 0));

      for (const staff of allStaff) {
        const { perService } = await loadTargets(selectedMonth, financialYear, staff.staff_id);
        services.forEach(s => {
          totals[s.service_name] += perService[s.service_id] || 0;
        });
      }
      setTargets(totals);
    } else {
      const { perService } = await loadTargets(
        selectedMonth,
        financialYear,
        currentStaff.staff_id
      );
      setTargets(
        Object.fromEntries(
          services.map(s => [s.service_name, perService[s.service_id] || 0])
        )
      );
    }

    setDirtyCells(new Set());
    setLoading(false);
  };

  useEffect(() => {
    if (!leaveHolidayLoading) fetchData();
  }, [
    currentStaff?.staff_id,
    services.length,
    selectedMonth,
    financialYear,
    leaveHolidayLoading,
    isTeamSelected,
  ]);

  const markDirty = (day: number, service: string) => {
    setDirtyCells(prev => new Set(prev).add(`${day}-${service}`));
  };

  const clearDirty = (day: number, service: string) => {
    setDirtyCells(prev => {
      const next = new Set(prev);
      next.delete(`${day}-${service}`);
      return next;
    });
  };

  const handleLocalChange = (day: number, service: string, val: string) => {
    markDirty(day, service);
    const num = Math.max(0, parseInt(val || '0', 10));
    setDailyEntries(prev =>
      prev.map(e =>
        e.day === day
          ? { ...e, services: { ...e.services, [service]: num } }
          : e
      )
    );
  };

  const handleSave = async (day: number, serviceName: string, val: string) => {
    if (!currentStaff || isTeamSelected) return;
    const service = services.find(s => s.service_name === serviceName);
    if (!service) return;

    const delivered_count = Math.max(0, parseInt(val || '0', 10));
    const date = `${year}-${String(selectedMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

    await supabase.from('dailyactivity').upsert(
      {
        staff_id: currentStaff.staff_id,
        date,
        day,
        month: selectedMonth,
        year,
        service_id: service.service_id,
        delivered_count,
      },
      { onConflict: 'staff_id,date,service_id' }
    );

    clearDirty(day, serviceName);
  };

  const serviceTotals = Object.fromEntries(
    services.map(s => [
      s.service_name,
      dailyEntries.reduce((sum, e) => sum + e.services[s.service_name], 0),
    ])
  );

  const dailyTotals = dailyEntries.map(e =>
    services.reduce((sum, s) => sum + e.services[s.service_name], 0)
  );

  const grandTotal = dailyTotals.reduce((a, b) => a + b, 0);

  return (
    <div>
      <h2 className="text-2xl lg:text-3xl font-bold mb-3">My Tracker</h2>

      <div className="mt-6 overflow-x-auto">
        {/* HEADER */}
        <div className="flex bg-gray-100 border-b sticky top-0 z-30">
          <div className="w-56 px-4 py-3 font-bold sticky left-0 bg-gray-100 z-40">
            Service
          </div>

          {dailyEntries.map(e => (
            <div
              key={e.day}
              className="w-16 text-center px-1 py-2 border-r"
              title={e.bankHolidayTitle}
            >
              <div className="font-bold">{e.day}</div>
              <div className="text-xs">{getDayName(e.day)}</div>
              {e.isBankHoliday && <div className="text-xs">🔴</div>}
              {e.isOnLeave && <div className="text-xs">🟢</div>}
            </div>
          ))}

          <div className="w-24 px-3 py-3 font-bold text-center sticky right-0 bg-gray-100 z-40">
            Total
          </div>
        </div>

        {/* SERVICE ROWS */}
        {services.map((service, idx) => (
          <div
            key={service.service_id}
            className={`flex border-b ${
              idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'
            }`}
          >
            <div className="w-56 px-4 py-3 font-semibold sticky left-0 bg-inherit z-20">
              {service.service_name}
            </div>

            {dailyEntries.map(e => {
              const dirty = dirtyCells.has(`${e.day}-${service.service_name}`);
              return (
                <div key={e.day} className={`w-16 px-1 py-2 ${getCellBg(e)}`}>
                  <input
                    type="number"
                    value={e.services[service.service_name]}
                    disabled={isTeamSelected}
                    onChange={ev =>
                      handleLocalChange(e.day, service.service_name, ev.target.value)
                    }
                    onBlur={ev =>
                      handleSave(e.day, service.service_name, ev.target.value)
                    }
                    className={`w-full px-1 py-1 border rounded-md text-center text-sm ${
                      dirty ? 'border-orange-400 ring-1 ring-orange-300' : ''
                    }`}
                  />
                </div>
              );
            })}

            <div className="w-24 px-3 py-3 font-bold text-center sticky right-0 bg-inherit z-20">
              <div className="px-2 py-2 bg-gray-100 rounded-md">
                {serviceTotals[service.service_name]}
              </div>
            </div>
          </div>
        ))}

        {/* DAILY TOTAL ROW */}
        <div className="flex bg-gray-200 border-t-2 border-gray-300">
          <div className="w-56 px-4 py-3 font-bold sticky left-0 bg-gray-200 z-30">
            Daily Total
          </div>

          {dailyTotals.map((total, idx) => (
            <div key={idx} className="w-16 px-1 py-2 border-r">
              <div className="px-2 py-2 bg-white rounded-md text-center text-sm font-bold">
                {total}
              </div>
            </div>
          ))}

          <div className="w-24 px-3 py-3 sticky right-0 bg-gray-200 z-30">
            <div className="px-2 py-2 bg-blue-600 text-white rounded-md text-center text-sm font-bold">
              {grandTotal}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
