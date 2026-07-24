import React, { useState, useEffect } from 'react';
import { ObservationType, VisibilityType, LocationData, ObserverUser, Observation, ObservationSet } from '../types';
import { generateId } from '../utils/idUtils';
import { QRScanner } from './scanners/QRScanner';
import { NFCScanner } from './scanners/NFCScanner';
import { ObjectScanner } from './scanners/ObjectScanner';
import { OCRScanner } from './scanners/OCRScanner';
import { ManualScanner } from './scanners/ManualScanner';
import { getCurrentLocation } from '../services/locationService';
import {
  X,
  MapPin,
  Lock,
  Users,
  Globe,
  ShieldCheck,
  Loader2,
  CheckCircle,
  QrCode,
  Wifi,
  Eye,
  FileText,
  Edit3,
  Layers,
  Trash2,
  Save,
} from 'lucide-react';

interface ObservationModalProps {
  currentUser: ObserverUser;
  isOpen: boolean;
  onClose: () => void;
  onSaveObservation: (data: {
    type: ObservationType;
    title: string;
    summary: string;
    rawContent: string;
    imageUrl?: string;
    imagePath?: string;
    location?: LocationData;
    visibility: VisibilityType;
    allowedEmails?: string[];
    tags: string[];
    metadata?: Record<string, any>;
    observations?: Observation[];
  }) => Promise<void>;
}

