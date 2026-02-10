import * as XLSX from 'xlsx';
import { format, getDaysInMonth } from 'date-fns';
import { fr } from 'date-fns/locale';
import type { Receipt, Category, MonthlyExportData } from '@/types';
import {
  CATEGORIES,
  DIVERS_SUB_ACCOUNTS,
  SALON_SUB_TYPES,
  centsToEuros,
} from './categories';

// Column layout for TABLEAU A REMPLIR (0-indexed):
// A=Jour, B=Gasoil TTC, C=Gasoil TVA, D=Resto TTC, E=Resto TVA,
// F=Mission TTC, G=Mission TVA, H=Mission Société, I=(blank),
// J=Hotels TTC, K=Ent.Véh TTC, L=Fourn.Bur TTC, M=Fourn.Bur TVA,
// N=Divers TTC, O=Divers TVA, P=Divers Désignation, Q=Salons TTC, R=Salons TVA

interface DayRow {
  [col: string]: number | string;
}

function aggregateByDay(receipts: Receipt[], month: Date): Map<number, DayRow> {
  const days = new Map<number, DayRow>();

  for (const r of receipts) {
    const d = new Date(r.receipt_date + 'T00:00:00');
    if (d.getMonth() !== month.getMonth() || d.getFullYear() !== month.getFullYear()) continue;

    const day = d.getDate();
    if (!days.has(day)) {
      days.set(day, {});
    }
    const row = days.get(day)!;

    const ttc = centsToEuros(r.amount_ttc_cents);
    const tva = r.amount_tva_cents != null ? centsToEuros(r.amount_tva_cents) : 0;

    switch (r.category) {
      case 'gasoil':
        row['B'] = ((row['B'] as number) || 0) + ttc;
        row['C'] = ((row['C'] as number) || 0) + tva;
        break;
      case 'restaurants_autoroute':
        row['D'] = ((row['D'] as number) || 0) + ttc;
        row['E'] = ((row['E'] as number) || 0) + tva;
        break;
      case 'mission_receptions':
        row['F'] = ((row['F'] as number) || 0) + ttc;
        row['G'] = ((row['G'] as number) || 0) + tva;
        // For company names, concatenate multiple with "/"
        if (r.company_name) {
          row['H'] = row['H'] ? `${row['H']} / ${r.company_name}` : r.company_name;
        }
        break;
      case 'hotels_transport':
        row['J'] = ((row['J'] as number) || 0) + ttc;
        break;
      case 'entretien_vehicules':
        row['K'] = ((row['K'] as number) || 0) + ttc;
        break;
      case 'fournitures_bureaux':
        row['L'] = ((row['L'] as number) || 0) + ttc;
        row['M'] = ((row['M'] as number) || 0) + tva;
        break;
      case 'divers':
        row['N'] = ((row['N'] as number) || 0) + ttc;
        row['O'] = ((row['O'] as number) || 0) + tva;
        if (r.designation) {
          row['P'] = row['P'] ? `${row['P']} / ${r.designation}` : r.designation;
        }
        break;
      case 'salons':
        row['Q'] = ((row['Q'] as number) || 0) + ttc;
        row['R'] = ((row['R'] as number) || 0) + tva;
        break;
    }
  }

  return days;
}

function colToIdx(col: string): number {
  return col.charCodeAt(0) - 65; // A=0, B=1, ...
}

