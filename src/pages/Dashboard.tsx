import { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useReceiptStore } from '@/stores/receiptStore';
import { useAuthStore } from '@/stores/authStore';
import { useOfflineQueue } from '@/hooks/useOfflineQueue';
import { CATEGORIES, formatEur, type CategoryConfig } from '@/lib/categories';
import type { Category } from '@/types';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Camera, AlertCircle, Clock, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export function DashboardPage() {
  const navigate = useNavigate();
  const profile = useAuthStore((s) => s.profile);
  const { receipts, selectedMonth, setSelectedMonth, loading, fetchReceipts } = useReceiptStore();
  const { pendingCount } = useOfflineQueue();

  useEffect(() => {
    fetchReceipts();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const stats = useMemo(() => {
    const totalTtc = receipts.reduce((sum, r) => sum + r.amount_ttc_cents, 0);
    const pendingVerification = receipts.filter((r) => !r.is_verified).length;
    const pendingOcr = receipts.filter((r) => r.scan_status === 'queued' || r.scan_status === 'processing').length;

    const byCategory = Object.entries(CATEGORIES).map(([key, config]: [string, CategoryConfig]) => {
      const catReceipts = receipts.filter((r) => r.category === key);
      const total = catReceipts.reduce((sum, r) => sum + r.amount_ttc_cents, 0);
      return { category: key as Category, config, total, count: catReceipts.length };
    }).filter((c) => c.count > 0);

    return { totalTtc, pendingVerification, pendingOcr, byCategory };
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

  return (
    <div className="px-4 py-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">
          Bonjour{profile?.full_name ? `, ${profile.full_name}` : ''}
        </h1>
        <p className="text-sm text-gray-500">Notes de frais</p>
      </div>

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

      {/* Total */}
      <div className="mb-4 rounded-xl bg-blue-600 p-6 text-white shadow-sm">
        <p className="text-sm opacity-80">Total du mois</p>
        <p className="text-3xl font-bold">{formatEur(stats.totalTtc)}</p>
        <p className="mt-1 text-sm opacity-80">{receipts.length} ticket{receipts.length !== 1 ? 's' : ''}</p>
      </div>

      {/* Quick stats */}
      <div className="mb-4 grid grid-cols-3 gap-3">
        {pendingCount > 0 && (
          <div className="rounded-xl bg-amber-50 p-3 text-center">
            <Clock size={20} className="mx-auto mb-1 text-amber-600" />
            <p className="text-lg font-bold text-amber-700">{pendingCount}</p>
            <p className="text-xs text-amber-600">En attente</p>
          </div>
        )}
        {stats.pendingOcr > 0 && (
          <div className="rounded-xl bg-purple-50 p-3 text-center">
            <Clock size={20} className="mx-auto mb-1 text-purple-600" />
            <p className="text-lg font-bold text-purple-700">{stats.pendingOcr}</p>
            <p className="text-xs text-purple-600">OCR en cours</p>
          </div>
        )}
        {stats.pendingVerification > 0 && (
          <div className="rounded-xl bg-orange-50 p-3 text-center">
            <AlertCircle size={20} className="mx-auto mb-1 text-orange-600" />
            <p className="text-lg font-bold text-orange-700">{stats.pendingVerification}</p>
            <p className="text-xs text-orange-600">Non vérifiés</p>
          </div>
        )}
      </div>

      {/* Category breakdown */}
      {stats.byCategory.length > 0 && (
        <div className="mb-4 rounded-xl bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-gray-500 uppercase">Par catégorie</h2>
          <div className="space-y-3">
            {stats.byCategory.map(({ category, config, total, count }) => (
              <button
                key={category}
                onClick={() => navigate(`/receipts?category=${category}`)}
                className="flex w-full items-center justify-between rounded-lg p-2 hover:bg-gray-50"
              >
                <div>
                  <p className="text-sm font-medium text-gray-900">{config.label}</p>
                  <p className="text-xs text-gray-500">{count} ticket{count !== 1 ? 's' : ''}</p>
                </div>
                <span className="font-semibold text-gray-900">{formatEur(total)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Quick action */}
      <Button onClick={() => navigate('/capture')} className="w-full gap-2" size="lg">
        <Camera size={20} />
        Capturer un ticket
      </Button>

      {loading && (
        <p className="mt-4 text-center text-sm text-gray-400">Chargement...</p>
      )}
    </div>
  );
}
