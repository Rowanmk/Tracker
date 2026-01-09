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

interface StaffPerformance {
  staff_id: number;
  name: string;
  services: Record<string, number>;
  total: number;
}

interface StaffTrackerProps {
  staffPerformance: StaffPerformance[];
}

export const StaffTracker: React.FC<StaffTrackerProps> = ({ staffPerformance }) => {
  const { selectedMonth, selectedYear, financialYear } = useDate();
  const { currentStaff, selectedStaffId } = useAuth();
  const { services } = useServices();

  const [dailyEntries, setDailyEntries] = useState<DailyEntry[]>([]);
  const [targets, setTargets] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

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

    const staffIds = isTeamSelected
      ? staffPerformance.map(s => s.staff_id)
      : [currentStaff.staff_id];

    const { data: activities } = await supabase
      .from('dailyactivity')
      .select('day, service_id, delivered_count')
      .eq('month', selectedMonth)
      .eq('year', year)
      .in('staff_id', staffIds);

    activities?.forEach((a: ActivityRow) => {
      const service = services.find(s => s.service_id === a.service_id);
      if (!service) return;
      const entry = entries.find(e => e.day === a.day);
      if (entry) entry.services[service.service_name] += a.delivered_count;
    });

    setDailyEntries(entries);

    const targetTotals: Record<string, number> = {};
    services.forEach(s => (targetTotals[s.service_name] = 0));

    for (const staff of staffPerformance) {
      const { perService } = await loadTargets(
        selectedMonth,
        financialYear,
        staff.staff_id
      );

      services.forEach(s => {
        targetTotals[s.service_name] += perService[s.service_id] || 0;
      });
    }

    setTargets(targetTotals);
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
    staffPerformance.length,
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
    </div>
  );
};
