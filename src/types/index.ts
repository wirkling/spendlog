export type Category =
  | 'gasoil'
  | 'restaurants_autoroute'
  | 'mission_receptions'
  | 'hotels_transport'
  | 'entretien_vehicules'
  | 'fournitures_bureaux'
  | 'divers'
  | 'salons';

export type ScanStatus = 'queued' | 'processing' | 'completed' | 'failed';

export type SalonSubType = 'salons' | 'sirha' | 'siprho';

export interface Receipt {
  id: string;
  user_id: string;
  receipt_date: string; // YYYY-MM-DD
  category: Category;
  amount_ttc_cents: number;
  amount_tva_cents: number | null;
  amount_ht_cents: number;
  company_name: string | null; // for mission_receptions
  designation: string | null; // for divers
  divers_account_code: string | null; // for divers sub-account
  salon_sub_type: SalonSubType | null; // for salons
  image_path: string | null;
  scan_status: ScanStatus;
  ocr_raw_result: Record<string, unknown> | null;
  is_verified: boolean;
  created_at: string;
  updated_at: string;
}

export interface ScanJob {
  id: string;
  receipt_id: string;
  image_path: string;
  status: ScanStatus;
  result: OcrResult | null;
  confidence: number | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface OcrResult {
  vendor_name?: string;
  total_ttc?: number; // in euros (decimal)
  tva_amount?: number;
  date?: string;
  raw_text?: string;
  confidence: number;
}

export interface PendingUpload {
  id: string;
  imageBlob: Blob;
  receipt_date: string;
  category: Category;
  company_name?: string;
  designation?: string;
  divers_account_code?: string;
  salon_sub_type?: SalonSubType;
  created_at: string;
  retryCount: number;
}

export interface Profile {
  id: string;
  user_id: string;
  full_name: string;
  employee_id: string | null;
}

export interface ExportRecord {
  id: string;
  user_id: string;
  month: string; // YYYY-MM
  file_name: string;
  created_at: string;
}

export interface MonthlyExportData {
  month: Date;
  userName: string;
  receipts: Receipt[];
}
