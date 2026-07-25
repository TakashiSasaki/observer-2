import React, { useState } from 'react';
import { Observation, ObservationSetView, VisibilityType } from '../types';
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
  Plus,
  Unlink,
  Loader2,
} from 'lucide-react';

interface ObservationDetailModalProps {
  observation: ObservationSetView | null;
  currentUserId?: string;
  onClose: () => void;
  onVisibilityChange: (id: string, newVis: VisibilityType, allowedEmails?: string[]) => void;
  attachmentCandidates: Observation[];
  isAttachmentCandidatesLoading: boolean;
  attachmentCandidatesError: string | null;
  onLoadAttachmentCandidates: () => Promise<void>;
  onAttachObservation: (observationId: string) => Promise<void>;
  onDetachObservation: (observationId: string) => Promise<void>;
}

export const ObservationDetailModal: React.FC<ObservationDetailModalProps> = ({
  observation,
  currentUserId,
  onClose,
  onVisibilityChange,
  attachmentCandidates,
  isAttachmentCandidatesLoading,
  attachmentCandidatesError,
  onLoadAttachmentCandidates,
  onAttachObservation,
  onDetachObservation,
}) => {
  const [copied, setCopied] = useState(false);
  const [isAttachmentPickerOpen, setIsAttachmentPickerOpen] = useState(false);
  const [membershipActionId, setMembershipActionId] = useState<string | null>(null);

  if (!observation) return null;

  const obsItems = observation.observations;

  const isOwner = Boolean(currentUserId && observation.uid === currentUserId);
  const eligibleAttachmentCandidates = attachmentCandidates.filter(
    (candidate) => !obsItems.some((item) => item.id === candidate.id),
  );

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

  const openAttachmentPicker = async () => {
    setIsAttachmentPickerOpen(true);
    await onLoadAttachmentCandidates();
  };

  const attachCandidate = async (observationId: string) => {
    setMembershipActionId(`attach:${observationId}`);
    try {
      await onAttachObservation(observationId);
    } catch (error) {
      console.error('Failed to attach Observation to set:', error);
      alert('観測をセットへ追加できませんでした。');
    } finally {
      setMembershipActionId(null);
    }
  };

  const detachMember = async (observationId: string) => {
    setMembershipActionId(`detach:${observationId}`);
    try {
      await onDetachObservation(observationId);
    } catch (error) {
      console.error('Failed to detach Observation from set:', error);
      alert('セットから観測を外せませんでした。');
    } finally {
      setMembershipActionId(null);
    }
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
                {obsItems.map((sub: Observation, idx: number) => (
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
                        {isOwner && (
                          <button
                            type="button"
                            onClick={() => {
                              if (window.confirm(`「${sub.title}」をこのセットから外しますか？ 観測本体と他のセットへの所属は残ります。`)) {
                                void detachMember(sub.id);
                              }
                            }}
                            disabled={membershipActionId !== null}
                            title="このセットから外す"
                            className="inline-flex items-center gap-1 rounded border border-rose-200 bg-white px-1.5 py-1 text-[10px] font-bold text-rose-700 transition hover:bg-rose-50 disabled:cursor-wait disabled:opacity-60"
                          >
                            {membershipActionId === `detach:${sub.id}` ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Unlink className="h-3 w-3" />
                            )}
                            このセットから外す
                          </button>
                        )}
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

          {isOwner && (
            <section className="space-y-2 rounded-xl border border-blue-200 bg-blue-50/60 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-xs font-bold text-blue-950">既存の観測をこのセットへ追加</h3>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-blue-800">
                    同じ所有者の有効なObservationだけをMembershipとして追加します。観測本体を複製しません。
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (isAttachmentPickerOpen) {
                      setIsAttachmentPickerOpen(false);
                    } else {
                      void openAttachmentPicker();
                    }
                  }}
                  disabled={isAttachmentCandidatesLoading || membershipActionId !== null}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-2.5 py-1.5 text-[11px] font-bold text-white transition hover:bg-blue-700 disabled:cursor-wait disabled:opacity-60"
                >
                  {isAttachmentCandidatesLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                  {isAttachmentPickerOpen ? '候補を閉じる' : '既存観測を選ぶ'}
                </button>
              </div>

              {isAttachmentPickerOpen && (
                <div className="space-y-2 border-t border-blue-200 pt-2">
                  {isAttachmentCandidatesLoading && (
                    <div className="flex items-center gap-2 py-2 text-[11px] text-slate-600">
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-600" />
                      追加できる観測を読み込んでいます…
                    </div>
                  )}
                  {attachmentCandidatesError && (
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-rose-200 bg-rose-50 p-2 text-[11px] text-rose-700">
                      <p>{attachmentCandidatesError}</p>
                      <button
                        type="button"
                        onClick={() => void onLoadAttachmentCandidates()}
                        disabled={isAttachmentCandidatesLoading || membershipActionId !== null}
                        className="inline-flex shrink-0 items-center rounded border border-rose-300 bg-white px-2 py-1 font-bold text-rose-700 transition hover:bg-rose-100 disabled:cursor-wait disabled:opacity-60"
                      >
                        再試行
                      </button>
                    </div>
                  )}
                  {!isAttachmentCandidatesLoading && !attachmentCandidatesError && eligibleAttachmentCandidates.length === 0 && (
                    <p className="rounded border border-blue-100 bg-white p-2 text-[11px] text-slate-600">
                      追加可能な自身のObservationはありません。すでに所属済みの観測、論理削除済みの観測、他者の観測は候補に表示しません。
                    </p>
                  )}
                  {eligibleAttachmentCandidates.map((candidate) => (
                    <div
                      key={candidate.id}
                      className="flex items-center justify-between gap-3 rounded-lg border border-blue-100 bg-white p-2"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-xs font-bold text-slate-800">{candidate.title}</div>
                        <div className="mt-0.5 truncate font-mono text-[10px] text-slate-500">
                          {candidate.type.toUpperCase()} · {candidate.id}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => void attachCandidate(candidate.id)}
                        disabled={membershipActionId !== null}
                        className="inline-flex shrink-0 items-center gap-1 rounded border border-blue-200 bg-blue-50 px-2 py-1 text-[11px] font-bold text-blue-700 transition hover:bg-blue-100 disabled:cursor-wait disabled:opacity-60"
                      >
                        {membershipActionId === `attach:${candidate.id}` ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Plus className="h-3 w-3" />
                        )}
                        追加
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>
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
                    onClick={() => {
                      if (key === 'shared') {
                         if (!observation.allowedEmails || observation.allowedEmails.length === 0) {
                            const emails = window.prompt("共有を許可するユーザーのメールアドレスをカンマ区切りで入力してください:");
                            if (!emails || !emails.trim()) {
                               return;
                            }
                            const parsed = emails.split(/[,;\n\s]+/)
                              .map(e => e.trim())
                              .filter(e => e && e.includes('@') && e.indexOf('@') > 0 && e.indexOf('@') < e.length - 1);
                            const uniqueParsed = [...new Set(parsed)];
                            if (uniqueParsed.length === 0) {
                               return;
                            }
                            onVisibilityChange(observation.id, key as VisibilityType, uniqueParsed);
                         } else {
                            onVisibilityChange(observation.id, key as VisibilityType, observation.allowedEmails);
                         }
                      } else {
                         onVisibilityChange(observation.id, key as VisibilityType);
                      }
                    }}
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
