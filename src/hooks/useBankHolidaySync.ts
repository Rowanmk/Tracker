import { useState, useEffect } from 'react';
    import { supabase } from '../supabase/client';

    const LAST_SYNC_KEY = 'bank_holidays_last_sync';

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
        
        // Check if we're in a new month since last sync
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

          const data = await response.json();
          const regions = ['england-and-wales', 'scotland', 'northern-ireland'];
          const allHolidayInserts: any[] = [];

          regions.forEach(region => {
            const regionData = data[region];
            if (regionData && regionData.events) {
              regionData.events.forEach((holiday: any) => {
                allHolidayInserts.push({
                  date: holiday.date,
                  title: holiday.title,
                  region: region,
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
          console.error('Error syncing bank holidays:', err);
          setError(err instanceof Error ? err.message : 'Sync failed');
        } finally {
          setIsSyncing(false);
        }
      };

      useEffect(() => {
        if (shouldSync()) {
          syncBankHolidays();
        }
      }, []);

      return { isSyncing, error, syncBankHolidays };
    };