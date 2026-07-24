import React from 'react';
import { Link } from 'react-router-dom';
import { Compass, Database, ArrowRight } from 'lucide-react';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4 font-sans">
      <div className="max-w-2xl w-full bg-white rounded-2xl shadow-xl overflow-hidden text-center border border-slate-100">
        <div className="bg-gradient-to-br from-blue-600 to-indigo-700 p-8 text-white relative overflow-hidden">
          <div className="flex justify-center mb-5">
            <div className="w-20 h-20 rounded-2xl bg-white/10 backdrop-blur-md p-3 flex items-center justify-center shadow-lg border border-white/20">
              <img src="/icon.svg" alt="Field Observer Hub Icon" className="w-full h-full object-contain filter drop-shadow-md" />
            </div>
          </div>
          <h1 className="text-4xl font-extrabold mb-2 tracking-tight">Field Observer Hub</h1>
          <p className="text-blue-100 text-lg font-medium">現地観測ログ管理システム</p>
        </div>
        
        <div className="p-8 space-y-8">
          <p className="text-slate-600 leading-relaxed text-left">
            このアプリケーションは、QRコード、NFC、OCR、手動入力による多様な観測データを統合的に記録・管理するためのプラットフォームです。位置情報や画像データとともに、対象物の状態を詳細に記録し、チーム内でセキュアに共有することができます。
          </p>
          
          <div className="grid sm:grid-cols-2 gap-4">
            <Link
              to="/app"
              className="flex items-center justify-center gap-2.5 p-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition shadow-md hover:shadow-lg"
            >
              <div className="w-6 h-6 rounded-md bg-white p-0.5 shadow-xs flex items-center justify-center shrink-0">
                <img src="/icon.svg" alt="App Icon" className="w-full h-full object-contain" />
              </div>
              <span>アプリを開く</span>
              <ArrowRight className="w-4 h-4 opacity-80 ml-0.5" />
            </Link>
            
            <Link
              to="/dev"
              className="flex items-center justify-center gap-2.5 p-4 bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200 rounded-xl font-bold transition shadow-sm"
            >
              <Database className="w-5 h-5 text-slate-500" />
              開発者向けドキュメント
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

