import { get, set, del, keys } from 'idb-keyval';
import type { PendingUpload } from '@/types';
import { supabase } from '@/lib/supabase';

const QUEUE_PREFIX = 'pending-upload:';

export async function addToQueue(upload: PendingUpload): Promise<void> {
  await set(`${QUEUE_PREFIX}${upload.id}`, upload);
}

export async function removeFromQueue(id: string): Promise<void> {
  await del(`${QUEUE_PREFIX}${id}`);
}

export async function getQueuedUploads(): Promise<PendingUpload[]> {
  const allKeys = await keys();
  const uploadKeys = allKeys.filter((k) =>
    typeof k === 'string' && k.startsWith(QUEUE_PREFIX)
  );
  const uploads: PendingUpload[] = [];
  for (const key of uploadKeys) {
    const item = await get(key);
    if (item) uploads.push(item as PendingUpload);
  }
  return uploads.sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export async function getQueueCount(): Promise<number> {
  const allKeys = await keys();
  return allKeys.filter((k) =>
    typeof k === 'string' && k.startsWith(QUEUE_PREFIX)
  ).length;
}

async function processUpload(upload: PendingUpload): Promise<boolean> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
    const imagePath = `${user.id}/${fileName}`;

    // Upload image
    const { error: uploadError } = await supabase.storage
      .from('receipt-images')
      .upload(imagePath, upload.imageBlob, { contentType: 'image/jpeg' });

    if (uploadError) throw uploadError;

    // Create receipt
    const { data: receipt, error: receiptError } = await supabase
      .from('receipts')
      .insert({
        user_id: user.id,
        receipt_date: upload.receipt_date,
        category: upload.category,
        amount_ttc_cents: 0,
        company_name: upload.company_name || null,
        designation: upload.designation || null,
        divers_account_code: upload.divers_account_code || null,
        salon_sub_type: upload.salon_sub_type || null,
        image_path: imagePath,
        scan_status: 'queued',
      })
      .select()
      .single();

    if (receiptError) throw receiptError;

    // Create scan job
    await supabase.from('scan_jobs').insert({
      receipt_id: receipt.id,
      user_id: user.id,
      image_path: imagePath,
      status: 'queued',
    });

    await removeFromQueue(upload.id);
    return true;
  } catch (err) {
    console.error('Failed to process upload:', err);
    // Increment retry count
    upload.retryCount++;
    await set(`${QUEUE_PREFIX}${upload.id}`, upload);
    return false;
  }
}

export async function syncQueue(): Promise<{ synced: number; failed: number }> {
  const uploads = await getQueuedUploads();
  let synced = 0;
  let failed = 0;

  for (const upload of uploads) {
    if (upload.retryCount >= 3) {
      failed++;
      continue;
    }

    const success = await processUpload(upload);
    if (success) {
      synced++;
    } else {
      failed++;
    }

    // Small delay between uploads
    await new Promise((r) => setTimeout(r, 500));
  }

  return { synced, failed };
}

// Auto-sync when coming online
export function setupAutoSync(onSync?: (result: { synced: number; failed: number }) => void) {
  const handler = async () => {
    const count = await getQueueCount();
    if (count > 0) {
      const result = await syncQueue();
      onSync?.(result);
    }
  };

  window.addEventListener('online', handler);
  return () => window.removeEventListener('online', handler);
}