export const ObservationModal: React.FC<ObservationModalProps> = ({
  currentUser,
  isOpen,
  onClose,
  onSaveObservation,
}) => {
  const [activeType, setActiveType] = useState<ObservationType>('qr');
  const [visibility, setVisibility] = useState<VisibilityType>('private');
  const [allowedEmailsText, setAllowedEmailsText] = useState<string>('');
  const [includeLocation, setIncludeLocation] = useState<boolean>(true);
  const [locationData, setLocationData] = useState<LocationData | null>(null);
  const [isLoadingLocation, setIsLoadingLocation] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Composite Multi-observation state for the same target object
  const [draftObservations, setDraftObservations] = useState<Observation[]>([]);
  const [compositeTitle, setCompositeTitle] = useState<string>('');

  // Helper to parse allowed emails text input
  const parseAllowedEmails = (text: string): string[] => {
    return text
      .split(/[\n,;\s]+/)
      .map((e) => e.trim())
      .filter((e) => e.length > 0 && e.includes('@'));
  };

  // Fetch position when modal opens
  useEffect(() => {
    if (isOpen && includeLocation) {
      setIsLoadingLocation(true);
      getCurrentLocation().then((loc) => {
        setLocationData(loc);
        setIsLoadingLocation(false);
      });
    }
  }, [isOpen, includeLocation]);

  if (!isOpen) return null;

  // Handles adding a scan result to the composite batch OR saving immediately
  const handleCaptureData = async (data: {
    rawContent: string;
    title: string;
    summary: string;
    tags: string[];
    imageUrl?: string;
    imagePath?: string;
    metadata?: Record<string, any>;
  }) => {
    const parsedEmails = parseAllowedEmails(allowedEmailsText);

    const newObsItem: Observation = {
      id: generateId(),
      uid: currentUser.uid,
      observerName: currentUser.displayName,
      observerPhoto: currentUser.photoURL,
      type: activeType,
      title: data.title,
      summary: data.summary,
      rawContent: data.rawContent,
      imageUrl: data.imageUrl,
      imagePath: data.imagePath,
      visibility,
      allowedEmails: parsedEmails,
      metadata: data.metadata || {},
      schemaVersion: '1.0.0',
      createdAt: new Date().toISOString(),
    };

    // If there are already items in the batch, auto append
    if (draftObservations.length > 0) {
      setDraftObservations((prev) => [...prev, newObsItem]);
      return;
    }

    // Default flow: Single observation or start batching
    setIsSubmitting(true);
    try {
      await onSaveObservation({
        type: activeType,
        title: data.title,
        summary: data.summary,
        rawContent: data.rawContent,
        imageUrl: data.imageUrl,
        imagePath: data.imagePath,
        location: includeLocation && locationData ? locationData : undefined,
        visibility,
        allowedEmails: parsedEmails,
        tags: data.tags,
        metadata: data.metadata,
        observations: [],
      });
      onClose();
    } catch (err) {
      console.error('Save observation error:', err);
      alert('観測データの保存に失敗しました。');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Save composite observation set containing all queued items
  const handleSaveComposite = async () => {
    if (draftObservations.length === 0) return;

    setIsSubmitting(true);
    try {
      const parsedEmails = parseAllowedEmails(allowedEmailsText);
      const typesList = Array.from(new Set(draftObservations.map((s) => s.type)));
      const combinedTitle =
        compositeTitle.trim() ||
        `${draftObservations[0].title} (観測セット: ${draftObservations.length}項目)`;

      const combinedSummary = draftObservations
        .map((s, idx) => `[${idx + 1}. ${s.type.toUpperCase()}] ${s.summary || s.title}`)
        .join(' / ');

      const combinedRaw = draftObservations
        .map(
          (s, idx) =>
            `=== 観測 #${idx + 1} [${s.type.toUpperCase()}] ===\nタイトル: ${s.title}\n内容:\n${s.rawContent}\n`
        )
        .join('\n');

      const allTags = Array.from(
        new Set([...typesList, '観測セット', ...draftObservations.flatMap((s) => s.metadata?.keyEntities || [])])
      );

      const firstImage = draftObservations.find((s) => s.imageUrl)?.imageUrl;
      const firstImagePath = draftObservations.find((s) => s.imagePath)?.imagePath;

      await onSaveObservation({
        type: draftObservations[0].type,
        title: combinedTitle,
        summary: combinedSummary,
        rawContent: combinedRaw,
        imageUrl: firstImage,
        imagePath: firstImagePath,
        location: includeLocation && locationData ? locationData : undefined,
        visibility,
        allowedEmails: parsedEmails,
        tags: allTags,
        metadata: {
          isComposite: true,
          observationCount: draftObservations.length,
          types: typesList,
        },
        observations: draftObservations,
      });

      setDraftObservations([]);
      setCompositeTitle('');
      onClose();
    } catch (err) {
      console.error('Save composite observation error:', err);
      alert('観測セットデータの保存に失敗しました。');
    } finally {
      setIsSubmitting(false);
    }
  };

  const removeSubFromDraft = (id: string) => {
    setDraftObservations((prev) => prev.filter((s) => s.id !== id));
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-200 p-6 space-y-5 animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 pb-3">
          <div>
            <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
              <span>新規観測ログの登録</span>
              {draftObservations.length > 0 && (
                <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded-full text-[10px] font-bold">
                  観測セット作成中: {draftObservations.length}件登録中
                </span>
              )}
            </h2>
            <div className="text-xs text-slate-500 font-mono">
              Observer: <strong className="text-slate-800">{currentUser.displayName}</strong>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Draft Observations Queue Section if present */}
        {draftObservations.length > 0 && (
          <div className="p-3.5 bg-blue-50/70 border border-blue-200 rounded-xl space-y-3">
            <div className="flex items-center justify-between border-b border-blue-200 pb-2">
              <div className="text-xs font-bold text-blue-950 flex items-center gap-1.5 uppercase tracking-wider">
                <Layers className="w-4 h-4 text-blue-600" />
                同一対象物に対する観測セット (ObservationSet: {draftObservations.length}件)
              </div>
              <button
                type="button"
                onClick={() => setDraftObservations([])}
                className="text-[11px] text-rose-600 hover:underline font-bold"
              >
                クリア
              </button>
            </div>

            {/* Observations List */}
            <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
              {draftObservations.map((obs, idx) => (
                <div
                  key={obs.id}
                  className="p-2 bg-white rounded-lg border border-blue-100 shadow-2xs flex items-center justify-between gap-2 text-xs"
                >
                  <div className="flex items-center gap-2 truncate">
                    <span className="w-5 h-5 rounded bg-blue-100 text-blue-800 font-bold font-mono text-[10px] flex items-center justify-center shrink-0">
                      #{idx + 1}
                    </span>
                    <span className="px-1.5 py-0.5 bg-slate-100 text-slate-700 font-mono text-[10px] rounded uppercase font-bold shrink-0">
                      {obs.type}
                    </span>
                    <span className="font-bold text-slate-800 truncate">{obs.title}</span>
                  </div>

                  <button
                    type="button"
                    onClick={() => removeSubFromDraft(obs.id)}
                    className="p-1 text-slate-400 hover:text-rose-600 transition cursor-pointer shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>

            {/* Composite Group Title & Save Master Button */}
            <div className="pt-2 border-t border-blue-200 space-y-2">
              <input
                type="text"
                placeholder="対象物・機材名称 (例: 産業用アーム Unit-A 総合チェック)"
                value={compositeTitle}
                onChange={(e) => setCompositeTitle(e.target.value)}
                className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-medium"
              />

              <button
                type="button"
                onClick={handleSaveComposite}
                className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer shadow-xs"
              >
                <Save className="w-4 h-4" />
                観測セット ({draftObservations.length}件) として統合保存
              </button>
            </div>
          </div>
        )}

        {/* Observation Mode Selector Buttons */}
        <div className="space-y-1">
          <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center justify-between">
            <span>観測方法の選択:</span>
            {draftObservations.length > 0 && (
              <span className="text-blue-600 text-[10px]">
                別方式の観測を追加して1つにまとめることができます
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
            {[
              { type: 'qr', label: 'QR Code', icon: QrCode },
              { type: 'nfc', label: 'NFC Tag', icon: Wifi },
              { type: 'object', label: 'Image Obj', icon: Eye },
              { type: 'ocr', label: 'OCR Text', icon: FileText },
              { type: 'manual', label: 'Field Note', icon: Edit3 },
            ].map(({ type, label, icon: Icon }) => (
              <button
                key={type}
                type="button"
                onClick={() => setActiveType(type as ObservationType)}
                className={`p-2 rounded-lg border text-center font-bold text-xs flex flex-col items-center justify-center gap-1 transition cursor-pointer ${
                  activeType === type
                    ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span className="line-clamp-1 font-mono text-[11px]">{label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Global Settings: Visibility & Geolocation Toggle */}
        <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-3 text-xs">
          <div className="space-y-2">
            {/* Sharing Visibility Option */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <span className="font-bold text-slate-700 text-[11px] uppercase tracking-wider flex items-center gap-1">
                <Lock className="w-3.5 h-3.5 text-blue-600" />
                アクセス制御 (開示範囲):
              </span>
              <div className="flex flex-wrap gap-1">
                {[
                  { key: 'public', label: '認証無しで開示可能', icon: Globe },
                  { key: 'authenticated', label: '認証済みユーザー全員', icon: ShieldCheck },
                  { key: 'shared', label: '特定メールアドレス限定', icon: Users },
                  { key: 'private', label: '自分のみ', icon: Lock },
                ].map(({ key, label, icon: VisIcon }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setVisibility(key as VisibilityType)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border flex items-center gap-1.5 transition cursor-pointer ${
                      visibility === key
                        ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <VisIcon className="w-3.5 h-3.5" />
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Allowed Emails Input when visibility === 'shared' */}
            {visibility === 'shared' && (
              <div className="bg-white p-3 rounded-lg border border-blue-200 space-y-1.5 animate-in fade-in duration-150">
                <label className="block text-[11px] font-bold text-slate-700">
                  開示を許可する特定のメールアドレス（認証・非匿名ユーザー限定）:
                </label>
                <input
                  type="text"
                  placeholder="例: user1@example.com, user2@domain.org (カンマまたはスペース区切り)"
                  value={allowedEmailsText}
                  onChange={(e) => setAllowedEmailsText(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 font-mono"
                />
                <p className="text-[10px] text-slate-500 leading-normal">
                  ※ 指定されたメールアドレスでログインした非匿名（Google/Email認証済み）ユーザーのみ閲覧できます。
                </p>
              </div>
            )}

            {/* Geolocation Toggle */}
            <div className="pt-2 border-t border-slate-200 flex items-center justify-between">
              <label className="flex items-center gap-1.5 cursor-pointer font-bold text-slate-700 text-[11px]">
                <input
                  type="checkbox"
                  checked={includeLocation}
                  onChange={(e) => setIncludeLocation(e.target.checked)}
                  className="w-3.5 h-3.5 text-blue-600 rounded"
                />
                <span className="flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-blue-600" />
                  位置情報を記録 (GPS)
                </span>
              </label>

              {includeLocation && (
                <div className="text-[10px] text-slate-500 font-mono flex items-center gap-1.5">
                  {isLoadingLocation ? (
                    <>
                      <Loader2 className="w-3 h-3 animate-spin text-blue-600" />
                      <span>測位中...</span>
                    </>
                  ) : locationData ? (
                    <>
                      <CheckCircle className="w-3 h-3 text-emerald-600" />
                      <span className="font-bold text-slate-800 truncate max-w-[200px]">
                        {locationData.address || `${locationData.latitude.toFixed(3)}, ${locationData.longitude.toFixed(3)}`}
                      </span>
                    </>
                  ) : (
                    <span className="text-amber-600">測位待ち</span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Active Scanner View */}
        <div className="pt-2 space-y-2">
          {activeType === 'qr' && <QRScanner onCapture={handleCaptureData} />}
          {activeType === 'nfc' && <NFCScanner onCapture={handleCaptureData} />}
          {activeType === 'object' && <ObjectScanner onCapture={handleCaptureData} />}
          {activeType === 'ocr' && <OCRScanner onCapture={handleCaptureData} />}
          {activeType === 'manual' && <ManualScanner onCapture={handleCaptureData} />}
        </div>

        {isSubmitting && (
          <div className="absolute inset-0 bg-white/80 backdrop-blur-xs flex flex-col items-center justify-center gap-2 text-indigo-900 font-bold rounded-2xl z-30">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
            <span>観測データをFirestoreへ保存中...</span>
          </div>
        )}
      </div>
    </div>
  );
};
