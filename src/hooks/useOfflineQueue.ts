import { useState, useEffect, useCallback } from 'react';
import { getQueueCount, syncQueue, setupAutoSync } from '@/lib/offline-queue';

export function useOfflineQueue() {
  const [pendingCount, setPendingCount] = useState(0);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);

  const refreshCount = useCallback(async () => {
    const count = await getQueueCount();
    setPendingCount(count);
  }, []);

  useEffect(() => {
    refreshCount();

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const cleanup = setupAutoSync(async (result) => {
      await refreshCount();
      if (result.synced > 0) {
        console.log(`Synced ${result.synced} receipts`);
      }
    });

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      cleanup();
    };
  }, [refreshCount]);

  const manualSync = useCallback(async () => {
    if (isSyncing || !isOnline) return;
    setIsSyncing(true);
    try {
      const result = await syncQueue();
      await refreshCount();
      return result;
    } finally {
      setIsSyncing(false);
    }
  }, [isSyncing, isOnline, refreshCount]);

  return { pendingCount, isOnline, isSyncing, manualSync, refreshCount };
}
