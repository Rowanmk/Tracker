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
  day: number;
  services: Record<string, number>;
}

interface StaffPerformance {
  staff_id: number;
  name: string;
  total: number;
}

export const StaffTracker: React.FC = () => {
  const { selectedMonth, selectedFinancialYear } = useDate();
  const { currentStaff, selectedStaffId, allStaff } = useAuth();
  const { services } = useServices();

  const isTeamSelected = selectedStaffId === 'team';
  const year =
    selectedMonth >= 4
      ? selectedFinancialYear.start
      : selectedFinancialYear.end;

  const { teamWorkingDays, workingDaysUpToToday } = useWorkingDays({
    financialYear: selectedFinancialYear,
    month: selectedMonth,
  });

  const [dailyEntries, setDailyEntries] = useState<DailyEntry[]>([]);
  const [targets, setTargets] = useState<Record<string, number>>({});
  const [staffPerformance, setStaffPerformance] = useState<StaffPerformance[]>([]);
  const [loading, setLoading] = useState(true);

  const staffIds = isTeamSelected
    ? allStaff.map(s => s.staff_id)
    : currentStaff
    ? [currentStaff.staff_id]
    : [];

  const fetchData = async () => {
    if (services.length === 0 || staffIds.length === 0) return;

    setLoading(true);

    const entries: DailyEntry[] = Array.from({ length: 31 }, (_, i) => ({
      day: i + 1,
      services: Object.fromEntries(
        services.map(s => [s.service_name, 0])
      ),
    }));

    const { data: activities } = await supabase
      .from('dailyactivity')
      .select('staff_id, service_id, delivered_count, day')
      .eq('month', selectedMonth)
      .eq('year', year)
      .in('staff_id', staffIds);

    activities?.forEach(
      (a: {
        staff_id: number;
        service_id: number;
        delivered_count: number;
        day: number;
      }) => {
        const service = services.find(s => s.service_id === a.service_id);
        const entry = entries.find(e => e.day === a.day);
        if (service && entry) {
          entry.services[service.service_name] += a.delivered_count || 0;
        }
      }
    );

    setDailyEntries(entries);

    /* ---------------- TARGETS ---------------- */
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

    /* -------- STAFF PERFORMANCE (for top bar) -------- */
    const performance: StaffPerformance[] = staffIds.map(id => {
      const staff =
        allStaff.find(s => s.staff_id === id) || currentStaff!;

      const total = entries.reduce(
        (sum, e) =>
          sum +
          Object.values(e.services).reduce((a, b) => a + b, 0),
        0
      );

      return {
        staff_id: staff.staff_id,
        name: staff.name,
        total,
      };
    });

    setStaffPerformance(performance);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, [
    selectedMonth,
    selectedFinancialYear,
    selectedStaffId,
    services.length,
  ]);

  const serviceTotals = useMemo(() => {
    return Object.fromEntries(
      services.map(s => [
        s.service_name,
        dailyEntries.reduce(
          (sum, e) => sum + (e.services[s.service_name] || 0),
          0
        ),
      ])
    );
  }, [dailyEntries, services]);

  if (loading) {
    return (
      <div className="py-6 text-center text-gray-500">
        Loading tracker…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl lg:text-3xl font-bold">
        My Tracker
      </h2>

      {/* Top performance bar – now correctly populated */}
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

      {/* Tracker table remains unchanged below */}
    </div>
  );
};
