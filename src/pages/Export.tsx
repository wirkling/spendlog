import { useState, useEffect, useMemo } from 'react';
import { useReceiptStore } from '@/stores/receiptStore';
import { useAuthStore } from '@/stores/authStore';
import { downloadExcel } from '@/lib/excel-export';
import { downloadZip } from '@/lib/zip-export';
import { CATEGORIES, formatEur } from '@/lib/categories';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, FileSpreadsheet, FolderArchive } from 'lucide-react';
import type { Category } from '@/types';

export function ExportPage() {
  const { showToast } = useToast();
  const { receipts, selectedMonth, setSelectedMonth, fetchReceipts, loading } = useReceiptStore();
  const profile = useAuthStore((s) => s.profile);
  const [exporting, setExporting] = useState(false);
  const [zipProgress, setZipProgress] = useState(0);

  useEffect(() => {
    fetchReceipts();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const stats = useMemo(() => {
    const total = receipts.reduce((s, r) => s + r.amount_ttc_cents, 0);
    const byCategory = Object.entries(CATEGORIES).map(([key, config]) => {
      const catReceipts = receipts.filter((r) => r.category === key);
      return {
        key: key as Category,
        label: config.label,
        total: catReceipts.reduce((s, r) => s + r.amount_ttc_cents, 0),
        count: catReceipts.length,
      };
    }).filter((c) => c.count > 0);

    const unverified = receipts.filter((r) => !r.is_verified).length;
    return { total, byCategory, unverified, count: receipts.length };
  }, [receipts]);

  const prevMonth = () => {
    const d = new Date(selectedMonth);
    d.setMonth(d.getMonth() - 1);
    setSelectedMonth(d);
  };

  const nextMonth = () => {
    const d = new Date(selectedMonth);
    d.setMonth(d.getMonth() + 1);
    setSelectedMonth(d);
  };

  const handleExportExcel = async () => {
    setExporting(true);
    try {
      downloadExcel({
        month: selectedMonth,
        userName: profile?.full_name || '',
        receipts,
      });
      showToast('Excel exporté', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erreur', 'error');
    } finally {
      setExporting(false);
    }
  };

  const handleExportZip = async () => {
    setExporting(true);
    setZipProgress(0);
    try {
      await downloadZip(
        { month: selectedMonth, userName: profile?.full_name || '', receipts },
        setZipProgress,
      );
      showToast('ZIP exporté', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erreur', 'error');
    } finally {
      setExporting(false);
      setZipProgress(0);
    }
  };

  return (
    <div className="px-4 py-6">
      <h1 className="mb-4 text-xl font-bold text-gray-900">Export</h1>

      {/* Month selector */}
      <div className="mb-6 flex items-center justify-between rounded-xl bg-white p-4 shadow-sm">
        <button onClick={prevMonth} className="rounded-lg p-2 hover:bg-gray-100">
          <ChevronLeft size={20} />
        </button>
        <span className="text-lg font-semibold capitalize text-gray-900">
          {format(selectedMonth, 'MMMM yyyy', { locale: fr })}
        </span>
        <button onClick={nextMonth} className="rounded-lg p-2 hover:bg-gray-100">
          <ChevronRight size={20} />
        </button>
      </div>

      {/* Summary */}
      <div className="mb-4 rounded-xl bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-gray-500 uppercase">Résumé</h2>
        {loading ? (
          <p className="text-sm text-gray-400">Chargement...</p>
        ) : stats.count === 0 ? (
          <p className="text-sm text-gray-500">Aucun ticket ce mois-ci</p>
        ) : (
          <>
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm text-gray-600">Total TTC</span>
              <span className="text-lg font-bold text-gray-900">{formatEur(stats.total)}</span>
            </div>
            <div className="space-y-2">
              {stats.byCategory.map((cat) => (
                <div key={cat.key} className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">{cat.label} ({cat.count})</span>
                  <span className="font-medium text-gray-900">{formatEur(cat.total)}</span>
                </div>
              ))}
            </div>
            {stats.unverified > 0 && (
              <p className="mt-3 text-xs text-amber-600">
                {stats.unverified} ticket{stats.unverified > 1 ? 's' : ''} non vérifié{stats.unverified > 1 ? 's' : ''}
              </p>
            )}
          </>
        )}
      </div>

      {/* Export buttons */}
      <div className="space-y-3">
        <Button
          onClick={handleExportExcel}
          loading={exporting}
          disabled={stats.count === 0}
          className="w-full gap-2"
          size="lg"
        >
          <FileSpreadsheet size={20} />
          Exporter Excel
        </Button>

        <Button
          onClick={handleExportZip}
          loading={exporting}
          disabled={stats.count === 0}
          variant="secondary"
          className="w-full gap-2"
          size="lg"
        >
          <FolderArchive size={20} />
          Exporter ZIP (Excel + Justificatifs)
        </Button>

        {zipProgress > 0 && zipProgress < 100 && (
          <div className="w-full rounded-full bg-gray-200">
            <div
              className="rounded-full bg-blue-600 py-1 text-center text-xs text-white transition-all"
              style={{ width: `${zipProgress}%` }}
            >
              {zipProgress}%
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
