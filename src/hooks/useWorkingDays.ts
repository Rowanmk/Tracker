import { useEffect, useState } from 'react';
import { supabase } from '../supabase/client';

interface BankHoliday {
  date: string;
}

interface StaffLeave {
  start_date: string;
  end_date: string;
}

interface Params {
  financialYear: { start: number; end: number };
  month: number;
  staffId?: number;
}

export const useWorkingDays = (params: Params) => {
  const [teamWorkingDays, setTeamWorkingDays] = useState<number>(0);
  const [workingDaysUpToToday, setWorkingDaysUpToToday] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [showFallbackWarning, setShowFallbackWarning] = useState<boolean>(false);

  useEffect(() => {
    const run = async () => {
      try {
        const { financialYear, month, staffId } = params;
        const year = month >= 4 ? financialYear.start : financialYear.end;

        const daysInMonth = new Date(year, month, 0).getDate();
        const today = new Date().toISOString().split('T')[0];

        let working = 0;
        let workingToToday = 0;

        for (let d = 1; d <= daysInMonth; d++) {
          const date = new Date(year, month - 1, d);
          const isWeekend = date.getDay() === 0 || date.getDay() === 6;
          if (!isWeekend) {
            working++;
            if (date.toISOString().split('T')[0] <= today) {
              workingToToday++;
            }
          }
        }

        const { data: holidays } = await supabase
          .from('bank_holidays')
          .select('date')
          .gte('date', `${year}-${String(month).padStart(2,'0')}-01`)
          .lte('date', `${year}-${String(month).padStart(2,'0')}-${daysInMonth}`);

        (holidays as BankHoliday[] | null)?.forEach(h => {
          const d = new Date(h.date);
          if (d.getDay() !== 0 && d.getDay() !== 6) {
            working--;
            if (h.date <= today) workingToToday--;
          }
        });

        if (staffId) {
          const { data: leave } = await supabase
            .from('staff_leave')
            .select('start_date, end_date')
            .eq('staff_id', staffId);

          (leave as StaffLeave[] | null)?.forEach(l => {
            const from = new Date(l.start_date);
            const to = new Date(l.end_date);

            for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
              const isWeekend = d.getDay() === 0 || d.getDay() === 6;
              if (!isWeekend) {
                working--;
                if (d.toISOString().split('T')[0] <= today) {
                  workingToToday--;
                }
              }
            }
          });
        }

        setTeamWorkingDays(Math.max(0, working));
        setWorkingDaysUpToToday(Math.max(0, workingToToday));
      } catch (e) {
        console.error(e);
        setError('Failed to calculate working days');
        setShowFallbackWarning(true);
      } finally {
        setLoading(false);
      }
    };

    run();
  }, [params.financialYear, params.month, params.staffId]);

  return {
    teamWorkingDays,
    workingDaysUpToToday,
    loading,
    error,
    showFallbackWarning,
  };
};
