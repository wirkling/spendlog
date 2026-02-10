import type { Receipt } from '@/types';
import { CATEGORIES, formatEur } from '@/lib/categories';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { CheckCircle, Clock, AlertCircle, Loader } from 'lucide-react';

const statusIcons = {
  queued: Clock,
  processing: Loader,
  completed: CheckCircle,
  failed: AlertCircle,
};

const statusColors = {
  queued: 'text-gray-400',
  processing: 'text-blue-500 animate-spin',
  completed: 'text-green-500',
  failed: 'text-red-500',
};

interface ReceiptCardProps {
  receipt: Receipt;
  onClick: () => void;
}

export function ReceiptCard({ receipt, onClick }: ReceiptCardProps) {
  const config = CATEGORIES[receipt.category];
  const StatusIcon = statusIcons[receipt.scan_status];

  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-xl bg-white p-3 text-left shadow-sm hover:shadow-md transition-shadow"
    >
      {receipt.image_path ? (
        <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-gray-100">
          <div className="flex h-full w-full items-center justify-center text-xs text-gray-400">IMG</div>
        </div>
      ) : (
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-xs text-gray-400">
          N/A
        </div>
      )}

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="rounded bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
            {config.shortLabel}
          </span>
          {receipt.is_verified && (
            <CheckCircle size={14} className="text-green-500" />
          )}
        </div>
        <p className="mt-1 text-sm font-medium text-gray-900 truncate">
          {format(new Date(receipt.receipt_date + 'T00:00:00'), 'dd MMMM', { locale: fr })}
          {receipt.company_name && ` - ${receipt.company_name}`}
          {receipt.designation && ` - ${receipt.designation}`}
        </p>
      </div>

      <div className="shrink-0 text-right">
        <p className="text-sm font-semibold text-gray-900">{formatEur(receipt.amount_ttc_cents)}</p>
        <StatusIcon size={14} className={statusColors[receipt.scan_status]} />
      </div>
    </button>
  );
}
