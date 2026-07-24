import React, { useState } from 'react';
import { ObservationSet, VisibilityType } from '../types';
import {
  X,
  MapPin,
  Clock,
  Globe,
  Lock,
  Users,
  ShieldCheck,
  Share2,
  Tag,
  Check,
  Package,
  FileText,
  AlignLeft,
  ChevronRight,
  ExternalLink,
  User,
} from 'lucide-react';

interface ObservationDetailModalProps {
  observation: ObservationSet | null;
  currentUserId?: string;
  onClose: () => void;
  onVisibilityChange: (id: string, newVis: VisibilityType) => void;
}

export const ObservationDetailModal: React.FC<ObservationDetailModalProps> = ({
  observation,
  currentUserId,
  onClose,
  onVisibilityChange,
}) => {
  const [copied, setCopied] = useState(false);

  if (!observation) return null;

  const obsItems = observation.observations || (observation as any).subObservations || [];

  const isOwner = currentUserId && observation.userId === currentUserId;

  const formatDate = (isoStr: string) => {
    try {
      return new Date(isoStr).toLocaleString('ja-JP', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      return isoStr;
    }
  };

  const handleShare = () => {
    const url = `${window.location.origin}?obsId=${observation.id}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-200 p-6 space-y-6 animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-200 pb-3">
          <div className="space-y-1 pr-4">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded text-[10px] font-bold uppercase tracking-wider border border-blue-100">
                {observation.type} 観測
              </span>
              <span className="text-xs text-slate-400 font-mono">
                ID: {observation.id}
              </span>
            </div>
            <h2 className="text-lg font-bold text-slate-800">{observation.title}</h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Observer Subject Profile Box */}
        <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-slate-200 border border-slate-300 text-slate-500 flex items-center justify-center shadow-2xs overflow-hidden shrink-0">
              {observation.observerPhoto ? (
                <img src={observation.observerPhoto} alt={observation.observerName} className="w-full h-full object-cover" />
              ) : (
                <User className="w-5 h-5 text-slate-500" />
              )}
            </div>
            <div>
              <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">観測者</div>
              <div className="text-xs font-bold text-slate-800">{observation.observerName}</div>
            </div>
          </div>

          <button
            type="button"
            onClick={handleShare}
            className="px-3 py-1.5 bg-white border border-slate-200 hover:bg-blue-50 hover:border-blue-200 text-slate-700 hover:text-blue-600 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
          >
            <Share2 className="w-3.5 h-3.5" />
            {copied ? 'コピー完了!' : '観測リンクを共有'}
          </button>
        </div>

        {/* Photo Image Preview */}
        {observation.imageUrl && (
          <div className="rounded-lg overflow-hidden bg-slate-100 max-h-72 flex justify-center border border-slate-200">
            <img src={observation.imageUrl} alt={observation.title} className="max-h-72 object-contain" />
          </div>
        )}

        {/* Observation Summary & Main Content */}
        <div className="space-y-4 text-xs text-slate-800">
          <div className="space-y-1">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">観測データ概要 (Summary)</div>
            <p className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-slate-700 leading-relaxed">
              {observation.summary}
            </p>
          </div>

          {/* Raw Content / Text Extracted */}
          {observation.rawContent && (
            <div className="space-y-1">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                <AlignLeft className="w-3.5 h-3.5 text-blue-600" />
                観測データ本体 (Raw Payload)
              </div>
              <pre className="p-3 bg-slate-900 text-emerald-400 rounded-md text-xs font-mono whitespace-pre-wrap overflow-x-auto leading-relaxed border border-slate-800">
                {observation.rawContent}
              </pre>
            </div>
          )}

          {/* Individual observations breakdown for ObservationSet */}
          {obsItems.length > 0 && (
            <div className="space-y-2.5 pt-2 border-t border-slate-200">
              <div className="text-[10px] font-bold text-blue-900 uppercase tracking-wider flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Package className="w-3.5 h-3.5 text-blue-600" />
                  同一対象物に対する観測セット内訳 ({obsItems.length}件)
                </span>
                <span className="font-mono text-blue-600">ObservationSet Cluster</span>
              </div>

              <div className="space-y-2">
                {obsItems.map((sub: any, idx: number) => (
                  <div
                    key={sub.id || idx}
                    className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="w-5 h-5 bg-blue-600 text-white font-bold font-mono text-[10px] rounded flex items-center justify-center shrink-0">
                          #{idx + 1}
                        </span>
                        <span className="px-2 py-0.5 bg-blue-100 text-blue-800 font-mono text-[10px] font-bold uppercase rounded border border-blue-200">
                          {sub.type}
                        </span>
                        <span className="font-bold text-slate-800 text-xs">{sub.title}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {sub.observerName && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-slate-200 text-slate-700 font-medium rounded flex items-center gap-1">
                            {sub.observerPhoto ? (
                              <img src={sub.observerPhoto} alt={sub.observerName} className="w-3.5 h-3.5 rounded-full" />
                            ) : (
                              <User className="w-3 h-3 text-slate-500" />
                            )}
                            {sub.observerName}
                          </span>
                        )}
                        <span className="text-[10px] text-slate-400 font-mono">
                          {new Date(sub.createdAt).toLocaleTimeString('ja-JP')}
                        </span>
                      </div>
                    </div>

                    {sub.summary && (
                      <p className="text-xs text-slate-600 leading-relaxed bg-white p-2 rounded border border-slate-100">
                        {sub.summary}
                      </p>
                    )}

                    {sub.rawContent && (
                      <pre className="p-2 bg-slate-900 text-emerald-400 rounded text-[11px] font-mono whitespace-pre-wrap overflow-x-auto">
                        {sub.rawContent}
                      </pre>
                    )}

                    {sub.imageUrl && (
                      <div className="relative max-h-36 rounded-lg overflow-hidden bg-slate-200 border border-slate-300">
                        <img src={sub.imageUrl} alt={sub.title} className="max-h-36 object-contain mx-auto" />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Location & Time Box */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
              <div className="text-slate-400 font-bold text-[10px] uppercase tracking-wider flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" /> 観測日時
              </div>
              <div className="font-mono text-xs font-bold text-slate-800">{formatDate(observation.createdAt)}</div>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
              <div className="text-slate-400 font-bold text-[10px] uppercase tracking-wider flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 text-blue-600" /> 観測位置
              </div>
              {observation.location ? (
                <div className="font-mono text-xs font-bold text-slate-800">
                  {observation.location.address ||
                    `${observation.location.latitude.toFixed(4)}, ${observation.location.longitude.toFixed(4)}`}
                </div>
              ) : (
                <div className="text-slate-400 italic">位置情報は付加されていません</div>
              )}
            </div>
          </div>

          {/* Tags */}
          {observation.tags && observation.tags.length > 0 && (
            <div className="space-y-1 pt-1">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">タグ</div>
              <div className="flex flex-wrap gap-1">
                {observation.tags.map((t, i) => (
                  <span
                    key={i}
                    className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded text-[11px] font-mono flex items-center gap-1"
                  >
                    <Tag className="w-3 h-3 text-slate-400" />
                    {t}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Visibility Selector */}
          {isOwner && (
            <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg space-y-2">
              <div className="font-bold text-blue-900 text-xs flex items-center justify-between">
                <span>アクセス制御 (開示範囲設定)</span>
                <span className="text-[10px] text-blue-700 font-mono">Access Control</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { key: 'public', label: '認証無し開示', icon: Globe },
                  { key: 'authenticated', label: '認証全共有', icon: ShieldCheck },
                  { key: 'shared', label: '特定メール', icon: Users },
                  { key: 'private', label: '自分のみ', icon: Lock },
                ].map(({ key, label, icon: Icon }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => onVisibilityChange(observation.id, key as VisibilityType)}
                    className={`py-1.5 px-2 rounded text-[11px] font-bold border flex items-center justify-center gap-1 transition cursor-pointer ${
                      observation.visibility === key
                        ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {label}
                  </button>
                ))}
              </div>
              {observation.visibility === 'shared' && observation.allowedEmails && observation.allowedEmails.length > 0 && (
                <div className="text-[11px] text-slate-600 bg-white p-2 rounded border border-blue-200">
                  <span className="font-bold">許可されたメールアドレス:</span> {observation.allowedEmails.join(', ')}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
