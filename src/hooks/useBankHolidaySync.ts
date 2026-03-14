import { useState, useEffect } from 'react';
import { supabase } from '../supabase/client';

const LAST_SYNC_KEY = 'bank_holidays_last_sync';

interface GovHolidayEvent {
  title: string;
  date: string;
  notes?: string;
  bunting?: boolean;
}

interface GovHolidayDivision {
  events: GovHolidayEvent[];
}

type GovHolidayResponse = Record<string, GovHolidayDivision>;

type BankHolidayInsert = {
  date: string;
  title: string;
  region: string;
  notes: string | null;
  bunting: boolean;
  source: string;
};

export const useBankHolidaySync = () => {
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const shouldSync = () => {
    const lastSync = localStorage.getItem(LAST_SYNC_KEY);
    if (!lastSync) return true;

    const lastSyncDate = new Date(lastSync);
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    const lastSyncMonth = lastSyncDate.getMonth();
    const lastSyncYear = lastSyncDate.getFullYear();

    return currentYear > lastSyncYear ||
      (currentYear === lastSyncYear && currentMonth > lastSyncMonth);
  };

  const syncBankHolidays = async () => {
    setIsSyncing(true);
    setError(null);

    try {
      const response = await fetch('https://www.gov.uk/bank-holidays.json');
      if (!response.ok) {
        throw new Error('Unable to reach gov.uk API');
      }

      const data = (await response.json()) as GovHolidayResponse;
      const regions = ['england-and-wales', 'scotland', 'northern-ireland'];
      const allHolidayInserts: BankHolidayInsert[] = [];

      regions.forEach((region) => {
        const regionData = data[region];
        if (regionData?.events) {
          regionData.events.forEach((holiday) => {
            allHolidayInserts.push({
              date: holiday.date,
              title: holiday.title,
              region,
              notes: holiday.notes || null,
              bunting: holiday.bunting || false,
              source: 'gov.uk',
            });
          });
        }
      });

      if (allHolidayInserts.length > 0) {
        const { error: upsertError } = await supabase
          .from('bank_holidays')
          .upsert(allHolidayInserts, {
            onConflict: 'date,region',
            ignoreDuplicates: false,
          });

        if (upsertError) {
          throw new Error('Failed to save bank holidays');
        }

        localStorage.setItem(LAST_SYNC_KEY, new Date().toISOString());
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sync failed');
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    if (shouldSync()) {
      void syncBankHolidays();
    }
  }, []);

  return { isSyncing, error, syncBankHolidays };
};