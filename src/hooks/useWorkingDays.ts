import { useEffect, useState } from 'react';
import { supabase } from '../supabase/client';

interface BankHolidayRow {
  date: string;
  region?: string | null;
}

interface StaffLeaveRow {
  start_date: string;
  end_date: string;
}

interface StaffRegionRow {
  home_region: string | null;
}

interface Params {
  financialYear: { start: number; end: number };
  month: number;
  staffId?: number;
}

interface Result {
  teamWorkingDays: number;
  staffWorkingDays: number;
  workingDaysUpToToday: number;
  loading: boolean;
  error: string | null;
  showFallbackWarning: boolean;
}

const iso = (d: Date) => d.toISOString().split('T')[0];

const startOfMonthISO = (year: number, month: number) =>
  `${year}-${String(month).padStart(2, '0')}-01`;

const endOfMonthISO = (year: number, month: number) =>
  iso(new Date(year, month, 0));

const isWeekend = (d: Date) => d.getDay() === 0 || d.getDay() === 6;

export const useWorkingDays = (params: Params): Result => {
  const [teamWorkingDays, setTeamWorkingDays] = useState<number>(0);
  const [staffWorkingDays, setStaffWorkingDays] = useState<number>(0);
  const [workingDaysUpToToday, setWorkingDaysUpToToday] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [showFallbackWarning, setShowFallbackWarning] = useState<boolean>(false);

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      setError(null);
      setShowFallbackWarning(false);

      try {
        const { financialYear, month, staffId } = params;
        const year = month >= 4 ? financialYear.start : financialYear.end;

        const daysInMonth = new Date(year, month, 0).getDate();

        // Use local date to avoid timezone issues with ISO string comparison
        const now = new Date();
        const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

        const startIso = startOfMonthISO(year, month);
        const endIso = endOfMonthISO(year, month);

        // Determine the relationship between selected month and current month
        const selectedMonthStart = new Date(year, month - 1, 1);
        const nowMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);

        const isCurrentMonth = selectedMonthStart.getTime() === nowMonthStart.getTime();
        const isPastMonth = selectedMonthStart.getTime() < nowMonthStart.getTime();
        const isFutureMonth = selectedMonthStart.getTime() > nowMonthStart.getTime();

        let baseWorking = 0;

        for (let day = 1; day <= daysInMonth; day++) {
          const d = new Date(year, month - 1, day);
          if (!isWeekend(d)) {
            baseWorking++;
          }
        }

        const { data: teamHolidays, error: teamHolErr } = await supabase
          .from('bank_holidays')
          .select('date, region')
          .eq('region', 'england-and-wales')
          .gte('date', startIso)
          .lte('date', endIso);

        if (teamHolErr) {
          setError('Failed to calculate working days');
        }

        const teamHolidayDates = new Set<string>();
        (teamHolidays as BankHolidayRow[] | null)?.forEach((h) => {
          if (h?.date) teamHolidayDates.add(h.date);
        });

        let teamWorking = baseWorking;

        teamHolidayDates.forEach((dateStr) => {
          const d = new Date(dateStr + 'T00:00:00');
          if (!isWeekend(d)) {
            teamWorking--;
          }
        });

        // Calculate working days elapsed up to and including today
        // For future months: 0
        // For past months: full working days in month
        // For current month: count working days from start of month up to and including today
        let teamWorkingToToday = 0;

        if (isFutureMonth) {
          teamWorkingToToday = 0;
        } else if (isPastMonth) {
          teamWorkingToToday = teamWorking;
        } else {
          // Current month: count non-weekend, non-holiday days from 1st up to and including today
          for (let day = 1; day <= daysInMonth; day++) {
            const d = new Date(year, month - 1, day);
            const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

            if (isWeekend(d)) continue;
            if (teamHolidayDates.has(dateStr)) continue;

            // Include today itself — run rate is based on days elapsed including today
            if (dateStr <= todayIso) {
              teamWorkingToToday++;
            }
          }
        }

        let staffWorkingCalc = teamWorking;

        if (staffId) {
          const { data: staffRow, error: staffErr } = await supabase
            .from('staff')
            .select('home_region')
            .eq('staff_id', staffId)
            .maybeSingle();

          if (staffErr) {
            setError('Failed to calculate working days');
          }

          const typedStaffRow = staffRow as StaffRegionRow | null;
          const staffRegion = typedStaffRow?.home_region || 'england-and-wales';

          staffWorkingCalc = baseWorking;

          const { data: staffHolidays, error: staffHolErr } = await supabase
            .from('bank_holidays')
            .select('date, region')
            .eq('region', staffRegion)
            .gte('date', startIso)
            .lte('date', endIso);

          if (staffHolErr) {
            setError('Failed to calculate working days');
          }

          const staffHolidayDates = new Set<string>();
          (staffHolidays as BankHolidayRow[] | null)?.forEach((h) => {
            if (h?.date) staffHolidayDates.add(h.date);
          });

          staffHolidayDates.forEach((dateStr) => {
            const d = new Date(dateStr + 'T00:00:00');
            if (!isWeekend(d)) staffWorkingCalc--;
          });

          const { data: leaveRows, error: leaveErr } = await supabase
            .from('staff_leave')
            .select('start_date, end_date')
            .eq('staff_id', staffId)
            .or(`and(start_date.lte.${endIso},end_date.gte.${startIso})`);

          if (leaveErr) {
            setError('Failed to calculate working days');
          }

          (leaveRows as StaffLeaveRow[] | null)?.forEach((l) => {
            const from = new Date(Math.max(new Date(l.start_date).getTime(), new Date(startIso).getTime()));
            const to = new Date(Math.min(new Date(l.end_date).getTime(), new Date(endIso).getTime()));

            for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
              if (!isWeekend(d)) staffWorkingCalc--;
            }
          });
        }

        setTeamWorkingDays(Math.max(0, teamWorking));
        setWorkingDaysUpToToday(Math.max(0, teamWorkingToToday));
        setStaffWorkingDays(Math.max(0, staffWorkingCalc));
      } catch {
        setError('Failed to calculate working days');
        setShowFallbackWarning(true);
        setTeamWorkingDays(0);
        setStaffWorkingDays(0);
        setWorkingDaysUpToToday(0);
      } finally {
        setLoading(false);
      }
    };

    run();
  }, [params.financialYear, params.month, params.staffId]);

  return {
    teamWorkingDays,
    staffWorkingDays,
    workingDaysUpToToday,
    loading,
    error,
    showFallbackWarning,
  };
};