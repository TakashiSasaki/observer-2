import React from 'react';
import { ObserverUser } from '../types';
import { loginWithGoogle, loginAnonymously, logoutUser } from '../services/firebaseService';
import { X, Shield, UserCheck, LogOut, Sparkles, User } from 'lucide-react';

interface AuthModalProps {
  currentUser: ObserverUser;
  isOpen: boolean;
  onClose: () => void;
  onUserChanged: (user: ObserverUser) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  currentUser,
  isOpen,
  onClose,
  onUserChanged,
}) => {
  if (!isOpen) return null;

  const handleGoogleLogin = async () => {
    try {
      const u = await loginWithGoogle();
      onUserChanged(u);
      onClose();
    } catch (err: any) {
      console.error('Google Sign-In error:', err);
      alert('Googleログインに失敗しました。');
    }
  };

  const handleGuestLogin = async () => {
    try {
      const u = await loginAnonymously();
      onUserChanged(u);
      onClose();
    } catch (err: any) {
      console.error('Guest Sign-In error:', err);
      alert('匿名アクセス生成に失敗しました。');
    }
  };

  const handleLogout = async () => {
    try {
      await logoutUser();
      const u = await loginAnonymously();
      onUserChanged(u);
      onClose();
    } catch (err: any) {
      console.error('Logout error:', err);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 p-6 space-y-5 animate-in fade-in zoom-in-95 duration-200 text-slate-800">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-indigo-600" />
            <h2 className="font-bold text-base text-slate-900">観測者 (Observer) アカウント管理</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Profile Card */}
        <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-center">
          <div className="w-14 h-14 rounded-full bg-slate-200 text-slate-600 font-bold flex items-center justify-center mx-auto shadow-sm overflow-hidden border border-slate-300">
            {currentUser.photoURL ? (
              <img src={currentUser.photoURL} alt={currentUser.displayName} className="w-full h-full object-cover" />
            ) : (
              <User className="w-8 h-8 text-slate-500" />
            )}
          </div>
          <div>
            <div className="font-bold text-slate-900 text-base">{currentUser.displayName}</div>
            <div className="text-xs text-indigo-600 font-semibold mt-0.5">
              {currentUser.isAnonymous ? 'ゲスト観測者 (端末固有ID)' : `認証済み観測者 (${currentUser.email || 'Google'})`}
            </div>
            <div className="text-[10px] text-slate-400 font-mono mt-1">UID: {currentUser.uid}</div>
          </div>
        </div>

        {/* Context info */}
        <p className="text-xs text-slate-600 leading-relaxed">
          認証プロバイダは <strong>Google 認証</strong> および <strong>匿名ユーザー（Firebase Authentication ゲストアクセス）</strong> に対応しています。
        </p>

        {/* Buttons */}
        <div className="space-y-2">
          {currentUser.isAnonymous ? (
            <>
              <button
                type="button"
                onClick={handleGoogleLogin}
                className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer shadow-xs"
              >
                <UserCheck className="w-4 h-4" />
                Google アカウントでログイン
              </button>
              <button
                type="button"
                onClick={handleGuestLogin}
                className="w-full py-2 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition cursor-pointer"
              >
                <Sparkles className="w-4 h-4 text-amber-500" />
                匿名ユーザーとして続行
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={handleLogout}
              className="w-full py-2.5 px-4 bg-slate-100 hover:bg-rose-50 hover:text-rose-600 text-slate-700 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              サインアウト (匿名ユーザーに戻る)
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
