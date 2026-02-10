import { useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useReceiptStore } from '@/stores/receiptStore';
import { useAuthStore } from '@/stores/authStore';
import type { ScanJob } from '@/types';

export function useRealtimeScanJob(onComplete?: (job: ScanJob) => void) {
  const user = useAuthStore((s) => s.user);
  const fetchReceipts = useReceiptStore((s) => s.fetchReceipts);

  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('scan-jobs-realtime')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'scan_jobs',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const job = payload.new as ScanJob;
          if (job.status === 'completed' || job.status === 'failed') {
            fetchReceipts();
            onComplete?.(job);
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, fetchReceipts, onComplete]);
}
