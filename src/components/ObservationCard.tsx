import React, { useState } from 'react';
import { ObservationSet, VisibilityType } from '../types';
import {
  QrCode,
  Wifi,
  Eye,
  FileText,
  Edit3,
  Globe,
  Lock,
  Users,
  ShieldCheck,
  MapPin,
  Clock,
  Share2,
  Trash2,
  Tag,
  Check,
  ChevronDown,
  User,
} from 'lucide-react';

interface ObservationCardProps {
  observation: ObservationSet;
  currentUserId?: string;
  onSelect: (obs: ObservationSet) => void;
  onVisibilityChange: (id: string, newVis: VisibilityType) => void;
  onDelete: (id: string) => void;
}

const TYPE_CONFIG = {
  nfc: {
    label: 'NFC Tag',
    icon: Wifi,
    color: 'text-blue-600 bg-blue-50 border-blue-200',
  },
  qr: {
    label: 'QR Code',
    icon: QrCode,
    color: 'text-orange-600 bg-orange-50 border-orange-200',
  },
  object: {
    label: 'Image Obj',
    icon: Eye,
    color: 'text-purple-600 bg-purple-50 border-purple-200',
  },
  ocr: {
    label: 'OCR Text',
    icon: FileText,
    color: 'text-emerald-600 bg-emerald-50 border-emerald-200',
  },
  manual: {
    label: 'Field Note',
    icon: Edit3,
    color: 'text-slate-700 bg-slate-100 border-slate-200',
  },
};

