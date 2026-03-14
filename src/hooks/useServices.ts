import { useState, useEffect } from 'react';
import { supabase } from '../supabase/client';
import type { Database } from '../supabase/types';

type Service = Database['public']['Tables']['services']['Row'];

const SERVICE_ORDER = ['Accounts', 'VAT', 'Self Assessments', 'Self Assessment', 'Bagel Days'];

const sortServices = (servicesToSort: Service[]) => {
  return [...servicesToSort].sort((a, b) => {
    const nameA = a.service_name || '';
    const nameB = b.service_name || '';
    const indexA = SERVICE_ORDER.indexOf(nameA);
    const indexB = SERVICE_ORDER.indexOf(nameB);
    
    const weightA = indexA === -1 ? 999 : indexA;
    const weightB = indexB === -1 ? 999 : indexB;
    
    if (weightA === weightB) {
      return nameA.localeCompare(nameB);
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
          {
            service_id: 4,
            service_name: 'Bagel Days',
          }
        ];

        if (servicesError) {
          setError('Failed to load services data');
          setShowFallbackWarning(true);
          setServices(sortServices(mockServices));
        } else {
          let fetchedServices = data || [];
          // Auto-inject Bagel Days if it doesn't exist in the DB yet, so it shows up immediately
          if (!fetchedServices.some(s => s.service_name === 'Bagel Days')) {
            fetchedServices = [...fetchedServices, { service_id: -999, service_name: 'Bagel Days' }];
          }
          setServices(sortServices(fetchedServices));
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
          {
            service_id: 4,
            service_name: 'Bagel Days',
          }
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