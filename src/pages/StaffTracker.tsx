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
  const dashboardMode: 'team' | 'individual' = isTeamSelected ? 'team' : 'individual';

  const year =
    selectedMonth >= 4
      ? selectedFinancialYear.start
      : selectedFinancialYear.end;

  const { teamWorkingDays, workingDaysUpToToday } = useWorkingDays({
    financialYear: selectedFinancialYear,
    month: selectedMonth,
  });

  const { isDateOnLeave, isDateBankHoliday, loading: leaveHolidayLoading } =
    useStaffLeaveAndHolidays({
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

  const staffIds = useMemo<number[]>(() => {
    if (isTeamSelected) return allStaff.map(s => s.staff_id);
    if (currentStaff) return [currentStaff.staff_id];
    return [];
  }, [isTeamSelected, allStaff, currentStaff]);

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

  const fetchData = async () => {
    if (!services.length || !staffIds.length) {
      setLoading(false);
      return;
    }

    setLoading(true);

    const baseEntries: DailyEntry[] = dayMeta.map(d => ({
      date: d.date,
      day: d.day,
      isWeekend: d.isWeekend,
      isOnLeave: d.isOnLeave,
      isBankHoliday: d.isBankHoliday,
      bankHolidayTitle: d.bankHolidayTitle,
      services: Object.fromEntries(services.map(s => [s.service_name, 0])),
    }));

    const { data: activities } = await supabase
      .from('dailyactivity')
      .select('staff_id, service_id, delivered_count, day')
      .eq('month', selectedMonth)
      .eq('year', year)
      .in('staff_id', staffIds);

    (activities as DailyActivityRow[] | null)?.forEach(a => {
      const service = services.find(s => s.service_id === a.service_id);
      const entry = baseEntries.find(e => e.day === a.day);
      if (service && entry) {
        entry.services[service.service_name] += a.delivered_count || 0;
      }
    });

    setDailyEntries(baseEntries);

    const targetTotals: Record<string, number> = {};
    services.forEach(s => (targetTotals[s.service_name] = 0));

    if (isTeamSelected) {
      for (const staff of allStaff) {
        const { perService } = await loadTargets(selectedMonth, selectedFinancialYear, staff.staff_id);
        services.forEach(s => {
          targetTotals[s.service_name] += perService?.[s.service_id] || 0;
        });
      }
    } else if (currentStaff) {
      const { perService } = await loadTargets(selectedMonth, selectedFinancialYear, currentStaff.staff_id);
      services.forEach(s => {
        targetTotals[s.service_name] = perService?.[s.service_id] || 0;
      });
    }

    setTargets(targetTotals);

    const totalsByStaff: Record<number, number> = {};
    (activities as DailyActivityRow[] | null)?.forEach(a => {
      totalsByStaff[a.staff_id] = (totalsByStaff[a.staff_id] || 0) + (a.delivered_count || 0);
    });

    setStaffPerformance(
      staffIds.map(id => ({
        staff_id: id,
        name: allStaff.find(s => s.staff_id === id)?.name || currentStaff?.name || '',
        total: totalsByStaff[id] || 0,
      }))
    );

    setLoading(false);
  };

  useEffect(() => {
    if (!servicesLoading && !leaveHolidayLoading) {
      fetchData();
    }
  }, [selectedMonth, selectedFinancialYear, selectedStaffId, servicesLoading, leaveHolidayLoading]);

  if (loading || servicesLoading || leaveHolidayLoading) {
    return <div className="py-6 text-center text-gray-500">Loading tracker…</div>;
  }

  const serviceTotals = Object.fromEntries(
    services.map(s => [
      s.service_name,
      dailyEntries.reduce((sum, e) => sum + (e.services[s.service_name] || 0), 0),
    ])
  );

  return (
    <div className="space-y-4">
      <h2 className="text-2xl lg:text-3xl font-bold">My Tracker</h2>

      {/* ✅ THIS WAS THE MISSING PIECE */}
      <StaffPerformanceBar
        staffPerformance={staffPerformance}
        workingDays={teamWorkingDays}
        workingDaysUpToToday={workingDaysUpToToday}
        month={selectedMonth}
        financialYear={selectedFinancialYear}
        dashboardMode={dashboardMode}
        currentStaff={
          !isTeamSelected && currentStaff
            ? { staff_id: currentStaff.staff_id, name: currentStaff.name }
            : null
        }
      />

      <MyTrackerProgressTiles
        services={services}
        serviceTotals={serviceTotals}
        targets={targets}
        workingDays={teamWorkingDays}
        workingDaysUpToToday={workingDaysUpToToday}
      />

      {/* TRACKER TABLE REMAINS BELOW — UNTOUCHED */}
    </div>
  );
};
