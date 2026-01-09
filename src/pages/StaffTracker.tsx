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

  const isBlueDay = (e: DailyEntry) => e.isWeekend || e.isBankHoliday;

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

      {/* TABLE TILE */}
      <div className="mt-6 bg-white rounded-xl shadow-md border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">

          {/* HEADER */}
          <div className="flex bg-gray-100 border-b sticky top-0 z-30 items-center">
            <div className="w-56 px-4 py-3 font-bold sticky left-0 bg-gray-100 z-40 flex items-center">
              Service
            </div>

            {dailyEntries.map(e => (
              <div
                key={e.day}
                className={`w-16 text-center px-1 py-2 border-r ${
                  isBlueDay(e) ? 'bg-blue-50' : ''
                }`}
              >
                <div className="font-bold">{e.day}</div>
                <div className="text-xs">{getDayName(e.day)}</div>
              </div>
            ))}

            <div className="w-24 px-3 py-3 font-bold text-center sticky right-0 bg-gray-100 z-40 flex items-center justify-center">
              Total
            </div>
          </div>

          {/* SERVICE ROWS */}
          {services.map((service, idx) => (
            <div
              key={service.service_id}
              className={`flex border-b items-center ${
                idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'
              }`}
            >
              <div className="w-56 px-4 py-3 font-semibold sticky left-0 bg-inherit z-20 flex items-center">
                {service.service_name}
              </div>

              {dailyEntries.map(e => {
                const dirty = dirtyCells.has(`${e.day}-${service.service_name}`);
                return (
                  <div
                    key={e.day}
                    className={`w-16 px-1 py-2 flex items-center justify-center ${
                      isBlueDay(e) ? 'bg-blue-50' : ''
                    }`}
                  >
                    <input
                      type="number"
                      value={e.services[service.service_name]}
                      disabled={isTeamSelected}
                      className={`w-full px-1 py-1 border rounded-md text-center text-sm ${
                        dirty ? 'border-orange-400 ring-1 ring-orange-300' : ''
                      }`}
                    />
                  </div>
                );
              })}

              <div className="w-24 px-3 py-3 sticky right-0 bg-inherit z-20 flex items-center justify-center">
                <div className="px-2 py-2 bg-gray-100 rounded-md font-bold">
                  {serviceTotals[service.service_name]}
                </div>
              </div>
            </div>
          ))}

          {/* DAILY TOTAL */}
          <div className="flex bg-gray-200 border-t-2 border-gray-300 items-center">
            <div className="w-56 px-4 py-3 font-bold sticky left-0 bg-gray-200 z-30 flex items-center">
              Daily Total
            </div>

            {dailyTotals.map((t, i) => (
              <div
                key={i}
                className="w-16 px-1 py-2 flex items-center justify-center"
              >
                <div className="px-2 py-2 bg-white rounded-md text-sm font-bold w-full text-center">
                  {t}
                </div>
              </div>
            ))}

            <div className="w-24 px-3 py-3 sticky right-0 bg-gray-200 z-30 flex items-center justify-center">
              <div className="px-2 py-2 bg-blue-600 text-white rounded-md text-sm font-bold w-full text-center">
                {grandTotal}
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};
