import { useState, useEffect } from 'react';
import { supabase } from '../supabase/client';
import type { Database } from '../supabase/types';

type Service = Database['public']['Tables']['services']['Row'];

const SERVICE_ORDER = ['Accounts', 'VAT', 'Self Assessments', 'Self Assessment'];

const sortServices = (servicesToSort: Service[]) => {
  return [...servicesToSort].sort((a, b) => {
    const indexA = SERVICE_ORDER.indexOf(a.service_name);
    const indexB = SERVICE_ORDER.indexOf(b.service_name);
    
    const weightA = indexA === -1 ? 999 : indexA;
    const weightB = indexB === -1 ? 999 : indexB;
    
    if (weightA === weightB) {
      return a.service_name.localeCompare(b.service_name);
    }
    
    return weightA - weightB;
  });
};

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
          .select('*');

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

        if (servicesError) {
          setError('Failed to load services data');
          setShowFallbackWarning(true);
          setServices(sortServices(mockServices));
        } else {
          setServices(sortServices(data || []));
        }
      } catch {
        setError('Failed to connect to database');
        setShowFallbackWarning(true);

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
        setServices(sortServices(mockServices));
      } finally {
        setLoading(false);
      }
    };

    void fetchServices();
  }, []);

  return { services, loading, error, showFallbackWarning };
};