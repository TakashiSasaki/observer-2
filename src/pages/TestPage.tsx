import React, { useMemo, useState } from 'react';
import { CheckCircle2, Database, RefreshCw, ShieldCheck, XCircle } from 'lucide-react';
import { runObservationAcceptanceHarness } from '../domain/observationAcceptanceHarness';
import { CURRENT_SCHEMA_VERSION } from '../types';

export default function TestPage() {
  const [runNumber, setRunNumber] = useState(0);
  const result = useMemo(() => runObservationAcceptanceHarness(), [runNumber]);
  const passed = result.checks.filter((check) => check.passed).length;

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-8 text-slate-800 sm:px-6">
      <div className="mx-auto max-w-5xl space-y-5">
        <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="font-mono text-[11px] font-bold uppercase tracking-wider text-indigo-600">/test · in-memory acceptance</p>
              <h1 className="mt-2 text-xl font-extrabold text-slate-950">Observation v2 受入れハーネス</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                WP05のM01〜M03を、正規化cacheとprojectionを使って再現します。これはローカルメモリだけで動作し、Firestore/Authへの接続・書込みを行いません。
              </p>
            </div>
            <button
              type="button"
              onClick={() => setRunNumber((current) => current + 1)}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-indigo-700"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              再実行
            </button>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-800">結果</div>
              <div className="mt-1 text-2xl font-extrabold text-emerald-950">{passed}/{result.checks.length}</div>
            </div>
            <div className="rounded-xl border border-sky-200 bg-sky-50 p-4">
              <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-sky-800"><Database className="h-3.5 w-3.5" />保存先</div>
              <div className="mt-1 text-sm font-extrabold text-sky-950">Memory only</div>
            </div>
            <div className="rounded-xl border border-violet-200 bg-violet-50 p-4">
              <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-violet-800"><ShieldCheck className="h-3.5 w-3.5" />契約</div>
              <div className="mt-1 text-sm font-extrabold text-violet-950">v{CURRENT_SCHEMA_VERSION}</div>
            </div>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-3" aria-label="M01からM03の検証結果">
          {result.checks.map((check) => (
            <article key={check.id} className={`rounded-2xl border bg-white p-5 shadow-xs ${check.passed ? 'border-emerald-200' : 'border-rose-200'}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-mono text-xs font-extrabold text-slate-500">{check.id}</div>
                  <h2 className="mt-1 text-sm font-extrabold text-slate-950">{check.title}</h2>
                </div>
                {check.passed ? <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" /> : <XCircle className="h-5 w-5 shrink-0 text-rose-600" />}
              </div>
              <p className="mt-4 text-xs leading-5 text-slate-600">{check.detail}</p>
            </article>
          ))}
        </section>

        <section className="grid gap-5 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
            <h2 className="text-sm font-extrabold text-slate-950">正規化状態の推移</h2>
            <div className="mt-4 space-y-3 text-xs">
              {(Object.entries(result.snapshots) as Array<[keyof typeof result.snapshots, typeof result.snapshots.initial]>).map(([name, state]) => (
                <div key={name} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="font-mono font-bold text-slate-700">{name}</div>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-slate-600">
                    <span>Set {state.activeSetIds.length}</span>
                    <span>Obs {state.activeObservationIds.length}</span>
                    <span>Membership {state.membershipIds.length}</span>
                  </div>
                  <div className="mt-2 text-slate-500">Projected: {state.projectedSetIds.join(', ') || 'なし'}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
            <h2 className="text-sm font-extrabold text-slate-950">実行ログ</h2>
            <ol className="mt-4 space-y-3">
              {result.log.map((entry) => (
                <li key={entry.step} className="flex gap-3 text-xs">
                  <span className="mt-0.5 rounded bg-indigo-100 px-1.5 py-0.5 font-mono font-bold text-indigo-800">{entry.step}</span>
                  <span className="leading-5 text-slate-600"><strong className="text-slate-800">{entry.operation}</strong> — {entry.detail}</span>
                </li>
              ))}
            </ol>
            <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-950">
              このページは永続化・認証・ネットワークの受入れではありません。Firestore Rules Emulatorと実環境でのM01〜M03は別途実施します。
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
