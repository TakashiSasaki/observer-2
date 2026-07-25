import React, { useState, useEffect, useRef } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase';
import { ObservationSetView, Observation, VisibilityType, ObservationType, ObserverUser } from '../types';
import {
  fetchObservations,
  fetchOwnedActiveObservations,
  createObservation,
  attachObservationToSet,
  detachObservationFromSet,
  updateObservationSetVisibility,
  softDeleteObservationSet,
  formatUser,
  loginAnonymously,
} from '../services/firebaseService';
import {
  attachObservationToSetView,
  detachObservationFromSetView,
  nextMembershipPosition,
  unattachedOwnedObservationsForSet,
} from '../domain/observationSetViewEditing';
import { Navbar } from '../components/Navbar';
import { ObservationCard } from '../components/ObservationCard';
import { ObservationModal } from '../components/ObservationModal';
import { ObservationDetailModal } from '../components/ObservationDetailModal';
import { ObservationExchangePanel } from '../components/ObservationExchangePanel';
import { MapView } from '../components/MapView';
import { AuthModal } from '../components/AuthModal';
import {
  Search,
  Filter,
  Plus,
  Radio,
  Sparkles,
  QrCode,
  Wifi,
  Eye,
  FileText,
  Edit3,
  Loader2,
  RefreshCw,
  Compass,
  AlertTriangle,
} from 'lucide-react';
import {
  isRemoteDataIntegrityError,
  isRemoteReadError,
  isRemoteReadLimitError,
} from '../domain/remoteReadPolicy';

function attachmentCandidatesErrorMessage(error: unknown): string {
  if (isRemoteDataIntegrityError(error)) {
    return 'Firestoreのv2データ契約に違反する記録を検出しました。追加候補を表示していません。データを修正した後に再試行してください。';
  }
  if (isRemoteReadLimitError(error)) {
    return `追加候補が上限${error.maximumResults}件を超えています。候補を完全には取得できないため、検索条件を狭めるか再試行してください。`;
  }
  if (isRemoteReadError(error)) {
    switch (error.kind) {
      case 'permission-denied':
        return '追加候補を読む権限がありません。認証中のユーザーとObservationの所有者を確認してください。';
      case 'unauthenticated':
        return '認証状態を確認できないため、追加候補を取得できません。再認証してから再試行してください。';
      case 'not-found':
        return '追加候補の読み取り先が見つかりません。Firestoreのv2コレクションを確認してください。';
      case 'failed-precondition':
        return 'Firestoreのquery前提条件を満たせません。必要なindexを確認してから再試行してください。';
      case 'resource-exhausted':
        return 'Firestoreの読み取り制限に達しました。少し待ってから再試行してください。';
      case 'unavailable':
      case 'deadline-exceeded':
      case 'aborted':
      case 'cancelled':
        return 'Firestoreへの一時的な読み取り障害です。候補は表示していないため、再試行してください。';
      default:
        return 'Firestoreから追加候補を取得できませんでした。エラーを確認して再試行してください。';
    }
  }
  return '追加可能な観測を取得できませんでした。ネットワークと認証状態を確認して再試行してください。';
}

