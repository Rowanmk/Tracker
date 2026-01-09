import { useState, useEffect } from 'react';
import { supabase } from '../supabase/client';

interface UseWorkingDaysParams {
  financialYear: { start: number; end: number };
  month: number;
  staffId?: number;
}

interface WorkingDaysResult {
  teamWorkingDays: number;
  staffWorkingDays: number;
  workingDaysUpToToday: number;
  loading: boolean;
  error: string | null;
  showFallbackWarning: boolean;
}

export const useWorkingDays = (params: UseWorkingDaysParams): WorkingDaysResult => {
  const [teamWorkingDays, setTeamWorkingDays] = useState<number>(0);
  const [staffWorkingDays, setStaffWorkingDays] = useState<number>(0);
  const [workingDaysUpToToday, setWorkingDaysUpToToday] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showFallbackWarning, setShowFallbackWarning] = useState(false);

  useEffect(() => {
    const fetchWorkingDays = async () => {
      try {
        setError(null);
        setShowFallbackWarning(false);

        const { financialYear, month, staffId } = params;
        const year = month >= 4 ? financialYear.start : financialYear.end;

        const startDate = `${year}-${month.toString().padStart(2, '0')}-01`;
        const endDate = new Date(year, month, 0).toISOString().split('T')[0];

        const now = new Date();
        const selectedMonthDate = new Date(year, month - 1, 1);

        const isPastMonth =
          selectedMonthDate.getFullYear() < now.getFullYear() ||
          (selectedMonthDate.getFullYear() === now.getFullYear() &&
            selectedMonthDate.getMonth() < now.getMonth());

        const isFutureMonth =
          selectedMonthDate.getFullYear() > now.getFullYear() ||
          (selectedMonthDate.getFullYear() === now.getFullYear() &&
            selectedMonthDate.getMonth() > now.getMonth());

        const todayStr = now.toISOString().split('T')[0];

        // Base working days (weekdays only)
        const daysInMonth = new Date(year, month, 0).getDate();
        let baseWorkingDays = 0;
        let baseWorkingDaysToToday = 0;

        for (let day = 1; day <= daysInMonth; day++) {
          const date = new Date(year, month - 1, day);
          const isWeekend = date.getDay() === 0 || date.getDay() === 6;

          if (!isWeekend) {
            baseWorkingDays++;
            if (date.toISOString().split('T')[0] <= todayStr) {
              baseWorkingDaysToToday++;
            }
          }
        }

        // Team bank holidays
        const { data: teamHolidays } = await supabase
          .from('bank_holidays')
          .select('date')
          .eq('region', 'england-and-wales')
          .gte('date', startDate)
          .lte('date', endDate);

        let teamDays = baseWorkingDays;
        let teamDaysToToday = baseWorkingDaysToToday;

        if (teamHolidays) {
          teamHolidays.forEach(h => {
            const d = new Date(h.date);
            const isWeekend = d.getDay() === 0 || d.getDay() === 6;

            if (!isWeekend) {
              teamDays--;
              if (h.date <= todayStr) {
                teamDaysToToday--;
              }
            }
          });
        }

        // ✅ Correct Expected logic
        let effectiveDaysToToday = teamDaysToToday;

        if (isPastMonth) {
          effectiveDaysToToday = teamDays;
        }

        if (isFutureMonth) {
          effectiveDaysToToday = 0;
        }

        setTeamWorkingDays(Math.max(0, teamDays));
        setWorkingDaysUpToToday(Math.max(0, effectiveDaysToToday));

        // Staff working days
        let staffDays = teamDays;

        if (staffId) {
          const { data: staffData } = await supabase
            .from('staff')
            .select('home_region')
            .eq('staff_id', staffId)
            .single();

          const staffRegion = staffData?.home_region || 'england-and-wales';

          if (staffRegion !== 'england-and-wales') {
            staffDays = baseWorkingDays;

            const { data: staffHolidays } = await supabase
              .from('bank_holidays')
              .select('date')
              .eq('region', staffRegion)
              .gte('date', startDate)
              .lte('date', endDate);

            if (staffHolidays) {
              staffHolidays.forEach(h => {
                const d = new Date(h.date);
                const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                if (!isWeekend) staffDays--;
              });
            }
          }

          const { data: staffLeave } = await supabase
            .from('staff_leave')
            .select('start_date, end_date')
            .eq('staff_id', staffId)
            .or(`and(start_date.lte.${endDate},end_date.gte.${startDate})`);

          if (staffLeave) {
            staffLeave.forEach(leave => {
              const from = new Date(Math.max(new Date(leave.start_date).getTime(), new Date(startDate).getTime()));
              const to = new Date(Math.min(new Date(leave.end_date).getTime(), new Date(endDate).getTime()));

              for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
                const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                if (!isWeekend) staffDays--;
              }
            });
          }
        }

        setStaffWorkingDays(Math.max(0, staffDays));
      } catch (err) {
        console.error('Error in fetchWorkingDays:', err);
        setError('Failed to calculate working days');
        setShowFallbackWarning(true);
      } finally {
        setLoading(false);
      }
    };

    fetchWorkingDays();
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

// Legacy export (unchanged)
export const useWorkingDaysLegacy = (month: number, year: number) => {
  const result = useWorkingDays({
    financialYear: { start: year, end: year + 1 },
    month,
  });

  return {
    workingDays: result.teamWorkingDays,
    workingDaysUpToToday: result.workingDaysUpToToday,
    loading: result.loading,
    error: result.error,
    showFallbackWarning: result.showFallbackWarning,
  };
};
