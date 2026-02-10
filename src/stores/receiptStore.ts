import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import type { Receipt, Category, SalonSubType } from '@/types';
import { format, startOfMonth, endOfMonth } from 'date-fns';

interface ReceiptFilters {
  category?: Category;
}

interface CreateReceiptData {
  receipt_date: string;
  category: Category;
  amount_ttc_cents: number;
  amount_tva_cents: number | null;
  company_name?: string | null;
  designation?: string | null;
  divers_account_code?: string | null;
  salon_sub_type?: SalonSubType | null;
  image_path?: string | null;
}

interface ReceiptState {
  receipts: Receipt[];
  selectedMonth: Date;
  filters: ReceiptFilters;
  loading: boolean;
  setSelectedMonth: (month: Date) => void;
  setFilters: (filters: ReceiptFilters) => void;
  fetchReceipts: () => Promise<void>;
  createReceipt: (data: CreateReceiptData) => Promise<Receipt>;
  updateReceipt: (id: string, data: Partial<CreateReceiptData & { is_verified: boolean }>) => Promise<void>;
  deleteReceipt: (id: string) => Promise<void>;
  uploadImage: (file: Blob, fileName: string) => Promise<string>;
  getImageUrl: (path: string) => string;
}

export const useReceiptStore = create<ReceiptState>((set, get) => ({
  receipts: [],
  selectedMonth: startOfMonth(new Date()),
  filters: {},
  loading: false,

  setSelectedMonth: (month: Date) => {
    set({ selectedMonth: startOfMonth(month) });
    get().fetchReceipts();
  },

  setFilters: (filters: ReceiptFilters) => {
    set({ filters });
  },

  fetchReceipts: async () => {
    set({ loading: true });
    const { selectedMonth } = get();
    const monthStart = format(startOfMonth(selectedMonth), 'yyyy-MM-dd');
    const monthEnd = format(endOfMonth(selectedMonth), 'yyyy-MM-dd');

    let query = supabase
      .from('receipts')
      .select('*')
      .gte('receipt_date', monthStart)
      .lte('receipt_date', monthEnd)
      .order('receipt_date', { ascending: true })
      .order('created_at', { ascending: true });

    const { filters } = get();
    if (filters.category) {
      query = query.eq('category', filters.category);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Failed to fetch receipts:', error);
      set({ loading: false });
      return;
    }

    set({ receipts: data ?? [], loading: false });
  },

  createReceipt: async (data: CreateReceiptData) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data: receipt, error } = await supabase
      .from('receipts')
      .insert({
        user_id: user.id,
        ...data,
        scan_status: data.image_path ? 'queued' : 'completed',
      })
      .select()
      .single();

    if (error) throw error;

    // Create scan job and trigger OCR if image was uploaded
    if (data.image_path) {
      await supabase.from('scan_jobs').insert({
        receipt_id: receipt.id,
        user_id: user.id,
        image_path: data.image_path,
        status: 'queued',
      });

      // Fire-and-forget OCR call to Netlify Function
      fetch('/.netlify/functions/ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ receipt_id: receipt.id }),
      }).catch(() => {}); // Non-blocking; realtime subscription will pick up the result
    }

    await get().fetchReceipts();
    return receipt;
  },

  updateReceipt: async (id, data) => {
    const { error } = await supabase
      .from('receipts')
      .update(data)
      .eq('id', id);

    if (error) throw error;
    await get().fetchReceipts();
  },

  deleteReceipt: async (id) => {
    const { error } = await supabase
      .from('receipts')
      .delete()
      .eq('id', id);

    if (error) throw error;
    await get().fetchReceipts();
  },

  uploadImage: async (file: Blob, fileName: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const path = `${user.id}/${fileName}`;
    const { error } = await supabase.storage
      .from('receipt-images')
      .upload(path, file, { contentType: file.type || 'image/jpeg' });

    if (error) throw error;
    return path;
  },

  getImageUrl: (path: string) => {
    const { data } = supabase.storage
      .from('receipt-images')
      .getPublicUrl(path);
    return data.publicUrl;
  },
}));
