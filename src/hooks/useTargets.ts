import { useState, useEffect } from 'react';
    import { supabase } from '../supabase/client';
    import { useAuth } from '../context/AuthContext';
    import type { Database } from '../supabase/types';

    type Target = Database['public']['Tables']['monthlytargets']['Row'];

    export const useTargets = (month: number, year: number) => {
      const [targets, setTargets] = useState<Target[]>([]);
      const [loading, setLoading] = useState(true);
      const [error, setError] = useState<string | null>(null);
      const { currentStaff } = useAuth();

      const fetchTargets = async () => {
        if (!currentStaff) {
          setLoading(false);
          return;
        }

        setLoading(true);
        setError(null);

        try {
          const { data, error: targetsError } = await supabase
            .from('monthlytargets')
            .select('*')
            .eq('staff_id', currentStaff.staff_id)
            .eq('month', month)
            .eq('year', year);

          if (targetsError) {
            console.error('Error fetching targets:', targetsError);
            setError('Failed to load targets');
            setTargets([]);
          } else {
            setTargets(data || []);
          }
        } catch (err) {
          console.error('Error in fetchTargets:', err);
          setError('Failed to connect to database');
          setTargets([]);
        } finally {
          setLoading(false);
        }
      };

      useEffect(() => {
        fetchTargets();
      }, [currentStaff?.staff_id, month, year]);

      useEffect(() => {
        const handler = () => fetchTargets();
        window.addEventListener('activity-updated', handler);
        return () => window.removeEventListener('activity-updated', handler);
      }, [currentStaff?.staff_id, month, year]);

      return { targets, loading, error, refetch: fetchTargets };
    };