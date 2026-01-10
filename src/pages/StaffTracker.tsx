import React, { useEffect, useState } from 'react';
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

export const StaffTracker: React.FC = () => {
  const { selectedMonth, selectedFinancialYear } = useDate();
  const { currentStaff, selectedStaffId } = useAuth();
  const { services, loading: servicesLoading } = useServices();

  const financialYear = selectedFinancialYear;
  const year =
    selectedMonth >= 4
      ? selectedFinancialYear.start
      : selectedFinancialYear.end;

  const isTeamSelected = selectedStaffId === 'team';

  const { teamWorkingDays, workingDaysUpToToday, loading: workingDaysLoading } =
    useWorkingDays({
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

  useEffect(() => {
    const fetchData = async () => {
      if (!currentStaff || services.length === 0) {
        setLoading(false);
        return;
      }

      setLoading(true);

      const daysInMonth = new Date(year, selectedMonth, 0).getDate();

      const entries: DailyEntry[] = Array.from({ length: daysInMonth }, (_, i) => {
        const day = i + 1;
        const date = `${year}-${String(selectedMonth).padStart(2, '0')}-${String(
          day
        ).padStart(2, '0')}`;

        const bh = isDateBankHoliday(date);
        const dow = new Date(year, selectedMonth - 1, day).getDay();

        return {
          date,
          day,
          isWeekend: dow === 0 || dow === 6,
          isOnLeave: isDateOnLeave(date),
          isBankHoliday: !!bh,
          bankHolidayTitle: bh?.title,
          services: Object.fromEntries(
            services.map((s) => [s.service_name, 0])
          ),
        };
      });

      const staffIds = isTeamSelected
        ? (
            await supabase
              .from('staff')
              .select('staff_id')
          ).data?.map((s) => s.staff_id) ?? []
        : [currentStaff.staff_id];

      const { data: activities } = await supabase
        .from('dailyactivity')
        .select('day, service_id, delivered_count, staff_id')
        .eq('month', selectedMonth)
        .eq('year', year)
        .in('staff_id', staffIds);

      activities?.forEach((a) => {
        const service = services.find(
          (s) => s.service_id === a.service_id
        );
        if (!service) return;

        const entry = entries.find((e) => e.day === a.day);
        if (entry) {
          entry.services[service.service_name] += a.delivered_count || 0;
        }
      });

      setDailyEntries(entries);

      const targetTotals: Record<string, number> = {};
      services.forEach((s) => (targetTotals[s.service_name] = 0));

      if (isTeamSelected) {
        for (const staffId of staffIds) {
          const { perService } = await loadTargets(
            selectedMonth,
            financialYear,
            staffId
          );

          services.forEach((s) => {
            targetTotals[s.service_name] +=
              perService?.[s.service_id] || 0;
          });
        }
      } else {
        const { perService } = await loadTargets(
          selectedMonth,
          financialYear,
          currentStaff.staff_id
        );

        services.forEach((s) => {
          targetTotals[s.service_name] =
            perService?.[s.service_id] || 0;
        });
      }

      setTargets(targetTotals);
      setLoading(false);
    };

    if (!leaveHolidayLoading && !servicesLoading) {
      fetchData();
    }
  }, [
    currentStaff?.staff_id,
    selectedStaffId,
    services.length,
    selectedMonth,
    selectedFinancialYear,
    leaveHolidayLoading,
    servicesLoading,
  ]);

  const serviceTotals = Object.fromEntries(
    services.map((s) => [
      s.service_name,
      dailyEntries.reduce(
        (sum, e) => sum + (e.services[s.service_name] || 0),
        0
      ),
    ])
  );

  if (
    loading ||
    servicesLoading ||
    leaveHolidayLoading ||
    workingDaysLoading
  ) {
    return (
      <div className="py-6 text-center text-gray-500">
        Loading tracker…
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-2xl lg:text-3xl font-bold mb-4">
        My Tracker
      </h2>

      <MyTrackerProgressTiles
        services={services}
        serviceTotals={serviceTotals}
        targets={targets}
        dashboardMode={isTeamSelected ? 'team' : 'individual'}
        workingDays={teamWorkingDays}
        workingDaysUpToToday={workingDaysUpToToday}
      />
    </div>
  );
};
