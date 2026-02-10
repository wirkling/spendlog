import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCamera } from '@/hooks/useCamera';
import { useReceiptStore } from '@/stores/receiptStore';
import { useCaptureStore } from '@/stores/captureStore';
import { useOfflineQueue } from '@/hooks/useOfflineQueue';
import { addToQueue } from '@/lib/offline-queue';
import { CATEGORY_LIST, DIVERS_SUB_ACCOUNTS, SALON_SUB_TYPES, CATEGORIES } from '@/lib/categories';
import type { Category, SalonSubType, PendingUpload } from '@/types';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { useToast } from '@/components/ui/Toast';
import { Camera, RotateCcw, Check, Upload, ChevronDown, ChevronUp, Sparkles } from 'lucide-react';
import { format } from 'date-fns';

type CaptureStep = 'camera' | 'preview' | 'details';

interface OcrResult {
  vendor_name?: string | null;
  date?: string | null;
  total_ttc?: number | null;
  tva_amount?: number | null;
}

export function CapturePage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { videoRef, canvasRef, isStreaming, error: cameraError, startCamera, stopCamera, capturePhoto } = useCamera();
  const { createReceipt, uploadImage } = useReceiptStore();
  const setShutterCallback = useCaptureStore((s) => s.setShutterCallback);
  const { isOnline, refreshCount } = useOfflineQueue();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<CaptureStep>('camera');
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [ocrResult, setOcrResult] = useState<OcrResult | null>(null);
  const [showManual, setShowManual] = useState(false);

  // Form state
  const [category, setCategory] = useState<Category>('restaurants_autoroute');
  const [receiptDate, setReceiptDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [amountTtc, setAmountTtc] = useState('');
  const [amountTva, setAmountTva] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [designation, setDesignation] = useState('');
  const [diversAccountCode, setDiversAccountCode] = useState('');
  const [salonSubType, setSalonSubType] = useState<SalonSubType>('salons');

  const handleCapture = useCallback(() => {
    const blob = capturePhoto();
    if (blob) {
      setCapturedBlob(blob);
      setPreviewUrl(URL.createObjectURL(blob));
      setStep('preview');
      stopCamera();
    }
  }, [capturePhoto, stopCamera]);

  useEffect(() => {
    startCamera();
    return () => {
      stopCamera();
      setShutterCallback(null);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Register shutter callback when in camera mode
  useEffect(() => {
    if (step === 'camera' && isStreaming) {
      setShutterCallback(handleCapture);
    } else {
      setShutterCallback(null);
    }
    return () => setShutterCallback(null);
  }, [step, isStreaming, handleCapture, setShutterCallback]);

  const handleRetake = () => {
    setCapturedBlob(null);
    setOcrResult(null);
    setShowManual(false);
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
    setScanning(true);
    setOcrResult(null);

    if (!capturedBlob || !isOnline) {
      setScanning(false);
      setShowManual(true);
      return;
    }

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
        const result: OcrResult = data.result;
        setOcrResult(result);

        if (result?.total_ttc != null) {
          setAmountTtc(result.total_ttc.toFixed(2).replace('.', ','));
        }
        if (result?.tva_amount != null) {
          setAmountTva(result.tva_amount.toFixed(2).replace('.', ','));
        }
        if (result?.date) {
          setReceiptDate(result.date);
        }
      } else {
        setShowManual(true);
      }
    } catch {
      setShowManual(true);
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

  // Camera view — clean, just the viewfinder. Shutter is in the BottomNav.
  if (step === 'camera') {
    return (
      <div className="flex flex-col items-center justify-center" style={{ height: 'calc(100vh - 5rem)' }}>
        <canvas ref={canvasRef} className="hidden" />
        {cameraError ? (
          <div className="flex flex-col items-center gap-4 px-4 text-center">
            <Camera size={48} className="text-gray-300" />
            <p className="text-sm text-gray-500">{cameraError}</p>
            <Button onClick={() => fileInputRef.current?.click()} variant="secondary" className="gap-2">
              <Upload size={18} />
              Choisir une photo
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
          <video
            ref={videoRef}
            className="h-full w-full object-cover"
            playsInline
            muted
          />
        )}
      </div>
    );
  }

  // Preview view
  if (step === 'preview') {
    return (
      <div className="flex flex-col items-center justify-center px-4" style={{ height: 'calc(100vh - 5rem)' }}>
        {previewUrl && (
          <img src={previewUrl} alt="Preview" className="max-h-[60vh] rounded-xl object-contain shadow-lg" />
        )}
        <div className="mt-6 flex gap-4">
          <Button onClick={handleRetake} variant="secondary" className="gap-2" size="lg">
            <RotateCcw size={18} />
            Reprendre
          </Button>
          <Button onClick={handleUsePhoto} className="gap-2" size="lg">
            <Check size={18} />
            Analyser
          </Button>
        </div>
      </div>
    );
  }

  // Details view — AI-first
  return (
    <div className="px-4 py-6">
      {/* Receipt thumbnail */}
      {previewUrl && (
        <div className="mb-4 overflow-hidden rounded-xl">
          <img src={previewUrl} alt="Receipt" className="h-32 w-full object-cover" />
        </div>
      )}

      {/* Scanning state */}
      {scanning && (
        <div className="mb-6 flex flex-col items-center gap-3 rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-50 p-8">
          <div className="relative">
            <Sparkles size={32} className="text-blue-600 animate-pulse" />
          </div>
          <p className="text-lg font-semibold text-blue-900">Analyse en cours...</p>
          <p className="text-sm text-blue-600">Lecture du ticket par IA</p>
          <div className="mt-2 h-1.5 w-48 overflow-hidden rounded-full bg-blue-200">
            <div className="h-full w-1/2 animate-[shimmer_1.5s_ease-in-out_infinite] rounded-full bg-blue-500"
                 style={{ animation: 'shimmer 1.5s ease-in-out infinite', transform: 'translateX(-100%)' }} />
          </div>
        </div>
      )}

      {/* OCR Results card */}
      {!scanning && ocrResult && (
        <div className="mb-6 rounded-2xl bg-gradient-to-br from-green-50 to-emerald-50 p-6">
          <div className="mb-4 flex items-center gap-2">
            <Sparkles size={20} className="text-green-600" />
            <h2 className="text-base font-semibold text-green-900">Résultat de l'analyse</h2>
          </div>

          <div className="space-y-3">
            {ocrResult.vendor_name && (
              <div>
                <p className="text-xs font-medium text-green-600 uppercase">Commerçant</p>
                <p className="text-lg font-semibold text-gray-900">{ocrResult.vendor_name}</p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-medium text-green-600 uppercase">Montant TTC</p>
                <p className="text-2xl font-bold text-gray-900">
                  {ocrResult.total_ttc != null ? `${ocrResult.total_ttc.toFixed(2).replace('.', ',')} €` : '—'}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-green-600 uppercase">TVA</p>
                <p className="text-2xl font-bold text-gray-900">
                  {ocrResult.tva_amount != null ? `${ocrResult.tva_amount.toFixed(2).replace('.', ',')} €` : '—'}
                </p>
              </div>
            </div>
            {ocrResult.date && (
              <div>
                <p className="text-xs font-medium text-green-600 uppercase">Date</p>
                <p className="text-base font-medium text-gray-900">{ocrResult.date}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* OCR failed state */}
      {!scanning && !ocrResult && (
        <div className="mb-6 rounded-2xl bg-amber-50 p-6 text-center">
          <p className="text-sm text-amber-700">Analyse impossible. Saisissez les informations manuellement.</p>
        </div>
      )}

      {/* Category selector — always visible */}
      {!scanning && (
        <div className="mb-4">
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
      )}

      {/* Manual edit toggle */}
      {!scanning && ocrResult && (
        <button
          onClick={() => setShowManual(!showManual)}
          className="mb-4 flex w-full items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium text-gray-500 hover:bg-gray-100"
        >
          {showManual ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          {showManual ? 'Masquer les détails' : 'Modifier manuellement'}
        </button>
      )}

      {/* Manual form — shown if no OCR result, or user expands */}
      {!scanning && (showManual || !ocrResult) && (
        <div className="mb-4 space-y-4">
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
        </div>
      )}

      {/* Save button */}
      {!scanning && (
        <Button onClick={handleSave} loading={saving} className="w-full" size="lg">
          Enregistrer
        </Button>
      )}
    </div>
  );
}
