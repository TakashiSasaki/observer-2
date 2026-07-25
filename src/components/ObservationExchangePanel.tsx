import React, { useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileCheck2,
  Loader2,
  Upload,
} from 'lucide-react';
import {
  invalidObservationInterchangeImportDryRunReport,
  MAX_INTERCHANGE_FILE_BYTES,
  MAX_INTERCHANGE_RECORDS,
  serializeObservationInterchangeBundle,
  type ObservationInterchangeImportDryRunReport,
} from '../domain/observationInterchange';
import {
  dryRunOwnedObservationInterchangeImport,
  exportOwnedObservationInterchangeBundle,
} from '../services/firebaseService';
import { isRemoteDataIntegrityError } from '../domain/remoteReadPolicy';
import { CURRENT_SCHEMA_VERSION, type ObserverUser } from '../types';

type Status = { tone: 'success' | 'error'; message: string } | null;

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function formatBytes(bytes: number): string {
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

function exchangeErrorMessage(error: unknown, fallback: string): string {
  if (isRemoteDataIntegrityError(error)) {
    return 'Firestoreのv2データ契約に違反する記録を検出しました。古いcacheをexchangeの結果として使っていません。';
  }
  return errorMessage(error, fallback);
}

export const ObservationExchangePanel: React.FC<{ currentUser: ObserverUser }> = ({ currentUser }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isWorking, setIsWorking] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const [report, setReport] = useState<ObservationInterchangeImportDryRunReport | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);

  const handleExport = async () => {
    setIsWorking(true);
    setStatus(null);
    setReport(null);
    try {
      const bundle = await exportOwnedObservationInterchangeBundle(currentUser.uid, currentUser.email);
      const serialized = serializeObservationInterchangeBundle(bundle);
      const blob = new Blob([serialized], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      anchor.href = url;
      anchor.download = `observer-${CURRENT_SCHEMA_VERSION}-${stamp}.json`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
      setStatus({
        tone: 'success',
        message: `v${CURRENT_SCHEMA_VERSION} bundleをダウンロードしました（Observation ${bundle.observations.length}件、Set ${bundle.observationSets.length}件、Membership ${bundle.memberships.length}件）。`,
      });
    } catch (error) {
      setStatus({ tone: 'error', message: `exportに失敗しました: ${exchangeErrorMessage(error, '所有者データを取得できませんでした。')}` });
    } finally {
      setIsWorking(false);
    }
  };

  const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setSelectedFileName(file.name);
    setStatus(null);
    setReport(null);
    if (file.size > MAX_INTERCHANGE_FILE_BYTES) {
      const oversizedReport = invalidObservationInterchangeImportDryRunReport(
        currentUser.uid,
        `選択したファイルは${formatBytes(file.size)}です。上限${formatBytes(MAX_INTERCHANGE_FILE_BYTES)}を超えています。`,
      );
      setReport(oversizedReport);
      setStatus({ tone: 'error', message: 'import dry-runは受理できませんでした。Firestoreには書き込んでいません。' });
      return;
    }

    setIsWorking(true);
    try {
      const result = await dryRunOwnedObservationInterchangeImport(
        await file.text(),
        currentUser.uid,
        currentUser.email,
      );
      setReport(result);
      setStatus({
        tone: result.valid ? 'success' : 'error',
        message: result.valid
          ? 'import dry-runに成功しました。Firestoreには書き込んでいません。'
          : 'import dry-runは受理できませんでした。Firestoreには書き込んでいません。',
      });
    } catch (error) {
      setStatus({ tone: 'error', message: `import dry-runに失敗しました: ${exchangeErrorMessage(error, '現在の所有者データを取得できませんでした。')}` });
    } finally {
      setIsWorking(false);
    }
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs" aria-label="データ交換">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <FileCheck2 className="h-4 w-4 text-indigo-600" />
            v{CURRENT_SCHEMA_VERSION} データ交換
          </h2>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-600">
            所有する正規化データを決定的JSONとしてexportし、JSONファイルをFirestoreへ書き込まずに構造・意味・所有者・衝突だけ検証します。
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <button
            type="button"
            onClick={handleExport}
            disabled={isWorking}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isWorking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            JSONをexport
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isWorking}
            className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-800 transition hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isWorking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            import dry-run
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={handleImportFile}
          />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-mono text-slate-500">
        <span className="rounded bg-slate-100 px-2 py-1">max {formatBytes(MAX_INTERCHANGE_FILE_BYTES)}</span>
        <span className="rounded bg-slate-100 px-2 py-1">max {MAX_INTERCHANGE_RECORDS} records</span>
        {selectedFileName && <span className="max-w-full truncate rounded bg-slate-100 px-2 py-1">file: {selectedFileName}</span>}
      </div>

      {status && (
        <div className={`mt-3 flex items-start gap-2 rounded-lg border p-3 text-xs leading-5 ${status.tone === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-rose-200 bg-rose-50 text-rose-900'}`} role="status">
          {status.tone === 'success' ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}
          <span>{status.message}</span>
        </div>
      )}

      {report && (
        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div><span className="block text-[10px] text-slate-500">Observation</span><strong>{report.counts.observations}</strong></div>
            <div><span className="block text-[10px] text-slate-500">ObservationSet</span><strong>{report.counts.observationSets}</strong></div>
            <div><span className="block text-[10px] text-slate-500">Membership</span><strong>{report.counts.memberships}</strong></div>
            <div><span className="block text-[10px] text-slate-500">soft-delete</span><strong>{report.deleted.total}</strong></div>
          </div>
          <div className="mt-3 grid gap-2 text-slate-600 sm:grid-cols-3">
            <span>参照: {report.references.observations} Observations / {report.references.observationSets} Sets</span>
            <span>衝突: {report.collisions.conflicting}件（同一: {report.collisions.identical}件）</span>
            <span>所有者不一致: {report.ownership.foreignRecords}件</span>
          </div>
          {report.errors.length > 0 && (
            <ul className="mt-3 list-disc space-y-1 pl-5 text-rose-800">
              {report.errors.slice(0, 8).map((message, index) => <li key={`${message}-${index}`}>{message}</li>)}
              {report.errors.length > 8 && <li>ほか {report.errors.length - 8}件</li>}
            </ul>
          )}
        </div>
      )}
    </section>
  );
};
