import { useCallback, useEffect } from 'react';

export const useRefresh = (callback: () => void | Promise<void>) => {
  const handleRefresh = useCallback(async () => {
    try {
      await callback();
    } catch {
      return;
    }
  }, [callback]);

  useEffect(() => {
    return;
  }, [handleRefresh]);

  return { refresh: handleRefresh };
};