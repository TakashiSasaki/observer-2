import React from 'react';
import { ObserverUser } from '../types';
import { Plus, Compass, LayoutGrid, User } from 'lucide-react';
import { AIModelSelector } from './AIModelSelector';

interface NavbarProps {
  currentUser: ObserverUser;
  activeFilter: 'mine' | 'shared' | 'authenticated' | 'public';
  activeViewMode: 'feed' | 'map';
  onChangeFilter: (filter: 'mine' | 'shared' | 'authenticated' | 'public') => void;
  onChangeViewMode: (mode: 'feed' | 'map') => void;
  onOpenNewObservation: () => void;
  onOpenAuth: () => void;
  totalCount?: number;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentUser,
  activeFilter,
  activeViewMode,
  onChangeFilter,
  onChangeViewMode,
  onOpenNewObservation,
  onOpenAuth,
}) => {
  return (
    <header className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        {/* Brand / Logo & Observer Badge */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm shadow-slate-200 shrink-0 p-1.5 border border-slate-200">
            <img src="/icon.svg" alt="App Icon" className="w-full h-full object-contain" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-bold text-slate-800 tracking-tight">
                OBSERVE <span className="text-xs font-mono text-blue-600">v1.0</span>
              </h1>
              <span className="hidden sm:inline-block px-2 py-0.5 bg-blue-50 text-blue-600 text-[10px] font-bold rounded uppercase tracking-wider border border-blue-100">
                Observer-Mode
              </span>
            </div>
            <p className="text-[11px] text-slate-500 font-medium hidden md:block">
              NFC • QR • AI画像認識 • OCR 統合観測ダッシュボード
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Quick AI Model Switcher (Hidden on mobile) */}
          <div className="hidden lg:block">
            <AIModelSelector compact />
          </div>

          {/* New Observation Button */}
          <button
            type="button"
            onClick={onOpenNewObservation}
            className="bg-blue-600 text-white px-3.5 py-2 rounded-lg text-xs font-bold hover:bg-blue-700 shadow-sm transition flex items-center gap-1.5 active:scale-95 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>新規観測を開始</span>
          </button>

          {/* User Profile Badge */}
          <button
            type="button"
            onClick={onOpenAuth}
            className="p-1 sm:px-3 sm:py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg flex items-center gap-2 transition text-xs cursor-pointer"
          >
            <div className="w-6 h-6 rounded-full bg-slate-200 border border-slate-300 text-slate-700 flex items-center justify-center overflow-hidden shrink-0">
              {currentUser.photoURL ? (
                <img src={currentUser.photoURL} alt={currentUser.displayName} className="w-full h-full object-cover" />
              ) : (
                <User className="w-3.5 h-3.5 text-slate-500" />
              )}
            </div>
            <div className="text-left hidden sm:block">
              <div className="font-bold text-slate-800 text-xs truncate max-w-[110px]">
                {currentUser.displayName}
              </div>
              <div className="text-[10px] text-slate-500 font-mono">
                {currentUser.isAnonymous ? 'ゲスト観測者' : '認証済み'}
              </div>
            </div>
          </button>
        </div>
      </div>

      {/* Sub-Header Navigation Filter Bar */}
      <div className="bg-slate-50/80 border-t border-slate-200 px-4 sm:px-6 py-1.5">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2 text-xs font-medium">
          {/* Filter Modes */}
          <div className="flex flex-wrap gap-1 bg-white p-1 rounded-lg border border-slate-200 shadow-xs">
            <button
              type="button"
              onClick={() => onChangeFilter('mine')}
              className={`px-3 py-1 rounded-md text-xs font-bold transition cursor-pointer ${
                activeFilter === 'mine'
                  ? 'bg-blue-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              マイ観測 (自分のみ)
            </button>
            <button
              type="button"
              onClick={() => onChangeFilter('authenticated')}
              className={`px-3 py-1 rounded-md text-xs font-bold transition cursor-pointer ${
                activeFilter === 'authenticated'
                  ? 'bg-blue-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              認証全ユーザー開示
            </button>
            <button
              type="button"
              onClick={() => onChangeFilter('shared')}
              className={`px-3 py-1 rounded-md text-xs font-bold transition cursor-pointer ${
                activeFilter === 'shared'
                  ? 'bg-blue-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              特定メール限定共有
            </button>
            <button
              type="button"
              onClick={() => onChangeFilter('public')}
              className={`px-3 py-1 rounded-md text-xs font-bold transition cursor-pointer ${
                activeFilter === 'public'
                  ? 'bg-blue-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              認証無し開示 (全体)
            </button>
          </div>

          {/* View Layout Mode Toggle */}
          <div className="flex gap-1 bg-white p-1 rounded-lg border border-slate-200 shadow-xs">
            <button
              type="button"
              onClick={() => onChangeViewMode('feed')}
              className={`px-3 py-1 rounded-md text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                activeViewMode === 'feed'
                  ? 'bg-slate-800 text-white'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              ダッシュボード
            </button>
            <button
              type="button"
              onClick={() => onChangeViewMode('map')}
              className={`px-3 py-1 rounded-md text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                activeViewMode === 'map'
                  ? 'bg-slate-800 text-white'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <Compass className="w-3.5 h-3.5" />
              観測マップ
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};

