import { useState, useEffect } from 'react';
    import { supabase } from '../supabase/client';
    import type { Database } from '../supabase/types';

    type Service = Database['public']['Tables']['services']['Row'];

    export const useServices = () => {
      const [services, setServices] = useState<Service[]>([]);
      const [loading, setLoading] = useState(true);
      const [error, setError] = useState<string | null>(null);
      const [showFallbackWarning, setShowFallbackWarning] = useState(false);

      useEffect(() => {
        const fetchServices = async () => {
          try {
            setError(null);
            setShowFallbackWarning(false);
            
            const { data, error: servicesError } = await supabase
              .from('services')
              .select('*')
              .order('service_name');
            
            if (servicesError) {
              console.error('Error fetching services:', servicesError);
              setError('Failed to load services data');
              setShowFallbackWarning(true);
              
              // Create mock services for demo
              const mockServices: Service[] = [
                {
                  service_id: 1,
                  service_name: 'Accounts',
                },
                {
                  service_id: 2,
                  service_name: 'VAT',
                },
                {
                  service_id: 3,
                  service_name: 'Self Assessments',
                },
              ];
              setServices(mockServices);
            } else {
              setServices(data || []);
            }
          } catch (err) {
            console.error('Error in fetchServices:', err);
            setError('Failed to connect to database');
            setShowFallbackWarning(true);
            
            // Fallback to mock data
            const mockServices: Service[] = [
              {
                service_id: 1,
                service_name: 'Accounts',
              },
              {
                service_id: 2,
                service_name: 'VAT',
              },
              {
                service_id: 3,
                service_name: 'Self Assessments',
              },
            ];
            setServices(mockServices);
          } finally {
            setLoading(false);
          }
        };

        fetchServices();
      }, []);

      return { services, loading, error, showFallbackWarning };
    };