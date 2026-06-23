import { useState, useEffect } from 'react';
import { supabase } from '../supabase/client';
import type { Database } from '../supabase/types';
import { BAGEL_SERVICE_ID, BAGEL_SERVICE_NAME } from '../utils/bagelDays';

type Service = Database['public']['Tables']['services']['Row'];

const SERVICE_ORDER = ['Accounts', 'VAT', 'Self Assessments', 'Self Assessment', BAGEL_SERVICE_NAME];

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

const getBagelService = (): Service => ({
  service_id: BAGEL_SERVICE_ID,
  service_name: BAGEL_SERVICE_NAME,
});

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

        const injectBagelService = (rows: Service[]) =>
          sortServices([
            ...rows.filter((service) => service.service_name !== BAGEL_SERVICE_NAME),
            getBagelService(),
          ]);

        const mockServices: Service[] = [
          { service_id: 1, service_name: 'Accounts' },
          { service_id: 2, service_name: 'VAT' },
          { service_id: 3, service_name: 'Self Assessments' },
        ];

        if (servicesError) {
          setError('Failed to load services data');
          setShowFallbackWarning(true);
          setServices(injectBagelService(mockServices));
        } else {
          setServices(injectBagelService(data || []));
        }
      } catch {
        setError('Failed to connect to database');
        setShowFallbackWarning(true);

        const mockServices: Service[] = [
          { service_id: 1, service_name: 'Accounts' },
          { service_id: 2, service_name: 'VAT' },
          { service_id: 3, service_name: 'Self Assessments' },
        ];
        setServices(sortServices([...mockServices, getBagelService()]));
      } finally {
        setLoading(false);
      }
    };

    void fetchServices();
  }, []);

  return { services, loading, error, showFallbackWarning };
};