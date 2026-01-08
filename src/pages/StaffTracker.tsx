import React, { useState, useEffect, useRef } from 'react';
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
  services: { [key: string]: number };
}

interface ActivityRow {
  day: number;
  service_id: number;
  delivered_count: number;
}

export const StaffTracker: React.FC = () => {
  const { selectedMonth, selectedYear, setSelectedMonth, setSelectedYear, financialYear } = useDate();
  const { currentStaff, allStaff, selectedStaffId } = useAuth();
  const { services } = useServices();

  const [dailyEntries, setDailyEntries] = useState<DailyEntry[]>([]);
  const [targets, setTargets] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [activeCell, setActiveCell] = useState<{ service: number; day: number } | null>(null);

  const isTeamSelected = selectedStaffId === 'team' || !selectedStaffId;
  const year = selectedYear;

  const { teamWorkingDays, workingDaysUpToToday } = useWorkingDays({
    financialYear,
    month: selectedMonth,
  });

  const { isDateOnLeave, isDateBankHoliday, loading: leaveHolidayLoading } =
    useStaffLeaveAndHolidays({
      staffId: currentStaff?.staff_id || 0,
      month: selectedMonth,
      year,
      homeRegion: currentStaff?.home_region || 'england-and-wales',
    });

  const inputRefs = useRef<Map<string, HTMLInputElement>>(new Map());

  const getInputKey = (serviceIdx: number, day: number) => `${serviceIdx}-${day}`;

  const getDayName = (day: number) => {
    const date = new Date(year, selectedMonth - 1, day);
    return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][date.getDay()];
  };

  const getCellBackgroundClass = (entry: DailyEntry) => {
    if (entry.isBankHoliday) return 'bg-red-200 dark:bg-red-800/50';
    if (entry.isOnLeave) return 'bg-gray-200 dark:bg-gray-600';
    if (entry.isWeekend) return 'bg-red-100 dark:bg-red-800/30';
    return 'bg-white dark:bg-gray-700';
  };

  const fetchData = async () => {
    if (!currentStaff || services.length === 0) return;

    setLoading(true);

    const daysInMonth = new Date(year, selectedMonth, 0).getDate();

    const entries: DailyEntry[] = Array.from({ length: daysInMonth }, (_, i) => {
      const day = i + 1;
      const date = `${year}-${selectedMonth.toString().padStart(2, '0')}-${day
        .toString()
        .padStart(2, '0')}`;

      const bankHoliday = isDateBankHoliday(date);

      return {
        date,
        day,
        isWeekend: [0, 6].includes(new Date(year, selectedMonth - 1, day).getDay()),
        isOnLeave: isDateOnLeave(date),
        isBankHoliday: !!bankHoliday,
        bankHolidayTitle: bankHoliday?.title,
        services: Object.fromEntries(services.map(s => [s.service_name, 0])),
      };
    });

    const { data: activities } = await supabase
      .from('dailyactivity')
      .select('day, service_id, delivered_count')
      .eq('month', selectedMonth)
      .eq('year', year)
      .in('staff_id', isTeamSelected ? allStaff.map(s => s.staff_id) : [currentStaff.staff_id]);

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
        services.forEach(s => (totals[s.service_name] += perService[s.service_id] || 0));
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

    setLoading(false);
  };

  useEffect(() => {
    if (!leaveHolidayLoading) fetchData();
  }, [currentStaff?.staff_id, services.length, selectedMonth, financialYear, leaveHolidayLoading, isTeamSelected]);

  const handleLocalChange = (day: number, serviceName: string, value: string) => {
    const num = Math.max(0, parseInt(value || '0', 10));
    setDailyEntries(prev =>
      prev.map(e =>
        e.day === day
          ? { ...e, services: { ...e.services, [serviceName]: num } }
          : e
      )
    );
  };

  const handleSave = async (day: number, serviceName: string, value: string) => {
    if (!currentStaff || isTeamSelected) return;

    const service = services.find(s => s.service_name === serviceName);
    if (!service) return;

    const delivered_count = Math.max(0, parseInt(value || '0', 10));
    const date = `${year}-${selectedMonth.toString().padStart(2, '0')}-${day
      .toString()
      .padStart(2, '0')}`;

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
  };

  const serviceTotals = Object.fromEntries(
    services.map(s => [
      s.service_name,
      dailyEntries.reduce((sum, e) => sum + e.services[s.service_name], 0),
    ])
  );

  return (
    <div>
      <h2 className="text-2xl lg:text-3xl font-bold mb-3">My Tracker</h2>

      {!loading && !leaveHolidayLoading && (
        <MyTrackerProgressTiles
          services={services}
          serviceTotals={serviceTotals}
          targets={targets}
          dashboardMode={isTeamSelected ? 'team' : 'individual'}
          workingDays={teamWorkingDays}
          workingDaysUpToToday={workingDaysUpToToday}
        />
      )}

      <div className="mt-6 overflow-x-auto">
        {/* Header */}
        <div className="flex bg-gray-100 dark:bg-gray-700 border-b">
          <div className="w-48 sticky left-0 z-20 px-4 py-3 font-bold">Service</div>
          {dailyEntries.map(entry => (
            <div
              key={entry.day}
              className={`w-16 text-center px-1 py-2 border-r ${getCellBackgroundClass(entry)}`}
              title={entry.bankHolidayTitle}
            >
              <div className="font-bold">{entry.day}</div>
              <div className="text-xs">{getDayName(entry.day)}</div>
              {entry.isBankHoliday && <div className="text-xs">🔴</div>}
              {entry.isOnLeave && <div className="text-xs">🟢</div>}
            </div>
          ))}
          <div className="w-24 sticky right-0 z-20 px-3 py-3 font-bold">Total</div>
        </div>

        {/* Rows */}
        {services.map((service, sIdx) => (
          <div key={service.service_id} className="flex border-b">
            <div className="w-48 sticky left-0 px-4 py-3 font-semibold bg-white dark:bg-gray-800">
              {service.service_name}
            </div>

            {dailyEntries.map(entry => {
              const key = getInputKey(sIdx, entry.day);
              return (
                <div key={entry.day} className={`w-16 px-1 py-2 ${getCellBackgroundClass(entry)}`}>
                  <input
                    ref={el => el && inputRefs.current.set(key, el)}
                    type="number"
                    value={entry.services[service.service_name]}
                    disabled={isTeamSelected}
                    onFocus={() => setActiveCell({ service: sIdx, day: entry.day })}
                    onChange={e =>
                      handleLocalChange(entry.day, service.service_name, e.target.value)
                    }
                    onBlur={e => handleSave(entry.day, service.service_name, e.target.value)}
                    className="w-full text-center border rounded-md text-sm"
                  />
                </div>
              );
            })}

            <div className="w-24 sticky right-0 px-3 py-3 bg-white dark:bg-gray-800 font-bold text-center">
              {serviceTotals[service.service_name]}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
