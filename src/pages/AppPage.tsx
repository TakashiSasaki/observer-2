import React, { useState, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase';
import { ObservationSet, Observation, VisibilityType, ObservationType, ObserverUser } from '../types';
import {
  fetchObservations,
  createObservation,
  updateObservationVisibility,
  deleteObservation,
  formatUser,
  loginAnonymously,
} from '../services/firebaseService';
import { Navbar } from '../components/Navbar';
import { ObservationCard } from '../components/ObservationCard';
import { ObservationModal } from '../components/ObservationModal';
import { ObservationDetailModal } from '../components/ObservationDetailModal';
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
} from 'lucide-react';

export default function AppPage() {
  const [currentUser, setCurrentUser] = useState<ObserverUser | null>(null);
  const [observations, setObservations] = useState<ObservationSet[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Filters & Views
  const [activeFilter, setActiveFilter] = useState<'mine' | 'shared' | 'authenticated' | 'public'>('mine');
  const [activeViewMode, setActiveViewMode] = useState<'feed' | 'map'>('feed');
  const [typeFilter, setTypeFilter] = useState<ObservationType | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Modals
  const [isNewObsModalOpen, setIsNewObsModalOpen] = useState<boolean>(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(false);
  const [selectedObservation, setSelectedObservation] = useState<ObservationSet | null>(null);

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
    setIsLoading(true);
    try {
      const items = await fetchObservations(activeFilter, currentUser?.uid, currentUser?.email);
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
      console.error('Error loading observations:', err);
    } finally {
      setIsLoading(false);
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
      metadata: data.metadata,
      observationIds: data.observations ? data.observations.map((o) => o.id) : [],
      observations: data.observations || [],
      schemaVersion: '1.0.0',
      createdAt: new Date().toISOString(),
    });

    setObservations((prev) => [newDoc, ...prev]);
  };

  // Handle Visibility Toggle
  const handleVisibilityChange = async (id: string, newVis: VisibilityType, allowedEmails?: string[]) => {
    const target = observations.find((o) => o.id === id);
    const emailsToSave = newVis === 'shared' ? (allowedEmails || target?.allowedEmails || []) : [];
    try {
      await updateObservationVisibility(id, newVis, emailsToSave, target?.observationIds);
      setObservations((prev) =>
        prev.map((o) => {
          if (o.id === id) {
            const updatedChildObs = (o.observations || []).map((child) => ({
              ...child,
              visibility: newVis,
              allowedEmails: emailsToSave,
            }));
            return { ...o, visibility: newVis, allowedEmails: emailsToSave, observations: updatedChildObs };
          }
          return o;
        })
      );
      if (selectedObservation && selectedObservation.id === id) {
        const updatedChildObs = (selectedObservation.observations || []).map((child) => ({
          ...child,
          visibility: newVis,
          allowedEmails: emailsToSave,
        }));
        setSelectedObservation({
          ...selectedObservation,
          visibility: newVis,
          allowedEmails: emailsToSave,
          observations: updatedChildObs,
        });
      }
    } catch (err) {
      console.error('Failed to update visibility:', err);
      alert('開示範囲の更新に失敗しました。');
    }
  };

  // Handle Delete
  const handleDeleteObservation = async (id: string) => {
    const target = observations.find((o) => o.id === id);
    try {
      await deleteObservation(id, target?.observationIds);
      setObservations((prev) => prev.filter((o) => o.id !== id));
      if (selectedObservation?.id === id) {
        setSelectedObservation(null);
      }
    } catch (err) {
      console.error('Failed to delete observation:', err);
      alert('観測ログの削除に失敗しました。');
    }
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
      const matchObserver = item.observerName.toLowerCase().includes(q);
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

        {/* View Layouts */}
        {isLoading ? (
          <div className="p-12 text-center space-y-3 bg-white rounded-xl border border-slate-200 shadow-xs">
            <Loader2 className="w-8 h-8 text-blue-600 animate-spin mx-auto" />
            <div className="text-xs font-bold text-slate-700 font-mono">
              [SYSTEM] Loading observation telemetry from Firestore...
            </div>
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
        onClose={() => setSelectedObservation(null)}
        onVisibilityChange={handleVisibilityChange}
      />
    </div>
  );
}
