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
            const today = new Date().toISOString().split('T')[0];

            // Calculate base working days (weekdays only)
            const daysInMonth = new Date(year, month, 0).getDate();
            let baseWorkingDays = 0;
            let baseWorkingDaysToToday = 0;
            
            for (let day = 1; day <= daysInMonth; day++) {
              const date = new Date(year, month - 1, day);
              const dayOfWeek = date.getDay();
              const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
              
              if (!isWeekend) {
                baseWorkingDays++;
                if (date.toISOString().split('T')[0] <= today) {
                  baseWorkingDaysToToday++;
                }
              }
            }

            // Fetch bank holidays for team (england-and-wales)
            const { data: teamHolidays, error: teamHolidaysError } = await supabase
              .from('bank_holidays')
              .select('date')
              .eq('region', 'england-and-wales')
              .gte('date', startDate)
              .lte('date', endDate);

            if (teamHolidaysError) {
              console.error('Error fetching team bank holidays:', teamHolidaysError);
            }

            // Calculate team working days (base - team bank holidays)
            let teamDays = baseWorkingDays;
            let teamDaysToToday = baseWorkingDaysToToday;
            
            if (teamHolidays) {
              teamHolidays.forEach(holiday => {
                const holidayDate = new Date(holiday.date);
                const dayOfWeek = holidayDate.getDay();
                const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
                
                if (!isWeekend) {
                  teamDays--;
                  if (holiday.date <= today) {
                    teamDaysToToday--;
                  }
                }
              });
            }

            setTeamWorkingDays(Math.max(0, teamDays));
            setWorkingDaysUpToToday(Math.max(0, teamDaysToToday));

            // Calculate staff working days if staffId provided
            let staffDays = teamDays;
            
            if (staffId) {
              // Get staff's home region
              const { data: staffData, error: staffError } = await supabase
                .from('staff')
                .select('home_region')
                .eq('staff_id', staffId)
                .single();

              if (staffError) {
                console.error('Error fetching staff region:', staffError);
              }

              const staffRegion = staffData?.home_region || 'england-and-wales';

              // If staff region is different from team region, recalculate
              if (staffRegion !== 'england-and-wales') {
                staffDays = baseWorkingDays;

                // Fetch bank holidays for staff's region
                const { data: staffHolidays, error: staffHolidaysError } = await supabase
                  .from('bank_holidays')
                  .select('date')
                  .eq('region', staffRegion)
                  .gte('date', startDate)
                  .lte('date', endDate);

                if (staffHolidaysError) {
                  console.error('Error fetching staff bank holidays:', staffHolidaysError);
                } else if (staffHolidays) {
                  staffHolidays.forEach(holiday => {
                    const holidayDate = new Date(holiday.date);
                    const dayOfWeek = holidayDate.getDay();
                    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
                    
                    if (!isWeekend) {
                      staffDays--;
                    }
                  });
                }
              }

              // Subtract staff leave
              const { data: staffLeave, error: leaveError } = await supabase
                .from('staff_leave')
                .select('start_date, end_date')
                .eq('staff_id', staffId)
                .or(`and(start_date.lte.${endDate},end_date.gte.${startDate})`);

              if (leaveError) {
                console.error('Error fetching staff leave:', leaveError);
              } else if (staffLeave) {
                // Count working days within leave ranges
                staffLeave.forEach(leave => {
                  const leaveStart = new Date(Math.max(new Date(leave.start_date).getTime(), new Date(startDate).getTime()));
                  const leaveEnd = new Date(Math.min(new Date(leave.end_date).getTime(), new Date(endDate).getTime()));
                  
                  for (let d = new Date(leaveStart); d <= leaveEnd; d.setDate(d.getDate() + 1)) {
                    const dayOfWeek = d.getDay();
                    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
                    const dateStr = d.toISOString().split('T')[0];
                    
                    // Only subtract if it's a weekday and not already a bank holiday
                    if (!isWeekend) {
                      const isTeamHoliday = teamHolidays?.some(h => h.date === dateStr);
                      if (!isTeamHoliday) {
                        staffDays--;
                      }
                    }
                  }
                });
              }
            }

            setStaffWorkingDays(Math.max(0, staffDays));

          } catch (err) {
            console.error('Error in fetchWorkingDays:', err);
            setError('Failed to connect to database');
            setShowFallbackWarning(true);
            
            // Calculate fallback working days (exclude weekends only)
            const { financialYear, month } = params;
            const year = month >= 4 ? financialYear.start : financialYear.end;
            const daysInMonth = new Date(year, month, 0).getDate();
            const today = new Date();
            
            let workingDaysCount = 0;
            let workingDaysToTodayCount = 0;
            
            for (let day = 1; day <= daysInMonth; day++) {
              const date = new Date(year, month - 1, day);
              const dayOfWeek = date.getDay();
              const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
              
              if (!isWeekend) {
                workingDaysCount++;
                if (date <= today) {
                  workingDaysToTodayCount++;
                }
              }
            }
            
            setTeamWorkingDays(workingDaysCount);
            setStaffWorkingDays(workingDaysCount);
            setWorkingDaysUpToToday(workingDaysToTodayCount);
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

    // Legacy function for backward compatibility
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