import { useState, useEffect } from 'react';
    import { supabase } from '../supabase/client';
    import type { Database } from '../supabase/types';

    type StaffLeave = Database['public']['Tables']['staff_leave']['Row'];
    type BankHoliday = Database['public']['Tables']['bank_holidays']['Row'];

    interface UseStaffLeaveAndHolidaysParams {
      staffId: number;
      month: number;
      year: number;
      homeRegion?: string;
    }

    export const useStaffLeaveAndHolidays = ({
      staffId,
      month,
      year,
      homeRegion = 'england-and-wales'
    }: UseStaffLeaveAndHolidaysParams) => {
      const [staffLeave, setStaffLeave] = useState<StaffLeave[]>([]);
      const [bankHolidays, setBankHolidays] = useState<BankHoliday[]>([]);
      const [loading, setLoading] = useState(true);
      const [error, setError] = useState<string | null>(null);

      useEffect(() => {
        const fetchData = async () => {
          setLoading(true);
          setError(null);

          try {
            const startDate = `${year}-${month.toString().padStart(2, '0')}-01`;
            const endDate = new Date(year, month, 0).toISOString().split('T')[0];

            // Fetch staff leave
            const { data: leaveData, error: leaveError } = await supabase
              .from('staff_leave')
              .select('*')
              .eq('staff_id', staffId)
              .or(`and(start_date.lte.${endDate},end_date.gte.${startDate})`);

            if (leaveError) {
              console.error('Error fetching staff leave:', leaveError);
              setError('Failed to load staff leave');
            } else {
              setStaffLeave(leaveData || []);
            }

            // Fetch bank holidays for staff's region
            const { data: holidayData, error: holidayError } = await supabase
              .from('bank_holidays')
              .select('*')
              .eq('region', homeRegion)
              .gte('date', startDate)
              .lte('date', endDate);

            if (holidayError) {
              console.error('Error fetching bank holidays:', holidayError);
              setError('Failed to load bank holidays');
            } else {
              setBankHolidays(holidayData || []);
            }
          } catch (err) {
            console.error('Error in fetchData:', err);
            setError('Failed to connect to database');
          } finally {
            setLoading(false);
          }
        };

        fetchData();
      }, [staffId, month, year, homeRegion]);

      const isDateOnLeave = (date: string): boolean => {
        return staffLeave.some(leave => {
          const leaveStart = new Date(leave.start_date);
          const leaveEnd = new Date(leave.end_date);
          const checkDate = new Date(date);
          return checkDate >= leaveStart && checkDate <= leaveEnd;
        });
      };

      const isDateBankHoliday = (date: string): BankHoliday | null => {
        return bankHolidays.find(holiday => holiday.date === date) || null;
      };

      const getLeaveForDate = (date: string): StaffLeave[] => {
        return staffLeave.filter(leave => {
          const leaveStart = new Date(leave.start_date);
          const leaveEnd = new Date(leave.end_date);
          const checkDate = new Date(date);
          return checkDate >= leaveStart && checkDate <= leaveEnd;
        });
      };

      return {
        staffLeave,
        bankHolidays,
        loading,
        error,
        isDateOnLeave,
        isDateBankHoliday,
        getLeaveForDate,
      };
    };