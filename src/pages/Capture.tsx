import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCamera } from '@/hooks/useCamera';
import { useReceiptStore } from '@/stores/receiptStore';
import { useOfflineQueue } from '@/hooks/useOfflineQueue';
import { addToQueue } from '@/lib/offline-queue';
import { CATEGORY_LIST, DIVERS_SUB_ACCOUNTS, SALON_SUB_TYPES, CATEGORIES } from '@/lib/categories';
import type { Category, SalonSubType, PendingUpload } from '@/types';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { useToast } from '@/components/ui/Toast';
import { Camera, RotateCcw, Check, Upload, X } from 'lucide-react';
import { format } from 'date-fns';

type CaptureStep = 'camera' | 'preview' | 'details';

export function CapturePage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { videoRef, canvasRef, isStreaming, error: cameraError, startCamera, stopCamera, capturePhoto } = useCamera();
  const { createReceipt, uploadImage } = useReceiptStore();
  const { isOnline, refreshCount } = useOfflineQueue();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<CaptureStep>('camera');
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [scanning, setScanning] = useState(false);

  // Form state
  const [category, setCategory] = useState<Category>('restaurants_autoroute');
  const [receiptDate, setReceiptDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [amountTtc, setAmountTtc] = useState('');
  const [amountTva, setAmountTva] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [designation, setDesignation] = useState('');
  const [diversAccountCode, setDiversAccountCode] = useState('');
  const [salonSubType, setSalonSubType] = useState<SalonSubType>('salons');

  useEffect(() => {
    startCamera();
    return () => stopCamera();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCapture = () => {
    const blob = capturePhoto();
    if (blob) {
      setCapturedBlob(blob);
      setPreviewUrl(URL.createObjectURL(blob));
      setStep('preview');
      stopCamera();
    }
  };

  const handleRetake = () => {
    setCapturedBlob(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setStep('camera');
    startCamera();
  };

  const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = reader.result as string;
        resolve(dataUrl.split(',')[1]);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  const handleUsePhoto = async () => {
    setStep('details');

    if (!capturedBlob || !isOnline) return;

    setScanning(true);
    try {
      const base64 = await blobToBase64(capturedBlob);
      const response = await fetch('/.netlify/functions/ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_base64: base64,
          media_type: capturedBlob.type || 'image/jpeg',
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const result = data.result;
        if (result?.total_ttc != null) {
          setAmountTtc(result.total_ttc.toFixed(2).replace('.', ','));
        }
        if (result?.tva_amount != null) {
          setAmountTva(result.tva_amount.toFixed(2).replace('.', ','));
        }
        if (result?.date) {
          setReceiptDate(result.date);
        }
        showToast('Ticket analysé automatiquement', 'success');
      }
    } catch {
      // OCR failed silently — user can still fill in manually
    } finally {
      setScanning(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCapturedBlob(file);
    setPreviewUrl(URL.createObjectURL(file));
    setStep('preview');
    stopCamera();
  };

  const parseAmount = (value: string): number => {
    const normalized = value.replace(',', '.');
    const euros = parseFloat(normalized);
    if (isNaN(euros)) return 0;
    return Math.round(euros * 100);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const categoryConfig = CATEGORIES[category];
      const ttcCents = parseAmount(amountTtc);
      const tvaCents = categoryConfig.tracksTva ? parseAmount(amountTva) : null;

      if (!isOnline && capturedBlob) {
        // Offline: queue for later
        const pending: PendingUpload = {
          id: crypto.randomUUID(),
          imageBlob: capturedBlob,
          receipt_date: receiptDate,
          category,
          company_name: categoryConfig.hasCompanyName ? companyName : undefined,
          designation: categoryConfig.hasDesignation ? designation : undefined,
          divers_account_code: categoryConfig.hasDiversAccountCode ? diversAccountCode : undefined,
          salon_sub_type: categoryConfig.hasSalonSubType ? salonSubType : undefined,
          created_at: new Date().toISOString(),
          retryCount: 0,
        };
        await addToQueue(pending);
        await refreshCount();
        showToast('Ticket sauvegardé hors ligne', 'info');
      } else {
        let imagePath: string | null = null;
        if (capturedBlob) {
          const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
          imagePath = await uploadImage(capturedBlob, fileName);
        }

        await createReceipt({
          receipt_date: receiptDate,
          category,
          amount_ttc_cents: ttcCents,
          amount_tva_cents: tvaCents,
          company_name: categoryConfig.hasCompanyName ? companyName || null : null,
          designation: categoryConfig.hasDesignation ? designation || null : null,
          divers_account_code: categoryConfig.hasDiversAccountCode ? diversAccountCode || null : null,
          salon_sub_type: categoryConfig.hasSalonSubType ? salonSubType : null,
          image_path: imagePath,
        });
        showToast('Ticket enregistré', 'success');
      }
      navigate('/receipts');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erreur', 'error');
    } finally {
      setSaving(false);
    }
  };

  const categoryConfig = CATEGORIES[category];

  // Camera view
  if (step === 'camera') {
    return (
      <div className="relative flex h-screen flex-col bg-black">
        <canvas ref={canvasRef} className="hidden" />
        {cameraError ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4 text-center text-white">
            <Camera size={48} className="opacity-50" />
            <p className="text-sm opacity-70">{cameraError}</p>
            <Button onClick={() => fileInputRef.current?.click()} variant="secondary">
              <Upload size={18} className="mr-2" />
              Choisir une photo
            </Button>
            <Button onClick={() => { setStep('details'); }} variant="ghost" className="text-white">
              Saisie manuelle
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handleFileSelect}
            />
          </div>
        ) : (
          <>
            <video
              ref={videoRef}
              className="flex-1 object-cover"
              playsInline
              muted
            />
            <div className="absolute bottom-0 left-0 right-0 flex items-center justify-center gap-6 bg-gradient-to-t from-black/80 to-transparent p-8 pb-safe">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex h-12 w-12 items-center justify-center rounded-full bg-white/20 text-white"
              >
                <Upload size={20} />
              </button>
              <button
                onClick={handleCapture}
                disabled={!isStreaming}
                className="flex h-18 w-18 items-center justify-center rounded-full border-4 border-white bg-white/30 disabled:opacity-50"
              >
                <div className="h-14 w-14 rounded-full bg-white" />
              </button>
              <button
                onClick={() => navigate(-1)}
                className="flex h-12 w-12 items-center justify-center rounded-full bg-white/20 text-white"
              >
                <X size={20} />
              </button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handleFileSelect}
            />
          </>
        )}
      </div>
    );
  }

  // Preview view
  if (step === 'preview') {
    return (
      <div className="relative flex h-screen flex-col bg-black">
        {previewUrl && (
          <img src={previewUrl} alt="Preview" className="flex-1 object-contain" />
        )}
        <div className="absolute bottom-0 left-0 right-0 flex items-center justify-center gap-6 bg-gradient-to-t from-black/80 to-transparent p-8 pb-safe">
          <Button onClick={handleRetake} variant="secondary" className="gap-2">
            <RotateCcw size={18} />
            Reprendre
          </Button>
          <Button onClick={handleUsePhoto} className="gap-2">
            <Check size={18} />
            Utiliser
          </Button>
        </div>
      </div>
    );
  }

  // Details form
  return (
    <div className="px-4 py-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Détails du ticket</h1>
        <button onClick={() => navigate(-1)} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100">
          <X size={20} />
        </button>
      </div>

      {previewUrl && (
        <div className="mb-4 overflow-hidden rounded-xl">
          <img src={previewUrl} alt="Receipt" className="h-40 w-full object-cover" />
        </div>
      )}

      {scanning && (
        <div className="mb-4 flex items-center gap-3 rounded-lg bg-blue-50 p-3">
          <div className="animate-spin h-5 w-5 rounded-full border-2 border-blue-600 border-t-transparent" />
          <span className="text-sm text-blue-700">Analyse du ticket en cours...</span>
        </div>
      )}

      <div className="space-y-4">
        {/* Category tiles */}
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700">Catégorie</label>
          <div className="grid grid-cols-4 gap-2">
            {CATEGORY_LIST.map((cat) => (
              <button
                key={cat.key}
                onClick={() => setCategory(cat.key)}
                className={`rounded-lg p-3 text-center text-xs font-medium transition-colors
                  ${category === cat.key
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
              >
                {cat.shortLabel}
              </button>
            ))}
          </div>
        </div>

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
            placeholder="Société invitée"
          />
        )}

        {categoryConfig.hasDesignation && (
          <Input
            label="Désignation"
            value={designation}
            onChange={(e) => setDesignation(e.target.value)}
            placeholder="Description"
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
          Enregistrer
        </Button>
      </div>
    </div>
  );
}
