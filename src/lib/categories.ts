import type { Category, SalonSubType } from '@/types';

export interface CategoryConfig {
  key: Category;
  label: string;
  shortLabel: string;
  accountCode: string;
  section: string;
  tracksTva: boolean;
  tvaDeductionRate: number; // 1.0 = 100%, 0.8 = 80% (gasoil), 0 = no TVA
  hasCompanyName: boolean;
  hasDesignation: boolean;
  hasDiversAccountCode: boolean;
  hasSalonSubType: boolean;
}

export const CATEGORIES: Record<Category, CategoryConfig> = {
  gasoil: {
    key: 'gasoil',
    label: 'Gasoil',
    shortLabel: 'Gasoil',
    accountCode: '6061400',
    section: '3000',
    tracksTva: true,
    tvaDeductionRate: 0.8,
    hasCompanyName: false,
    hasDesignation: false,
    hasDiversAccountCode: false,
    hasSalonSubType: false,
  },
  restaurants_autoroute: {
    key: 'restaurants_autoroute',
    label: 'Restaurants / Autoroute',
    shortLabel: 'Resto',
    accountCode: '6251000',
    section: '3000',
    tracksTva: true,
    tvaDeductionRate: 1.0,
    hasCompanyName: false,
    hasDesignation: false,
    hasDiversAccountCode: false,
    hasSalonSubType: false,
  },
  mission_receptions: {
    key: 'mission_receptions',
    label: 'Mission / Réceptions',
    shortLabel: 'Mission',
    accountCode: '6257000',
    section: '3000',
    tracksTva: true,
    tvaDeductionRate: 1.0,
    hasCompanyName: true,
    hasDesignation: false,
    hasDiversAccountCode: false,
    hasSalonSubType: false,
  },
  hotels_transport: {
    key: 'hotels_transport',
    label: 'Hôtels / Transport',
    shortLabel: 'Hôtels',
    accountCode: '6256000',
    section: '3000',
    tracksTva: false,
    tvaDeductionRate: 0,
    hasCompanyName: false,
    hasDesignation: false,
    hasDiversAccountCode: false,
    hasSalonSubType: false,
  },
  entretien_vehicules: {
    key: 'entretien_vehicules',
    label: 'Entretien Véhicules',
    shortLabel: 'Ent.Véh',
    accountCode: '6155000',
    section: '9000',
    tracksTva: false,
    tvaDeductionRate: 0,
    hasCompanyName: false,
    hasDesignation: false,
    hasDiversAccountCode: false,
    hasSalonSubType: false,
  },
  fournitures_bureaux: {
    key: 'fournitures_bureaux',
    label: 'Fournitures Bureaux',
    shortLabel: 'Fourn.Bur',
    accountCode: '6064000',
    section: '3000',
    tracksTva: true,
    tvaDeductionRate: 1.0,
    hasCompanyName: false,
    hasDesignation: false,
    hasDiversAccountCode: false,
    hasSalonSubType: false,
  },
  divers: {
    key: 'divers',
    label: 'Divers',
    shortLabel: 'Divers',
    accountCode: '6068000',
    section: '3000',
    tracksTva: true,
    tvaDeductionRate: 1.0,
    hasCompanyName: false,
    hasDesignation: true,
    hasDiversAccountCode: true,
    hasSalonSubType: false,
  },
  salons: {
    key: 'salons',
    label: 'Salons',
    shortLabel: 'Salons',
    accountCode: '6233000',
    section: '9500',
    tracksTva: true,
    tvaDeductionRate: 1.0,
    hasCompanyName: false,
    hasDesignation: false,
    hasDiversAccountCode: false,
    hasSalonSubType: true,
  },
};

export const CATEGORY_LIST = Object.values(CATEGORIES);

export interface DiversSubAccount {
  code: string;
  label: string;
  section: string;
}

export const DIVERS_SUB_ACCOUNTS: DiversSubAccount[] = [
  { code: '6155400', label: 'Maintenance', section: '9000' },
  { code: '4010000', label: 'Fournisseurs', section: '3000' },
  { code: '5800000', label: 'Virements internes', section: '3000' },
  { code: '6276000', label: 'Frais bancaires', section: '3000' },
  { code: '6063100', label: 'Produits d\'entretien', section: '3000' },
  { code: '6353000', label: 'Vignette Suisse', section: '3000' },
  { code: '6234000', label: 'Cadeaux clients', section: '3000' },
  { code: '6378010', label: 'Douane', section: '3000' },
  { code: '6063000', label: 'Outillage', section: '3000' },
  { code: '6068000', label: 'Échantillons', section: '3000' },
  { code: '6135430', label: 'Location véhicule', section: '9000' },
  { code: '6261000', label: 'Affranchissement', section: '3000' },
];

export interface SalonSubTypeConfig {
  key: SalonSubType;
  label: string;
  accountCode: string;
  section: string;
}

export const SALON_SUB_TYPES: SalonSubTypeConfig[] = [
  { key: 'salons', label: 'Salons', accountCode: '6233000', section: '9500' },
  { key: 'sirha', label: 'SIRHA', accountCode: '6233001', section: '9500' },
  { key: 'siprho', label: 'SIPRHO', accountCode: '6233002', section: '9500' },
];

export function formatEur(cents: number): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
  }).format(cents / 100);
}

export function centsToEuros(cents: number): number {
  return cents / 100;
}

export function eurosToCents(euros: number): number {
  return Math.round(euros * 100);
}
