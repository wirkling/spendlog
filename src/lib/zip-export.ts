import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import * as XLSX from 'xlsx';
import { format } from 'date-fns';
import { generateExcel } from './excel-export';
import { supabase } from './supabase';
import type { MonthlyExportData } from '@/types';

export async function downloadZip(
  data: MonthlyExportData,
  onProgress?: (progress: number) => void,
): Promise<void> {
  const zip = new JSZip();
  const monthStr = format(data.month, 'yyyy-MM');

  // Generate Excel file
  const wb = generateExcel(data);
  const wbOut = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  zip.file(`notes-de-frais-${monthStr}.xlsx`, wbOut);

  // Download and add receipt images
  const receiptsWithImages = data.receipts.filter((r) => r.image_path);
  const justificatifs = zip.folder('justificatifs');

  for (let i = 0; i < receiptsWithImages.length; i++) {
    const receipt = receiptsWithImages[i];
    if (!receipt.image_path) continue;

    try {
      const { data: blob, error } = await supabase.storage
        .from('receipt-images')
        .download(receipt.image_path);

      if (error || !blob) continue;

      const ext = receipt.image_path.split('.').pop() || 'jpg';
      const fileName = `${receipt.receipt_date}_${receipt.category}_${i + 1}.${ext}`;
      justificatifs!.file(fileName, blob);
    } catch {
      console.error(`Failed to download image for receipt ${receipt.id}`);
    }

    onProgress?.(Math.round(((i + 1) / receiptsWithImages.length) * 100));
  }

  const content = await zip.generateAsync({ type: 'blob' });
  saveAs(content, `notes-de-frais-${monthStr}.zip`);
}
