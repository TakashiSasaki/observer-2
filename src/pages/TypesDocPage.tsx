import React from 'react';
import { FileCode2, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import typesRaw from '../types.ts?raw';

export default function TypesDocPage() {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-white border-b border-slate-200 shadow-sm h-16 flex items-center px-4 sm:px-6">
        <div className="max-w-7xl mx-auto w-full flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/dev" className="text-slate-500 hover:text-slate-900 transition flex items-center gap-1.5 text-sm font-bold">
              <ArrowLeft className="h-4 w-4" />
              DevDocs
            </Link>
          </div>
        </div>
      </header>
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <FileCode2 className="h-6 w-6 text-indigo-600" />
            Types (src/types.ts)
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            アプリケーションのデータモデル、API契約、および型の定義のソースコード全体です。
          </p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="bg-slate-900 px-4 py-3 flex items-center justify-between border-b border-slate-800">
            <div className="flex gap-2">
              <div className="h-3 w-3 rounded-full bg-red-500"></div>
              <div className="h-3 w-3 rounded-full bg-amber-500"></div>
              <div className="h-3 w-3 rounded-full bg-emerald-500"></div>
            </div>
            <span className="text-xs font-mono text-slate-400">src/types.ts</span>
          </div>
          <div className="overflow-x-auto p-4 bg-[#0d1117]">
            <pre className="text-sm font-mono text-slate-300 leading-relaxed">
              <code>{typesRaw}</code>
            </pre>
          </div>
        </div>
      </main>
    </div>
  );
}