const VISIBILITY_CONFIG = {
  public: {
    label: '認証無しで開示可能',
    icon: Globe,
    badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  authenticated: {
    label: '認証済みユーザー全員',
    icon: ShieldCheck,
    badgeColor: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  },
  shared: {
    label: '特定メールアドレス',
    icon: Users,
    badgeColor: 'bg-blue-50 text-blue-700 border-blue-200',
  },
  private: {
    label: '自分のみ',
    icon: Lock,
    badgeColor: 'bg-slate-100 text-slate-700 border-slate-200',
  },
};

export const ObservationCard: React.FC<ObservationCardProps> = ({
  observation,
  currentUserId,
  onSelect,
  onVisibilityChange,
  onDelete,
}) => {
  const [copied, setCopied] = useState(false);
  const [showVisibilityMenu, setShowVisibilityMenu] = useState(false);

  const isOwner = currentUserId && observation.userId === currentUserId;
  const typeInfo = TYPE_CONFIG[observation.type] || TYPE_CONFIG.manual;
  const visInfo = VISIBILITY_CONFIG[observation.visibility] || VISIBILITY_CONFIG.private;
  const TypeIcon = typeInfo.icon;
  const VisIcon = visInfo.icon;

  const formatDate = (isoStr: string) => {
    try {
      const d = new Date(isoStr);
      return d.toLocaleTimeString('ja-JP', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      return isoStr;
    }
  };

  const handleShareLink = (e: React.MouseEvent) => {
    e.stopPropagation();
    const url = `${window.location.origin}?obsId=${observation.id}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      onClick={() => onSelect(observation)}
      className="obs-card group relative bg-white border border-slate-200 rounded-xl p-3.5 shadow-xs hover:shadow-md transition cursor-pointer flex flex-col justify-between gap-3"
    >
      {/* Top Bar: Type Badge & Timestamp */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          {/* Type Badge or Composite Badge */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span
              className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border flex items-center gap-1 ${typeInfo.color}`}
            >
              <TypeIcon className="w-3 h-3" />
              {typeInfo.label}
            </span>

            {((observation.observations && observation.observations.length > 0) ||
              ((observation as any).subObservations && (observation as any).subObservations.length > 0)) && (
              <span className="px-2 py-0.5 bg-blue-100 text-blue-900 border border-blue-200 rounded text-[10px] font-extrabold flex items-center gap-1">
                <span>
                  観測セット: {(observation.observations?.length || (observation as any).subObservations?.length)}件
                </span>
              </span>
            )}
          </div>

          {/* Time Mono Label */}
          <span className="text-[10px] text-slate-400 font-mono flex items-center gap-1 shrink-0">
            <Clock className="w-3 h-3 text-slate-400" />
            {formatDate(observation.createdAt)}
          </span>
        </div>

        {/* Title & Summary */}
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-slate-800 truncate group-hover:text-blue-600 transition">
            {observation.title}
          </h3>
          <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">
            {observation.summary}
          </p>
        </div>
      </div>

      {/* Image Thumbnail Preview if available */}
      {observation.imageUrl && (
        <div className="relative h-28 rounded-lg overflow-hidden bg-slate-100 border border-slate-200 flex justify-center">
          <img
            src={observation.imageUrl}
            alt={observation.title}
            className="h-full w-full object-cover group-hover:scale-105 transition duration-300"
          />
        </div>
      )}

      {/* Metadata, Observer & Tags */}
      <div className="space-y-2 pt-1 border-t border-slate-100 text-xs text-slate-500">
        <div className="flex items-center justify-between gap-2 text-[11px]">
          {/* Observer */}
          <div className="flex items-center gap-1.5">
            <div className="w-5 h-5 rounded-full bg-slate-200 border border-slate-300 flex items-center justify-center text-slate-500 overflow-hidden shrink-0">
              {observation.observerPhoto ? (
                <img
                  src={observation.observerPhoto}
                  alt={observation.observerName}
                  className="w-full h-full object-cover"
                />
              ) : (
                <User className="w-3 h-3 text-slate-500" />
              )}
            </div>
            <span className="text-slate-600 font-medium truncate max-w-[100px]">{observation.observerName}</span>
          </div>

          {/* Location */}
          {observation.location && (
            <div className="flex items-center gap-1 font-mono text-[10px] text-slate-500 max-w-[140px] truncate">
              <MapPin className="w-3 h-3 text-blue-500 shrink-0" />
              <span className="truncate">{observation.location.address || `${observation.location.latitude?.toFixed(2)}, ${observation.location.longitude?.toFixed(2)}`}</span>
            </div>
          )}
        </div>

        {/* Tags */}
        {observation.tags && observation.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {observation.tags.map((tag, idx) => (
              <span
                key={idx}
                className="px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px] font-mono flex items-center gap-0.5"
              >
                <Tag className="w-2.5 h-2.5" />
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Bottom Controls: Sharing Level & Quick Actions */}
      <div
        className="flex items-center justify-between pt-2 border-t border-slate-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Visibility Setting Control */}
        <div className="relative">
          {isOwner ? (
            <button
              type="button"
              onClick={() => setShowVisibilityMenu(!showVisibilityMenu)}
              className={`px-2 py-0.5 rounded text-[10px] font-bold border flex items-center gap-1 transition ${visInfo.badgeColor} hover:opacity-80 cursor-pointer`}
            >
              <VisIcon className="w-3 h-3" />
              <span>{visInfo.label}</span>
              <ChevronDown className="w-2.5 h-2.5" />
            </button>
          ) : (
            <div className={`px-2 py-0.5 rounded text-[10px] font-bold border flex items-center gap-1 ${visInfo.badgeColor}`}>
              <VisIcon className="w-3 h-3" />
              <span>{visInfo.label}</span>
            </div>
          )}

          {/* Visibility Dropdown Menu */}
          {showVisibilityMenu && (
            <div className="absolute left-0 bottom-7 z-20 w-48 bg-white border border-slate-200 rounded-lg shadow-lg p-1 space-y-0.5 text-xs">
              {(['public', 'authenticated', 'shared', 'private'] as VisibilityType[]).map((vKey) => {
                const opt = VISIBILITY_CONFIG[vKey];
                const OptIcon = opt.icon;
                return (
                  <button
                    key={vKey}
                    type="button"
                    onClick={() => {
                      onVisibilityChange(observation.id, vKey);
                      setShowVisibilityMenu(false);
                    }}
                    className={`w-full px-2 py-1.5 rounded text-left text-xs font-medium flex items-center justify-between hover:bg-slate-50 transition cursor-pointer ${
                      observation.visibility === vKey ? 'text-blue-600 font-bold bg-blue-50' : 'text-slate-700'
                    }`}
                  >
                    <span className="flex items-center gap-1.5">
                      <OptIcon className="w-3.5 h-3.5" />
                      {opt.label}
                    </span>
                    {observation.visibility === vKey && <Check className="w-3 h-3" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Share & Delete Action Buttons */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleShareLink}
            title="観測リンクをコピー"
            className="p-1 rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition flex items-center gap-1 text-[10px] cursor-pointer"
          >
            <Share2 className="w-3.5 h-3.5" />
            {copied && <span className="text-[10px] text-emerald-600 font-bold font-mono">OK</span>}
          </button>

          {isOwner && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (confirm('この観測ログを削除しますか？')) {
                  onDelete(observation.id);
                }
              }}
              title="観測ログを削除"
              className="p-1 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 transition cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