function buildTableauARemplir(data: MonthlyExportData): XLSX.WorkSheet {
  const { month, userName, receipts } = data;
  const daysInMonth = getDaysInMonth(month);
  const monthName = format(month, 'MMMM yyyy', { locale: fr });

  const ws: XLSX.WorkSheet = {};
  const merges: XLSX.Range[] = [];

  // Helper to set cell
  const setCell = (r: number, c: number, v: string | number, style?: Record<string, unknown>) => {
    const ref = XLSX.utils.encode_cell({ r, c });
    const cell: XLSX.CellObject = typeof v === 'number'
      ? { t: 'n', v, ...style }
      : { t: 's', v, ...style };
    ws[ref] = cell;
  };

  const setFormula = (r: number, c: number, f: string) => {
    const ref = XLSX.utils.encode_cell({ r, c });
    ws[ref] = { t: 'n', f };
  };

  // Row 0: NOM COMMERCIAL + MOIS
  setCell(0, 0, 'NOM COMMERCIAL :');
  setCell(0, 1, userName);
  setCell(0, 10, 'MOIS :');
  setCell(0, 11, monthName);

  // Row 1: SECTION
  setCell(1, 0, 'SECTION :');

  // Row 3: "Payé par Carte Bleue"
  setCell(3, 0, 'Payé par Carte Bleue');

  // Row 5-6: Category headers
  // Row 5: main category names
  const headers5: [number, string][] = [
    [0, 'Jour'],
    [1, 'Gasoil'],
    [3, 'Restaurants / Autoroute'],
    [5, 'Mission / Réceptions'],
    [9, 'Hôtels / Transport'],
    [10, 'Entretien Véhicules'],
    [11, 'Fournitures Bureaux'],
    [13, 'Divers'],
    [16, 'Salons'],
  ];
  for (const [c, v] of headers5) {
    setCell(5, c, v);
  }

  // Row 6: sub-headers
  const headers6: [number, string][] = [
    [1, 'Montant TTC'],
    [2, 'dont TVA'],
    [3, 'Montant TTC'],
    [4, 'dont TVA'],
    [5, 'Montant TTC'],
    [6, 'dont TVA'],
    [7, 'Nom Entreprises'],
    [9, 'Montant TTC'],
    [10, 'Montant TTC'],
    [11, 'Montant TTC'],
    [12, 'dont TVA'],
    [13, 'Montant TTC'],
    [14, 'dont TVA'],
    [15, 'Désignation du divers'],
    [16, 'Montant TTC'],
    [17, 'dont TVA'],
  ];
  for (const [c, v] of headers6) {
    setCell(6, c, v);
  }

  // Rows 7-37 (or up to 37): Days 1..31
  const dayData = aggregateByDay(receipts, month);
  const dataStartRow = 7;
  const numCols = ['B', 'C', 'D', 'E', 'F', 'G', 'J', 'K', 'L', 'M', 'N', 'O', 'Q', 'R'];
  const textCols = ['H', 'P'];

  for (let day = 1; day <= daysInMonth; day++) {
    const row = dataStartRow + day - 1;
    setCell(row, 0, day);

    const dayRow = dayData.get(day);
    if (dayRow) {
      for (const col of numCols) {
        const val = dayRow[col];
        if (val && typeof val === 'number' && val !== 0) {
          setCell(row, colToIdx(col), Math.round(val * 100) / 100);
        }
      }
      for (const col of textCols) {
        const val = dayRow[col];
        if (val && typeof val === 'string') {
          setCell(row, colToIdx(col), val);
        }
      }
    }
  }

  // Sum row (after last day)
  const sumRow = dataStartRow + daysInMonth;
  setCell(sumRow, 0, 'TOTAL');
  for (const col of numCols) {
    const c = colToIdx(col);
    const colLetter = col;
    const firstDataRow = dataStartRow + 1; // 1-indexed for formula
    const lastDataRow = dataStartRow + daysInMonth;
    setFormula(sumRow, c, `SUM(${colLetter}${firstDataRow}:${colLetter}${lastDataRow})`);
  }

  // Grand total row (2 rows after sum)
  const grandTotalRow = sumRow + 2;
  setCell(grandTotalRow, 0, 'TOTAL GENERAL');
  // Sum of all TTC columns: B, D, F, J, K, L, N, Q
  const ttcCols = ['B', 'D', 'F', 'J', 'K', 'L', 'N', 'Q'];
  const sumRowExcel = sumRow + 1; // 1-indexed
  const sumRefs = ttcCols.map((c) => `${c}${sumRowExcel}`).join('+');
  setFormula(grandTotalRow, 1, sumRefs);

  // Set worksheet range
  ws['!ref'] = XLSX.utils.encode_range({
    s: { r: 0, c: 0 },
    e: { r: grandTotalRow, c: 17 },
  });

  // Column widths
  ws['!cols'] = [
    { wch: 6 },   // A: Jour
    { wch: 12 },  // B: Gasoil TTC
    { wch: 10 },  // C: Gasoil TVA
    { wch: 12 },  // D: Resto TTC
    { wch: 10 },  // E: Resto TVA
    { wch: 12 },  // F: Mission TTC
    { wch: 10 },  // G: Mission TVA
    { wch: 18 },  // H: Société
    { wch: 3 },   // I: blank
    { wch: 12 },  // J: Hotels TTC
    { wch: 12 },  // K: Ent.Véh TTC
    { wch: 12 },  // L: Fourn.Bur TTC
    { wch: 10 },  // M: Fourn.Bur TVA
    { wch: 12 },  // N: Divers TTC
    { wch: 10 },  // O: Divers TVA
    { wch: 18 },  // P: Désignation
    { wch: 12 },  // Q: Salons TTC
    { wch: 10 },  // R: Salons TVA
  ];

  ws['!merges'] = merges;

  return ws;
}

