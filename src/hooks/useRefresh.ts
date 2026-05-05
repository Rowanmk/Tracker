import { useCallback, useEffect } from 'react';

export const useRefresh = (callback: () => void | Promise<void>) => {
  const handleRefresh = useCallback(async () => {
    try {
      await callback();
    } catch (err) {
      // FIX 6: Log caught errors with file context.
      // PRE-FIX-6: catch {} with no parameter and no logging.
      console.error('[useRefresh] refresh callback:', err);
      return;
    }
  }, [callback]);

  useEffect(() => {
    return;
  }, [handleRefresh]);

  return { refresh: handleRefresh };
};