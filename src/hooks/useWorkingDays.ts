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
        const todayIso = iso(new Date());

        const startIso = startOfMonthISO(year, month);
        const endIso = endOfMonthISO(year, month);

        // ---- 1) Base weekdays for month + weekdays up to today ----
        let baseWorking = 0;
        let baseWorkingToToday = 0;

        for (let day = 1; day <= daysInMonth; day++) {
          const d = new Date(year, month - 1, day);
          if (!isWeekend(d)) {
            baseWorking++;
            if (iso(d) <= todayIso) baseWorkingToToday++;
          }
        }

        // ---- 2) Team bank holidays (England & Wales) ----
        // IMPORTANT: filter region, and de-duplicate dates to avoid double-subtracting.
        const { data: teamHolidays, error: teamHolErr } = await supabase
          .from('bank_holidays')
          .select('date, region')
          .eq('region', 'england-and-wales')
          .gte('date', startIso)
          .lte('date', endIso);

        if (teamHolErr) {
          console.error('Error fetching team bank holidays:', teamHolErr);
        }

        const teamHolidayDates = new Set<string>();
        (teamHolidays as BankHolidayRow[] | null)?.forEach((h) => {
          if (h?.date) teamHolidayDates.add(h.date);
        });

        let teamWorking = baseWorking;
        let teamWorkingToToday = baseWorkingToToday;

        teamHolidayDates.forEach((dateStr) => {
          const d = new Date(dateStr);
          if (!isWeekend(d)) {
            teamWorking--;
            if (dateStr <= todayIso) teamWorkingToToday--;
          }
        });

        // Clamp for future/past relative to real today:
        // - If selected month is in the future: 0 days elapsed.
        // - If selected month is in the past: full month elapsed.
        const selectedMonthStart = new Date(year, month - 1, 1);
        const now = new Date();
        const nowMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);

        if (selectedMonthStart > nowMonthStart) {
          teamWorkingToToday = 0;
        } else if (selectedMonthStart < nowMonthStart) {
          teamWorkingToToday = teamWorking;
        }

        // ---- 3) Staff working days (optional), based on their region + leave ----
        // Default to team working days if no staffId
        let staffWorkingCalc = teamWorking;

        if (staffId) {
          // Fetch staff region
          const { data: staffRow, error: staffErr } = await supabase
            .from('staff')
            .select('home_region')
            .eq('staff_id', staffId)
            .single();

          if (staffErr) {
            console.error('Error fetching staff region:', staffErr);
          }

          const staffRegion = staffRow?.home_region || 'england-and-wales';

          // Base for staff = weekdays - staff region holidays
          staffWorkingCalc = baseWorking;

          const { data: staffHolidays, error: staffHolErr } = await supabase
            .from('bank_holidays')
            .select('date, region')
            .eq('region', staffRegion)
            .gte('date', startIso)
            .lte('date', endIso);

          if (staffHolErr) {
            console.error('Error fetching staff bank holidays:', staffHolErr);
          }

          const staffHolidayDates = new Set<string>();
          (staffHolidays as BankHolidayRow[] | null)?.forEach((h) => {
            if (h?.date) staffHolidayDates.add(h.date);
          });

          staffHolidayDates.forEach((dateStr) => {
            const d = new Date(dateStr);
            if (!isWeekend(d)) staffWorkingCalc--;
          });

          // Subtract staff leave days within the month only
          const { data: leaveRows, error: leaveErr } = await supabase
            .from('staff_leave')
            .select('start_date, end_date')
            .eq('staff_id', staffId)
            .or(`and(start_date.lte.${endIso},end_date.gte.${startIso})`);

          if (leaveErr) {
            console.error('Error fetching staff leave:', leaveErr);
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
      } catch (e) {
        console.error(e);
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