interface ComptaRow {
  code: string;
  label: string;
  section: string;
  ttcCents: number;
  tvaCents: number;
  tva80Cents: number; // only for gasoil
  htCents: number;
}

function buildTableauCompta(data: MonthlyExportData): XLSX.WorkSheet {
  const { receipts } = data;
  const ws: XLSX.WorkSheet = {};

  const setCell = (r: number, c: number, v: string | number) => {
    const ref = XLSX.utils.encode_cell({ r, c });
    ws[ref] = typeof v === 'number' ? { t: 'n', v } : { t: 's', v };
  };

  // Headers
  setCell(0, 0, 'TABLEAU COMPTA');
  const headers = ['Code', 'Libellé', 'Section', 'TTC', 'TVA', 'TVA 80%', 'HT'];
  headers.forEach((h, i) => setCell(2, i, h));

  const rows: ComptaRow[] = [];

  // Standard categories (non-divers, non-salons)
  const standardCategories: Category[] = [
    'gasoil', 'restaurants_autoroute', 'mission_receptions',
    'hotels_transport', 'entretien_vehicules', 'fournitures_bureaux',
  ];

  for (const catKey of standardCategories) {
    const config = CATEGORIES[catKey];
    const catReceipts = receipts.filter((r) => r.category === catKey);
    if (catReceipts.length === 0) continue;

    const ttcCents = catReceipts.reduce((s, r) => s + r.amount_ttc_cents, 0);
    const tvaCents = catReceipts.reduce((s, r) => s + (r.amount_tva_cents || 0), 0);
    const tva80Cents = catKey === 'gasoil' ? Math.round(tvaCents * 0.8) : 0;
    const htCents = catKey === 'gasoil'
      ? ttcCents - tva80Cents
      : ttcCents - tvaCents;

    rows.push({
      code: config.accountCode,
      label: config.label,
      section: config.section,
      ttcCents,
      tvaCents,
      tva80Cents,
      htCents,
    });
  }

  // Divers: separate row per sub-account
  const diversReceipts = receipts.filter((r) => r.category === 'divers');
  if (diversReceipts.length > 0) {
    // Group by divers_account_code
    const byAccount = new Map<string, Receipt[]>();
    for (const r of diversReceipts) {
      const code = r.divers_account_code || CATEGORIES.divers.accountCode;
      if (!byAccount.has(code)) byAccount.set(code, []);
      byAccount.get(code)!.push(r);
    }

    for (const [code, accountReceipts] of byAccount) {
      const subAccount = DIVERS_SUB_ACCOUNTS.find((a) => a.code === code);
      const ttcCents = accountReceipts.reduce((s, r) => s + r.amount_ttc_cents, 0);
      const tvaCents = accountReceipts.reduce((s, r) => s + (r.amount_tva_cents || 0), 0);
      rows.push({
        code,
        label: subAccount ? subAccount.label : 'Divers',
        section: subAccount ? subAccount.section : '3000',
        ttcCents,
        tvaCents,
        tva80Cents: 0,
        htCents: ttcCents - tvaCents,
      });
    }
  }

  // Salons: separate row per sub-type
  const salonReceipts = receipts.filter((r) => r.category === 'salons');
  if (salonReceipts.length > 0) {
    const bySubType = new Map<string, Receipt[]>();
    for (const r of salonReceipts) {
      const subType = r.salon_sub_type || 'salons';
      if (!bySubType.has(subType)) bySubType.set(subType, []);
      bySubType.get(subType)!.push(r);
    }

    for (const [subType, subReceipts] of bySubType) {
      const config = SALON_SUB_TYPES.find((s) => s.key === subType);
      const ttcCents = subReceipts.reduce((s, r) => s + r.amount_ttc_cents, 0);
      const tvaCents = subReceipts.reduce((s, r) => s + (r.amount_tva_cents || 0), 0);
      rows.push({
        code: config?.accountCode || '6233000',
        label: config?.label || 'Salons',
        section: config?.section || '9500',
        ttcCents,
        tvaCents,
        tva80Cents: 0,
        htCents: ttcCents - tvaCents,
      });
    }
  }

  // Write rows
  let currentRow = 3;
  for (const row of rows) {
    setCell(currentRow, 0, row.code);
    setCell(currentRow, 1, row.label);
    setCell(currentRow, 2, row.section);
    setCell(currentRow, 3, centsToEuros(row.ttcCents));
    setCell(currentRow, 4, centsToEuros(row.tvaCents));
    setCell(currentRow, 5, centsToEuros(row.tva80Cents));
    setCell(currentRow, 6, centsToEuros(row.htCents));
    currentRow++;
  }

  // Totals row
  currentRow++;
  setCell(currentRow, 1, 'TOTAL');
  const totalTtc = rows.reduce((s, r) => s + r.ttcCents, 0);
  const totalTva = rows.reduce((s, r) => s + r.tvaCents, 0);
  const totalTva80 = rows.reduce((s, r) => s + r.tva80Cents, 0);
  const totalHt = rows.reduce((s, r) => s + r.htCents, 0);
  setCell(currentRow, 3, centsToEuros(totalTtc));
  setCell(currentRow, 4, centsToEuros(totalTva));
  setCell(currentRow, 5, centsToEuros(totalTva80));
  setCell(currentRow, 6, centsToEuros(totalHt));

  ws['!ref'] = XLSX.utils.encode_range({
    s: { r: 0, c: 0 },
    e: { r: currentRow, c: 6 },
  });

  ws['!cols'] = [
    { wch: 12 }, // Code
    { wch: 24 }, // Libellé
    { wch: 10 }, // Section
    { wch: 14 }, // TTC
    { wch: 12 }, // TVA
    { wch: 12 }, // TVA 80%
    { wch: 14 }, // HT
  ];

  return ws;
}

export function generateExcel(data: MonthlyExportData): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();

  const ws1 = buildTableauARemplir(data);
  XLSX.utils.book_append_sheet(wb, ws1, 'TABLEAU A REMPLIR');

  const ws2 = buildTableauCompta(data);
  XLSX.utils.book_append_sheet(wb, ws2, 'TABLEAU COMPTA');

  return wb;
}

export function downloadExcel(data: MonthlyExportData): void {
  const wb = generateExcel(data);
  const monthStr = format(data.month, 'yyyy-MM');
  XLSX.writeFile(wb, `notes-de-frais-${monthStr}.xlsx`);
}
