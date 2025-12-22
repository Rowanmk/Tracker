import { useEffect, useCallback } from 'react';

export const useRefresh = (callback: () => void | Promise<void>) => {
  const handleRefresh = useCallback(async () => {
    try {
      await callback();
    } catch (error) {
      console.error('Error during refresh:', error);
    }
  }, [callback]);

  useEffect(() => {
    // Hook is kept for backward compatibility but does nothing
    // Refresh functionality has been removed
  }, [handleRefresh]);

  return { refresh: handleRefresh };
};