importstaffPerformanceimport { useState, useEffect } from 'react';
    import { supabase } from '../supabase/client';
    import { useAuth } from '../context/AuthContext';
    import type { Database } from '../supabase/types';

    type Activity = Database['public']['Tables']['dailyactivity']['Row'];

    export const useActivities = (month: number, year: number) => {
      const [activities, setActivities] = useState<Activity[]>([]);
      const [loading, setLoading] = useState(true);
      const [error, setError] = useState<string | null>(null);
      const { currentStaff } = useAuth();

      const fetchActivities = async () => {
        if (!currentStaff) {
          setLoading(false);
          return;
        }

        setLoading(true);
        setError(null);

        try {
          const { data, error: activitiesError } = await supabase
            .from('dailyactivity')
            .select('*')
            .eq('staff_id', currentStaff.staff_id)
            .eq('month', month)
            .eq('year', year);

          if (activitiesError) {
            console.error('Error fetching activities:', activitiesError);
            setError('Failed to load activities');
            setActivities([]);
          } else {
            setActivities(data || []);
          }
        } catch (err) {
          console.error('Error in fetchActivities:', err);
          setError('Failed to connect to database');
          setActivities([]);
        } finally {
          setLoading(false);
        }
      };

      useEffect(() => {
        fetchActivities();
      }, [currentStaff?.staff_id, month, year]);

      useEffect(() => {
        const handler = () => fetchActivities();
        window.addEventListener('activity-updated', handler);
        return () => window.removeEventListener('activity-updated', handler);
      }, [currentStaff?.staff_id, month, year]);

      return { activities, loading, error, refetch: fetchActivities };
    };