import { useCallback } from 'react';

export const useRefresh = (callback: () => void | Promise<void>) => {
  const handleRefresh = useCallback(async () => {
    try {
      await callback();
    } catch {
      return;
    }
  }, [callback]);

  return { refresh: handleRefresh };
};