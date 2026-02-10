import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useReceiptStore } from '@/stores/receiptStore';
import { CATEGORY_LIST } from '@/lib/categories';
import { ReceiptCard } from '@/components/receipts/ReceiptCard';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { Category } from '@/types';

export function ReceiptListPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { receipts, selectedMonth, setSelectedMonth, filters, setFilters, loading, fetchReceipts } = useReceiptStore();

  const categoryFilter = searchParams.get('category') as Category | null;

  useEffect(() => {
    if (categoryFilter) {
      setFilters({ category: categoryFilter });
    }
    fetchReceipts();
  }, [categoryFilter]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const handleCategoryFilter = (cat: Category | undefined) => {
    setFilters({ category: cat });
    if (cat) {
      setSearchParams({ category: cat });
    } else {
      setSearchParams({});
    }
    fetchReceipts();
  };

  const filteredReceipts = filters.category
    ? receipts.filter((r) => r.category === filters.category)
    : receipts;

  return (
    <div className="px-4 py-6">
      <h1 className="mb-4 text-xl font-bold text-gray-900">Tickets</h1>

      {/* Month selector */}
      <div className="mb-4 flex items-center justify-between">
        <button onClick={prevMonth} className="rounded-lg p-2 hover:bg-gray-100">
          <ChevronLeft size={20} />
        </button>
        <span className="text-base font-semibold capitalize text-gray-900">
          {format(selectedMonth, 'MMMM yyyy', { locale: fr })}
        </span>
        <button onClick={nextMonth} className="rounded-lg p-2 hover:bg-gray-100">
          <ChevronRight size={20} />
        </button>
      </div>

      {/* Category filter chips */}
      <div className="mb-4 flex gap-2 overflow-x-auto pb-2">
        <button
          onClick={() => handleCategoryFilter(undefined)}
          className={`shrink-0 rounded-full px-3 py-1 text-sm font-medium
            ${!filters.category ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'}`}
        >
          Tous
        </button>
        {CATEGORY_LIST.map((cat) => (
          <button
            key={cat.key}
            onClick={() => handleCategoryFilter(cat.key)}
            className={`shrink-0 rounded-full px-3 py-1 text-sm font-medium
              ${filters.category === cat.key ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'}`}
          >
            {cat.shortLabel}
          </button>
        ))}
      </div>

      {/* Receipt list */}
      {loading ? (
        <p className="text-center text-sm text-gray-400">Chargement...</p>
      ) : filteredReceipts.length === 0 ? (
        <div className="py-12 text-center">
          <p className="text-sm text-gray-500">Aucun ticket ce mois-ci</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredReceipts.map((receipt) => (
            <ReceiptCard
              key={receipt.id}
              receipt={receipt}
              onClick={() => navigate(`/receipts/${receipt.id}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