export default function AppPage() {
  const [currentUser, setCurrentUser] = useState<ObserverUser | null>(null);
  const [observations, setObservations] = useState<ObservationSetView[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [dataLoadError, setDataLoadError] = useState<string | null>(null);
  const loadSequence = useRef(0);

  // Filters & Views
  const [activeFilter, setActiveFilter] = useState<'mine' | 'shared' | 'authenticated' | 'public'>('mine');
  const [activeViewMode, setActiveViewMode] = useState<'feed' | 'map'>('feed');
  const [typeFilter, setTypeFilter] = useState<ObservationType | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Modals
  const [isNewObsModalOpen, setIsNewObsModalOpen] = useState<boolean>(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(false);
  const [selectedObservation, setSelectedObservation] = useState<ObservationSetView | null>(null);
  const [attachmentCandidates, setAttachmentCandidates] = useState<Observation[]>([]);
  const [isAttachmentCandidatesLoading, setIsAttachmentCandidatesLoading] = useState(false);
  const [attachmentCandidatesError, setAttachmentCandidatesError] = useState<string | null>(null);

  // Initial Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setCurrentUser(formatUser(user));
      } else {
        // Auto sign-in anonymously for seamless guest observer experience
        try {
          const guestUser = await loginAnonymously();
          setCurrentUser(guestUser);
        } catch (err) {
          console.warn('Anonymous sign-in fallback:', err);
          const guestId = `guest_${Math.random().toString(36).substring(2, 9)}`;
          setCurrentUser({
            uid: guestId,
            displayName: 'ゲスト観測者',
            isAnonymous: true,
          });
        }
      }
    });

    return () => unsubscribe();
  }, []);

  // Fetch observations whenever filter or user changes
  const loadData = async () => {
    const requestId = ++loadSequence.current;
    setIsLoading(true);
    setDataLoadError(null);
    // Do not leave a previous filter's records visible while this request is
    // pending. A request that finishes out of order is ignored below.
    setObservations([]);
    setSelectedObservation(null);
    setAttachmentCandidates([]);
    setAttachmentCandidatesError(null);
    try {
      const items = await fetchObservations(activeFilter, currentUser?.uid, currentUser?.email);
      if (requestId !== loadSequence.current) return;
      setObservations(items);

      // Check deep link query parameter ?obsId=...
      const urlParams = new URLSearchParams(window.location.search);
      const obsId = urlParams.get('obsId');
      if (obsId) {
        const target = items.find((o) => o.id === obsId);
        if (target) {
          setSelectedObservation(target);
        }
      }
    } catch (err) {
      if (requestId !== loadSequence.current) return;
      console.error('Error loading observations:', err);
      // Never leave an earlier filter/view visible after a contract violation.
      // A stale list would make malformed v2 data look successfully loaded.
      setObservations([]);
      setSelectedObservation(null);
      setAttachmentCandidates([]);
      setDataLoadError(isRemoteDataIntegrityError(err)
        ? 'Firestoreのv2データ契約に違反する記録を検出しました。古い一覧は表示していません。データを修正した後に再読み込みしてください。'
        : '観測データを読み込めませんでした。認証状態とネットワークを確認して再読み込みしてください。');
    } finally {
      if (requestId === loadSequence.current) setIsLoading(false);
    }
  };

  useEffect(() => {
    if (currentUser) {
      loadData();
    }
  }, [currentUser, activeFilter]);

  // Handle Save New Observation
  const handleSaveObservation = async (data: {
    type: ObservationType;
    title: string;
    summary: string;
    rawContent: string;
    imageUrl?: string;
    imagePath?: string;
    location?: any;
    visibility: VisibilityType;
    allowedEmails?: string[];
    tags: string[];
    metadata?: Record<string, any>;
    observations?: Observation[];
  }) => {
    if (!currentUser) return;

    const newDoc = await createObservation({
      uid: currentUser.uid,
      observerName: currentUser.displayName,
      observerPhoto: currentUser.photoURL,
      type: data.type,
      title: data.title,
      summary: data.summary,
      rawContent: data.rawContent,
      imageUrl: data.imageUrl,
      imagePath: data.imagePath,
      location: data.location,
      visibility: data.visibility,
      allowedEmails: data.visibility === 'shared' ? (data.allowedEmails || []) : [],
      tags: data.tags,
      metadata: data.metadata || {},
      observations: data.observations || [],
    });

    setDataLoadError(null);
    setObservations((prev) => [newDoc, ...prev]);
  };

  // Handle Visibility Toggle
  const handleVisibilityChange = async (id: string, newVis: VisibilityType, allowedEmails?: string[]) => {
    const target = observations.find((o) => o.id === id);
    const emailsToSave = newVis === 'shared' ? (allowedEmails || target?.allowedEmails || []) : [];
    try {
      await updateObservationSetVisibility(id, newVis, emailsToSave);
      setObservations((prev) =>
        prev.map((o) => {
          if (o.id === id) {
            return { ...o, visibility: newVis, allowedEmails: emailsToSave };
          }
          return o;
        })
      );
      if (selectedObservation && selectedObservation.id === id) {
        setSelectedObservation({
          ...selectedObservation,
          visibility: newVis,
          allowedEmails: emailsToSave,
        });
      }
    } catch (err) {
      console.error('Failed to update visibility:', err);
      alert('開示範囲の更新に失敗しました。');
    }
  };

  // Handle Delete
  const handleDeleteObservation = async (id: string) => {
    try {
      await softDeleteObservationSet(id);
      setObservations((prev) => prev.filter((o) => o.id !== id));
      if (selectedObservation?.id === id) {
        setSelectedObservation(null);
      }
    } catch (err) {
      console.error('Failed to delete observation:', err);
      alert('観測ログの削除に失敗しました。');
    }
  };

  const replaceObservationSetView = (nextView: ObservationSetView) => {
    setObservations((previous) => previous.map((view) => (
      view.id === nextView.id ? nextView : view
    )));
    setSelectedObservation((previous) => (
      previous?.id === nextView.id ? nextView : previous
    ));
  };

  const loadAttachmentCandidates = async () => {
    const target = selectedObservation;
    if (!currentUser || !target || target.uid !== currentUser.uid) return;

    setIsAttachmentCandidatesLoading(true);
    setAttachmentCandidatesError(null);
    try {
      const ownedObservations = await fetchOwnedActiveObservations(currentUser.uid);
      setAttachmentCandidates(unattachedOwnedObservationsForSet(target, currentUser.uid, ownedObservations));
    } catch (error) {
      console.error('Failed to load attachable Observations:', error);
      setAttachmentCandidates([]);
      setAttachmentCandidatesError(attachmentCandidatesErrorMessage(error));
    } finally {
      setIsAttachmentCandidatesLoading(false);
    }
  };

  const handleAttachObservation = async (observationId: string) => {
    const target = selectedObservation;
    const candidate = attachmentCandidates.find((entry) => entry.id === observationId);
    if (!currentUser || !target || !candidate || target.uid !== currentUser.uid) {
      throw new Error('The selected ObservationSet and attachment candidate are no longer available.');
    }

    const membership = await attachObservationToSet(
      target.id,
      candidate.id,
      nextMembershipPosition(target),
    );
    const nextView = attachObservationToSetView(target, candidate, membership);
    replaceObservationSetView(nextView);
    setAttachmentCandidates((previous) => previous.filter((entry) => entry.id !== candidate.id));
  };

  const handleDetachObservation = async (observationId: string) => {
    const target = selectedObservation;
    const detachedObservation = target?.observations.find((entry) => entry.id === observationId);
    if (!currentUser || !target || !detachedObservation || target.uid !== currentUser.uid) {
      throw new Error('The selected ObservationSet member is no longer available.');
    }

    await detachObservationFromSet(target.id, observationId);
    const nextView = detachObservationFromSetView(target, observationId);
    replaceObservationSetView(nextView);
    setAttachmentCandidates((previous) => {
      const candidates = previous.some((entry) => entry.id === detachedObservation.id)
        ? previous
        : [...previous, detachedObservation];
      return unattachedOwnedObservationsForSet(nextView, currentUser.uid, candidates);
    });
  };

  // Search & Type Filter Logic
  const filteredObservations = observations.filter((item) => {
    if (typeFilter !== 'all' && item.type !== typeFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchTitle = item.title.toLowerCase().includes(q);
      const matchSummary = item.summary.toLowerCase().includes(q);
      const matchContent = item.rawContent.toLowerCase().includes(q);
      const matchTags = item.tags?.some((t) => t.toLowerCase().includes(q));
      const matchObserver = (item.observerName ?? '').toLowerCase().includes(q);
      return matchTitle || matchSummary || matchContent || matchTags || matchObserver;
    }
    return true;
  });

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800 font-sans flex flex-col">
      {/* Top Navbar */}
      {currentUser && (
        <Navbar
          currentUser={currentUser}
          activeFilter={activeFilter}
          activeViewMode={activeViewMode}
          onChangeFilter={setActiveFilter}
          onChangeViewMode={setActiveViewMode}
          onOpenNewObservation={() => setIsNewObsModalOpen(true)}
          onOpenAuth={() => setIsAuthModalOpen(true)}
        />
      )}

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-5 space-y-5">
        {/* Telemetry / Search & Filter Bar */}
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3">
          {/* Keyword Search */}
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="観測履歴・タグ・ID・観測者で検索..."
              className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-300 rounded-md text-xs text-slate-800 focus:outline-none focus:border-blue-600 focus:bg-white transition"
            />
          </div>

          {/* Type Filter Buttons */}
          <div className="flex flex-wrap items-center gap-1 text-xs">
            <span className="text-slate-400 font-bold mr-1 hidden sm:inline flex items-center gap-1 text-[11px] uppercase tracking-wider">
              <Filter className="w-3.5 h-3.5" /> 種別:
            </span>
            {[
              { type: 'all', label: 'すべて' },
              { type: 'qr', label: 'QR', icon: QrCode },
              { type: 'nfc', label: 'NFC', icon: Wifi },
              { type: 'object', label: '物体', icon: Eye },
              { type: 'ocr', label: 'OCR', icon: FileText },
              { type: 'manual', label: 'ノート', icon: Edit3 },
            ].map(({ type, label }) => (
              <button
                key={type}
                type="button"
                onClick={() => setTypeFilter(type as any)}
                className={`px-2.5 py-1 rounded text-xs font-bold transition cursor-pointer ${
                  typeFilter === type
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {label}
              </button>
            ))}

            <button
              type="button"
              onClick={loadData}
              title="データを再読み込み"
              className="p-1.5 bg-slate-100 hover:bg-slate-200 rounded text-slate-600 transition ml-1 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-blue-600' : ''}`} />
            </button>
          </div>
        </div>

        {currentUser && <ObservationExchangePanel currentUser={currentUser} />}

        {/* View Layouts */}
        {isLoading ? (
          <div className="p-12 text-center space-y-3 bg-white rounded-xl border border-slate-200 shadow-xs">
            <Loader2 className="w-8 h-8 text-blue-600 animate-spin mx-auto" />
            <div className="text-xs font-bold text-slate-700 font-mono">
              [SYSTEM] Loading observation telemetry from Firestore...
            </div>
          </div>
        ) : dataLoadError ? (
          <div className="mx-auto max-w-2xl rounded-xl border border-rose-200 bg-rose-50 p-8 text-center shadow-xs">
            <AlertTriangle className="mx-auto h-8 w-8 text-rose-600" />
            <h3 className="mt-3 text-sm font-bold text-rose-950">観測データを表示できません</h3>
            <p className="mt-2 text-xs leading-6 text-rose-900">{dataLoadError}</p>
            <button
              type="button"
              onClick={loadData}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-rose-700 px-4 py-2 text-xs font-bold text-white transition hover:bg-rose-800"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              再読み込み
            </button>
          </div>
        ) : activeViewMode === 'map' ? (
          <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
            <MapView
              observations={filteredObservations}
              onSelectObservation={(obs) => setSelectedObservation(obs)}
            />
          </div>
        ) : filteredObservations.length > 0 ? (
          /* Card Grid Feed */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {filteredObservations.map((obs) => (
              <ObservationCard
                key={obs.id}
                observation={obs}
                currentUserId={currentUser?.uid}
                onSelect={(selected) => setSelectedObservation(selected)}
                onVisibilityChange={handleVisibilityChange}
                onDelete={handleDeleteObservation}
              />
            ))}
          </div>
        ) : (
          /* Empty State Onboarding Card */
          <div className="bg-white border border-slate-200 rounded-xl p-8 text-center max-w-xl mx-auto space-y-4 shadow-xs">
            <div className="w-14 h-14 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600 mx-auto">
              <Radio className="w-7 h-7" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-bold text-slate-900">
                {activeFilter === 'mine'
                  ? '観測ログが未検出です'
                  : '表示対象の観測データがありません'}
              </h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                NFCタグのタッチ、QRコード読み取り、写真内の物体・AIテキスト識別など、新規観測を開始してください。
              </p>
            </div>

            <button
              type="button"
              onClick={() => setIsNewObsModalOpen(true)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg text-xs inline-flex items-center gap-2 shadow-xs transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              新規観測を記録
            </button>
          </div>
        )}
      </main>

      {/* High Density Status Telemetry Footer */}
      <footer className="mt-auto h-10 bg-white border-t border-slate-200 px-6 flex items-center justify-between flex-shrink-0 text-[10px] text-slate-500 font-mono">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5 font-bold text-slate-600">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            Firestore Connected
          </span>
          <span className="hidden sm:inline">User: {currentUser?.displayName || 'Guest'}</span>
          <span>Total Obs: {observations.length}</span>
        </div>
        <div className="text-slate-400">OBSERVE DASHBOARD &copy; 2026 v1.0.4-HIGH-DENSITY</div>
      </footer>

      {/* Modals */}
      {currentUser && (
        <ObservationModal
          currentUser={currentUser}
          isOpen={isNewObsModalOpen}
          onClose={() => setIsNewObsModalOpen(false)}
          onSaveObservation={handleSaveObservation}
        />
      )}

      {currentUser && (
        <AuthModal
          currentUser={currentUser}
          isOpen={isAuthModalOpen}
          onClose={() => setIsAuthModalOpen(false)}
          onUserChanged={setCurrentUser}
        />
      )}

      <ObservationDetailModal
        observation={selectedObservation}
        currentUserId={currentUser?.uid}
        onClose={() => {
          setSelectedObservation(null);
          setAttachmentCandidates([]);
          setAttachmentCandidatesError(null);
        }}
        onVisibilityChange={handleVisibilityChange}
        attachmentCandidates={attachmentCandidates}
        isAttachmentCandidatesLoading={isAttachmentCandidatesLoading}
        attachmentCandidatesError={attachmentCandidatesError}
        onLoadAttachmentCandidates={loadAttachmentCandidates}
        onAttachObservation={handleAttachObservation}
        onDetachObservation={handleDetachObservation}
      />
    </div>
  );
}
