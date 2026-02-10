import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useReceiptStore } from '@/stores/receiptStore';
import { CATEGORIES, DIVERS_SUB_ACCOUNTS, SALON_SUB_TYPES } from '@/lib/categories';
import type { Receipt, Category, SalonSubType } from '@/types';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { useToast } from '@/components/ui/Toast';
import { ArrowLeft, Trash2, RefreshCw, CheckCircle } from 'lucide-react';

export function ReceiptDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { updateReceipt, deleteReceipt, getImageUrl } = useReceiptStore();

  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reanalyzing, setReanalyzing] = useState(false);

  // Form fields
  const [amountTtc, setAmountTtc] = useState('');
  const [amountTva, setAmountTva] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [designation, setDesignation] = useState('');
  const [diversAccountCode, setDiversAccountCode] = useState('');
  const [salonSubType, setSalonSubType] = useState<SalonSubType>('salons');
  const [category, setCategory] = useState<Category>('restaurants_autoroute');
  const [receiptDate, setReceiptDate] = useState('');

  useEffect(() => {
    if (!id) return;
    (async () => {
      const { data, error } = await supabase
        .from('receipts')
        .select('*')
        .eq('id', id)
        .single();

      if (error || !data) {
        showToast('Ticket non trouvé', 'error');
        navigate('/receipts');
        return;
      }

      setReceipt(data);
      setCategory(data.category);
      setReceiptDate(data.receipt_date);
      setAmountTtc((data.amount_ttc_cents / 100).toFixed(2).replace('.', ','));
      setAmountTva(data.amount_tva_cents != null ? (data.amount_tva_cents / 100).toFixed(2).replace('.', ',') : '');
      setCompanyName(data.company_name || '');
      setDesignation(data.designation || '');
      setDiversAccountCode(data.divers_account_code || '');
      setSalonSubType(data.salon_sub_type || 'salons');
      setLoading(false);
    })();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading || !receipt) {
    return <div className="flex h-screen items-center justify-center text-gray-400">Chargement...</div>;
  }

  const categoryConfig = CATEGORIES[category];

  const parseAmount = (value: string): number => {
    const normalized = value.replace(',', '.');
    const euros = parseFloat(normalized);
    if (isNaN(euros)) return 0;
    return Math.round(euros * 100);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateReceipt(receipt.id, {
        category,
        receipt_date: receiptDate,
        amount_ttc_cents: parseAmount(amountTtc),
        amount_tva_cents: categoryConfig.tracksTva ? parseAmount(amountTva) : null,
        company_name: categoryConfig.hasCompanyName ? companyName || null : null,
        designation: categoryConfig.hasDesignation ? designation || null : null,
        divers_account_code: categoryConfig.hasDiversAccountCode ? diversAccountCode || null : null,
        salon_sub_type: categoryConfig.hasSalonSubType ? salonSubType : null,
      });
      showToast('Ticket mis à jour', 'success');
      navigate('/receipts');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erreur', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Supprimer ce ticket ?')) return;
    try {
      await deleteReceipt(receipt.id);
      showToast('Ticket supprimé', 'success');
      navigate('/receipts');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erreur', 'error');
    }
  };

  const handleVerify = async () => {
    try {
      await updateReceipt(receipt.id, { is_verified: !receipt.is_verified });
      setReceipt({ ...receipt, is_verified: !receipt.is_verified });
      showToast(receipt.is_verified ? 'Vérification retirée' : 'Ticket vérifié', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erreur', 'error');
    }
  };

  const handleReanalyze = async () => {
    setReanalyzing(true);
    try {
      const response = await fetch('/.netlify/functions/ocr-enhance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ receipt_id: receipt.id }),
      });
      if (!response.ok) throw new Error('OCR enhancement failed');
      showToast('Ré-analyse lancée', 'info');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erreur', 'error');
    } finally {
      setReanalyzing(false);
    }
  };

  const imageUrl = receipt.image_path ? getImageUrl(receipt.image_path) : null;

  return (
    <div className="px-4 py-6">
      <div className="mb-4 flex items-center gap-3">
        <button onClick={() => navigate('/receipts')} className="rounded-lg p-2 hover:bg-gray-100">
          <ArrowLeft size={20} />
        </button>
        <h1 className="flex-1 text-xl font-bold text-gray-900">Détail du ticket</h1>
        <button onClick={handleDelete} className="rounded-lg p-2 text-red-500 hover:bg-red-50">
          <Trash2 size={20} />
        </button>
      </div>

      {/* Image */}
      {imageUrl && (
        <div className="mb-4 overflow-hidden rounded-xl bg-gray-100">
          <img src={imageUrl} alt="Receipt" className="w-full" />
        </div>
      )}

      {/* Actions */}
      <div className="mb-4 flex gap-2">
        <Button onClick={handleVerify} variant={receipt.is_verified ? 'primary' : 'secondary'} size="sm" className="gap-1">
          <CheckCircle size={16} />
          {receipt.is_verified ? 'Vérifié' : 'Vérifier'}
        </Button>
        {receipt.image_path && (
          <Button onClick={handleReanalyze} loading={reanalyzing} variant="secondary" size="sm" className="gap-1">
            <RefreshCw size={16} />
            Ré-analyser
          </Button>
        )}
      </div>

      {/* Form */}
      <div className="space-y-4">
        <Select
          label="Catégorie"
          value={category}
          onChange={(e) => setCategory(e.target.value as Category)}
          options={Object.values(CATEGORIES).map((c) => ({ value: c.key, label: c.label }))}
        />

        <Input
          label="Date"
          type="date"
          value={receiptDate}
          onChange={(e) => setReceiptDate(e.target.value)}
        />

        <Input
          label="Montant TTC (EUR)"
          type="text"
          inputMode="decimal"
          value={amountTtc}
          onChange={(e) => setAmountTtc(e.target.value)}
          placeholder="0,00"
        />

        {categoryConfig.tracksTva && (
          <Input
            label={`TVA${categoryConfig.tvaDeductionRate < 1 ? ` (${categoryConfig.tvaDeductionRate * 100}% déductible)` : ''}`}
            type="text"
            inputMode="decimal"
            value={amountTva}
            onChange={(e) => setAmountTva(e.target.value)}
            placeholder="0,00"
          />
        )}

        {categoryConfig.hasCompanyName && (
          <Input
            label="Nom de l'entreprise"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
          />
        )}

        {categoryConfig.hasDesignation && (
          <Input
            label="Désignation"
            value={designation}
            onChange={(e) => setDesignation(e.target.value)}
          />
        )}

        {categoryConfig.hasDiversAccountCode && (
          <Select
            label="Sous-compte"
            value={diversAccountCode}
            onChange={(e) => setDiversAccountCode(e.target.value)}
            placeholder="Choisir un sous-compte"
            options={DIVERS_SUB_ACCOUNTS.map((a) => ({
              value: a.code,
              label: `${a.code} - ${a.label}`,
            }))}
          />
        )}

        {categoryConfig.hasSalonSubType && (
          <Select
            label="Type de salon"
            value={salonSubType}
            onChange={(e) => setSalonSubType(e.target.value as SalonSubType)}
            options={SALON_SUB_TYPES.map((s) => ({
              value: s.key,
              label: s.label,
            }))}
          />
        )}

        <Button onClick={handleSave} loading={saving} className="w-full" size="lg">
          Sauvegarder
        </Button>
      </div>
    </div>
  );
}
