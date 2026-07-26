import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  Check,
  CheckCircle2,
  Clock3,
  Code2,
  Copy,
  Database,
  FileJson,
  HardDrive,
  Route,
  Server,
  ShieldCheck,
  Workflow,
  Wrench,
  Loader2,
  Trash2,
} from 'lucide-react';
import { CURRENT_SCHEMA_VERSION, FIRESTORE_COLLECTIONS } from '../types';
import { loadDummyData, removeDummyData } from '../utils/dummyDataUtils';

type TabId = 'overview' | 'data' | 'security' | 'exchange' | 'delivery' | 'tools';

const tabs: Array<{ id: TabId; label: string }> = [
  { id: 'overview', label: '概要・サーフェス' },
  { id: 'data', label: 'データモデル' },
  { id: 'security', label: 'ACL・永続化' },
  { id: 'exchange', label: '交換・実行環境' },
  { id: 'delivery', label: 'WP・開発運用' },
  { id: 'tools', label: '開発ツール' },
];

const collectionRows = [
  {
    path: `/${FIRESTORE_COLLECTIONS.observations}/{observationId}`,
    role: '個別Observationの正本',
    id: '小文字UUIDv7',
    lifecycle: '論理削除',
  },
  {
    path: `/${FIRESTORE_COLLECTIONS.observationSets}/{observationSetId}`,
    role: 'ObservationSetの正本',
    id: '小文字UUIDv7',
    lifecycle: '論理削除',
  },
  {
    path: `/${FIRESTORE_COLLECTIONS.memberships}/{setId}__{observationId}`,
    role: '所属関係と集合内順序の正本',
    id: '決定的tuple ID',
    lifecycle: 'detach時のみ物理削除',
  },
];

const surfaceRows = [
  { surface: 'public', path: '/', status: '実装済み', role: '説明と入口' },
  { surface: 'app', path: '/app', status: '実装済み', role: '通常利用' },
  { surface: 'admin', path: '/admin', status: '予約', role: '管理・監査' },
  { surface: 'dev', path: '/dev', status: '実装済み', role: '内部開発文書・状態' },
  { surface: 'api', path: '/api', status: '部分実装', role: '外部契約。machine APIは /api/vN 以下' },
  { surface: 'test', path: '/test', status: '実装済み', role: 'Firestore無書込のM01〜M03 in-memory受入れハーネス' },
];

const workPackageRows = [
  { id: 'WP00', scope: 'ハーネスと外部検証入口', status: 'accepted', remaining: '固定A8基線を保存' },
  { id: 'WP01', scope: 'v2型と不変条件', status: 'implemented', remaining: '最終台帳のcloseout' },
  { id: 'WP02', scope: 'Membership・投影・cache', status: 'implemented', remaining: '最終台帳のcloseout' },
  { id: 'WP03', scope: 'Firestore query・index', status: 'implemented', remaining: '本番index反映は運用作業' },
  { id: 'WP04', scope: 'Rules・Emulator', status: 'implemented', remaining: '最終treeでもJDK 21検証' },
  { id: 'WP05', scope: 'UI', status: 'implemented', remaining: 'M01〜M03とcomposite操作の手動受入' },
  { id: 'WP06', scope: '交換形式2.0.0', status: 'partial', remaining: 'Firestore import commitの方針と実装' },
  { id: 'WP07', scope: 'legacy除去・最終検証', status: 'partial', remaining: '実Firestore/Auth受入・closeout' },
];

const sourceRows = [
  ['型', 'src/types.ts'],
  ['ドメイン不変条件', 'src/domain/observationDomain.ts'],
  ['cache scope/freshness', 'src/domain/cachePolicy.ts'],
  ['交換意味検証', 'src/domain/observationInterchange.ts'],
  ['交換構造', 'schemas/observation-interchange.schema.json'],
  ['Firestore操作', 'src/services/firebaseService.ts'],
  ['クエリ', 'src/services/firestoreQueryPlan.ts'],
  ['認可・書込検証', 'firestore.rules'],
  ['索引', 'firestore.indexes.json'],
  ['現在のWP状態', 'docs/work-packages.md'],
];

function Panel({
  title,
  icon,
  children,
  className = '',
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6 ${className}`}>
      <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
        {icon}
        {title}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function StatusBadge({ status }: { status: string }) {
  const tone = status === 'accepted' || status === 'implemented'
    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
    : status === 'manual pending'
      ? 'border-amber-200 bg-amber-50 text-amber-800'
      : 'border-blue-200 bg-blue-50 text-blue-800';
  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 font-mono text-[10px] font-bold uppercase ${tone}`}>
      {status}
    </span>
  );
}

function DummyDataPanel() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  const handleProgress = (msg: string) => {
    setLogs(prev => [...prev, msg]);
  };

  const handleCopyLogs = async () => {
    if (logs.length === 0) return;
    try {
      await navigator.clipboard.writeText(logs.join('\n'));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy logs:', err);
    }
  };

  const handleLoad = async () => {
    setLoading(true);
    setMessage(null);
    setError(null);
    setLogs([]);
    try {
      await loadDummyData(5, handleProgress);
      setMessage('ダミーデータ（5件のSetと10件のObservation）を作成しました。');
    } catch (err: any) {
      setError(err.message || 'ダミーデータの作成に失敗しました。');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    setLoading(true);
    setMessage(null);
    setError(null);
    setLogs([]);
    try {
      const result = await removeDummyData(handleProgress);
      setMessage(`ダミーデータを削除しました (Sets: ${result.deletedSets}, Observations: ${result.deletedObservations})。`);
    } catch (err: any) {
      setError(err.message || 'ダミーデータの削除に失敗しました。');
    } finally {
      setLoading(false);
    }
  };

  const renderErrorContent = (errorStr: string) => {
    try {
      const parsed = JSON.parse(errorStr);
      if (parsed && typeof parsed === 'object' && parsed.error) {
        return (
          <div className="space-y-1.5">
            <div className="font-bold">{parsed.error}</div>
            <div className="rounded bg-rose-100/80 p-2 font-mono text-[11px] text-rose-900 space-y-0.5">
              <div><span className="font-semibold">Operation:</span> {parsed.operationType}</div>
              {parsed.path && <div><span className="font-semibold">Path:</span> {parsed.path}</div>}
              {parsed.authInfo?.userId && <div><span className="font-semibold">User ID:</span> {parsed.authInfo.userId}</div>}
            </div>
          </div>
        );
      }
    } catch {
      // Not JSON
    }
    return <span>{errorStr}</span>;
  };

  return (
    <Panel title="ダミーデータ管理" icon={<Wrench className="h-5 w-5 text-indigo-600" />}>
      <p className="text-sm leading-6 text-slate-600">
        開発・テスト用のダミーデータを生成・削除します。生成されるデータは <code>metadata.isDummyData = true</code> を持ち、削除時はこのフラグを元に論理削除（Membershipは物理削除）を行います。
      </p>

      {message && (
        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs leading-6 text-emerald-950">
          <CheckCircle2 className="mb-1 inline-block h-4 w-4 text-emerald-600" /> {message}
        </div>
      )}

      {error && (
        <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs leading-6 text-rose-950">
          <AlertTriangle className="mb-1 inline-block h-4 w-4 text-rose-600 align-top mr-1" />
          <div className="inline-block">{renderErrorContent(error)}</div>
        </div>
      )}

      <div className="mt-5 flex flex-wrap gap-3">
        <button
          type="button"
          disabled={loading}
          onClick={handleLoad}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-indigo-700 disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
          ダミーデータロード
        </button>
        <button
          type="button"
          disabled={loading}
          onClick={handleDelete}
          className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-rose-700 disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
          ダミーデータ削除
        </button>
      </div>

      {logs.length > 0 && (
        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-950 p-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-xs font-bold text-slate-400">実行ログ</h3>
            <button
              onClick={handleCopyLogs}
              className="inline-flex items-center gap-1.5 rounded bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-slate-300 transition hover:bg-slate-700 hover:text-white"
            >
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                  <span className="text-emerald-400">コピーしました</span>
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  <span>ログをコピー</span>
                </>
              )}
            </button>
          </div>
          <div ref={scrollRef} className="max-h-60 overflow-y-auto pr-2">
            {logs.map((log, i) => (
              <div key={i} className="font-mono text-xs leading-5 text-emerald-300 break-all">
                {log}
              </div>
            ))}
          </div>
        </div>
      )}
    </Panel>
  );
}

export default function DevDocPage() {
  const [activeTab, setActiveTab] = useState<TabId>(() => {
    const hash = window.location.hash.replace('#', '') as TabId;
    return tabs.some(t => t.id === hash) ? hash : 'overview';
  });

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace('#', '') as TabId;
      if (tabs.some(t => t.id === hash)) {
        setActiveTab(hash);
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  return (
    <main className="min-h-screen bg-slate-100 px-3 py-6 text-slate-800 sm:px-8">
      <div className="mx-auto max-w-6xl space-y-5">
        <header className="rounded-2xl border border-slate-800 bg-slate-950 p-6 text-white shadow-lg sm:p-8">
          <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
            <div>
              <p className="font-mono text-xs font-bold tracking-[0.2em] text-sky-300">
                OBSERVER · INTERNAL DEVELOPER SURFACE
              </p>
              <h1 className="mt-2 text-2xl font-extrabold sm:text-3xl">実装・データ契約・作業状態</h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">
                現在の正本はObservation、ObservationSet、Membershipの3エンティティです。このページは実装者向け要約であり、完全な仕様はリポジトリのREADME、AGENTS、docs、schema、Rules、testsを合わせて確認します。
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <span className="rounded-lg border border-sky-700 bg-sky-950 px-3 py-1.5 font-mono text-xs font-bold text-sky-200">
                schema {CURRENT_SCHEMA_VERSION}
              </span>
              <span className="rounded-lg border border-emerald-700 bg-emerald-950 px-3 py-1.5 font-mono text-xs font-bold text-emerald-200">
                normalized M:N
              </span>
            </div>
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              to="/app"
              className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-xs font-bold text-slate-900 transition hover:bg-slate-100"
            >
              <ArrowLeft className="h-4 w-4" />
              アプリへ
            </Link>
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-2 text-xs font-bold text-slate-200 transition hover:bg-slate-900"
            >
              公開面へ
            </Link>
          </div>
        </header>

        <nav className="flex gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-sm" aria-label="開発者文書">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                window.location.hash = tab.id;
                setActiveTab(tab.id);
              }}
              className={`whitespace-nowrap rounded-lg px-3 py-2 text-xs font-bold transition sm:px-4 ${
                activeTab === tab.id
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        {activeTab === 'overview' && (
          <div className="space-y-5">
            <Panel title="アプリケーションの目的" icon={<BookOpen className="h-5 w-5 text-blue-600" />}>
              <p className="text-sm leading-7 text-slate-600">
                QR、NFC、OCR、AI物体認識、手動入力による現地観測を、画像・位置・時刻・観測者表示情報・ACLとともに記録します。一つのObservationを複数のObservationSetで再利用でき、集合から外しても観測本体や他集合との関係は残ります。
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  ['入力', 'QR / NFC / OCR / Object / Manual'],
                  ['閲覧', 'feed / map / search / type filter'],
                  ['共有', 'public / authenticated / shared / private'],
                  ['関係', 'attach / membership-only detach'],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</div>
                    <div className="mt-1 text-xs font-semibold text-slate-800">{value}</div>
                  </div>
                ))}
              </div>
              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs leading-6 text-amber-950">
                <strong>境界:</strong> Objects、Markers、Places、append-only association factsは広い製品ロードマップです。現在のschema 2.0.0へ場当たり的なフィールドとして追加しません。
              </div>
            </Panel>

            <Panel title="インターフェイス・サーフェス" icon={<Route className="h-5 w-5 text-indigo-600" />}>
              <p className="text-sm leading-6 text-slate-600">
                パス名は利用者と責務の共通語彙です。ソースディレクトリ構造と一対一に対応させる必要はありません。
              </p>
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500">
                      <th className="p-2.5">Surface</th>
                      <th className="p-2.5">Path</th>
                      <th className="p-2.5">状態</th>
                      <th className="p-2.5">責務</th>
                    </tr>
                  </thead>
                  <tbody>
                    {surfaceRows.map((row) => (
                      <tr key={row.surface} className="border-b border-slate-100 align-top">
                        <td className="p-2.5 font-bold">{row.surface}</td>
                        <td className="p-2.5 font-mono text-blue-800">{row.path}</td>
                        <td className="p-2.5">{row.status}</td>
                        <td className="p-2.5 text-slate-600">{row.role}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>

            <div className="grid gap-5 lg:grid-cols-2">
              <Panel title="現在の主要ワークフロー" icon={<Workflow className="h-5 w-5 text-emerald-600" />}>
                <ol className="list-decimal space-y-2 pl-5 text-sm leading-6 text-slate-600">
                  <li>Firebase Auth。未ログイン時は匿名認証を試行。</li>
                  <li>1件のObservationをcapture（serviceは複数draftに対応）。</li>
                  <li>Set・Observation・Membershipを同一batchで作成。</li>
                  <li>正規化データからfeed/map用Viewを再構築。</li>
                  <li>所有する既存Observationを別Setへattach。</li>
                  <li>detach時はMembershipだけを削除。</li>
                </ol>
              </Panel>
              <Panel title="現在未実装の提供面" icon={<Clock3 className="h-5 w-5 text-amber-600" />}>
                <ul className="list-disc space-y-2 pl-5 text-sm leading-6 text-slate-600">
                  <li>衝突・所有権ポリシーを伴うFirestore import commit。</li>
                  <li><code>/admin</code> と、実Firestore/Authへ接続した受入れ記録。</li>
                  <li>versioned external API <code>/api/vN</code>。</li>
                  <li>Cloud Storage upload・cleanup・URL lifecycle。</li>
                  <li>Observation更新・削除およびMembership並べ替えの完全なUI。</li>
                  <li>bounded owner readはcursor pageと次ページprobeで完全性を確認。</li>
                </ul>
              </Panel>
            </div>
          </div>
        )}

        {activeTab === 'data' && (
          <div className="space-y-5">
            <Panel title="データモデル型定義" icon={<FileJson className="h-5 w-5 text-indigo-600" />}>
              <p className="text-sm leading-6 text-slate-600">
                <code>src/types.ts</code> で定義されている主要な型です。正本エンティティとビュー、キャッシュが明確に分離されています。
                より詳細な全ての型定義は<a href="/dev/types" className="text-blue-600 hover:underline">こちら（/dev/types）</a>を参照してください。
              </p>
              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <h3 className="text-sm font-bold text-slate-900">Observation</h3>
                  <p className="mt-1 text-xs leading-5 text-slate-600">
                    個別の観測データの正本。親SetのIDを一切保持しません。
                  </p>
                  <pre className="mt-2 overflow-x-auto rounded-lg bg-slate-50 p-2 text-[10px] text-slate-800 border border-slate-100">
{`interface Observation {
  id: string; // Firestore document IDと同一
  uid: string; // 所有者
  type: ObservationType;
  metadata: ObservationMetadata;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null; // 論理削除
}`}</pre>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <h3 className="text-sm font-bold text-slate-900">ObservationSet</h3>
                  <p className="mt-1 text-xs leading-5 text-slate-600">
                    グループ化エンティティの正本。子Observationの埋め込みやID配列を一切保持しません。
                  </p>
                  <pre className="mt-2 overflow-x-auto rounded-lg bg-slate-50 p-2 text-[10px] text-slate-800 border border-slate-100">
{`interface ObservationSet {
  id: string;
  uid: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}`}</pre>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <h3 className="text-sm font-bold text-slate-900">ObservationSetMembership</h3>
                  <p className="mt-1 text-xs leading-5 text-slate-600">
                    所属関係と順序の正本。多対多の関連テーブルに相当します。
                  </p>
                  <pre className="mt-2 overflow-x-auto rounded-lg bg-slate-50 p-2 text-[10px] text-slate-800 border border-slate-100">
{`interface ObservationSetMembership {
  id: string; // \`\${setId}__\${observationId}\`
  observationSetId: string;
  observationId: string;
  uid: string;
  position: number; // 集合内の順序
  schemaVersion: '2.0.0';
  createdAt: string;
}`}</pre>
                </div>
                <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4 shadow-sm">
                  <h3 className="text-sm font-bold text-emerald-900">ObservationSetView / NormalizedCache</h3>
                  <p className="mt-1 text-xs leading-5 text-emerald-800">
                    これらは実行時の状態であり、直接Firestoreへ保存してはなりません。
                  </p>
                  <pre className="mt-2 overflow-x-auto rounded-lg bg-white/60 p-2 text-[10px] text-emerald-900 border border-emerald-200/50">
{`interface ObservationSetView extends ObservationSet {
  observations: Observation[];
  memberships: ObservationSetMembership[];
}

interface NormalizedObservationCache {
  observations: Record<string, Observation>;
  observationSets: Record<string, ObservationSet>;
  memberships: Record<string, ObservationSetMembership>;
}`}</pre>
                </div>
              </div>
            </Panel>

            <Panel title="正本コレクション" icon={<Database className="h-5 w-5 text-blue-600" />}>
              <div className="overflow-x-auto">
                <table className="min-w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500">
                      <th className="p-2.5">Path</th>
                      <th className="p-2.5">役割</th>
                      <th className="p-2.5">ID</th>
                      <th className="p-2.5">削除</th>
                    </tr>
                  </thead>
                  <tbody>
                    {collectionRows.map((row) => (
                      <tr key={row.path} className="border-b border-slate-100 align-top">
                        <td className="p-2.5 font-mono text-blue-800">{row.path}</td>
                        <td className="p-2.5">{row.role}</td>
                        <td className="p-2.5 text-slate-600">{row.id}</td>
                        <td className="p-2.5 text-slate-600">{row.lifecycle}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-4 rounded-xl bg-slate-950 p-4 font-mono text-xs leading-6 text-emerald-300">
                ObservationSet 1 ── 0..* Membership 0..* ── 1 Observation
              </div>
            </Panel>

            <div className="grid gap-5 lg:grid-cols-2">
              <Panel title="不変条件" icon={<CheckCircle2 className="h-5 w-5 text-emerald-600" />}>
                <ul className="list-disc space-y-2 pl-5 text-sm leading-6 text-slate-600">
                  <li>Viewは読み出し時投影であり永続化しない。</li>
                  <li>Membership IDは <code>setId__observationId</code>。</li>
                  <li>2.0.0は両端点とMembershipの同一ownerだけを許可。</li>
                  <li>順序はMembership.positionにだけ属する。</li>
                  <li>同順位はMembership document IDで決定的に解決。</li>
                  <li>soft-deleteされた端点はactive Viewから除外。</li>
                </ul>
              </Panel>
              <Panel title="禁止するlegacy形状" icon={<AlertTriangle className="h-5 w-5 text-rose-600" />}>
                <ul className="list-disc space-y-2 pl-5 text-sm leading-6 text-slate-600">
                  <li><code>/singleObservations</code></li>
                  <li><code>parentSetId</code></li>
                  <li>Set内の正本 <code>observationIds</code></li>
                  <li>Set内の埋込み正本 <code>observations</code></li>
                  <li>v1 alias、fallback reader、dual-write</li>
                  <li>Observation/Setの物理削除</li>
                </ul>
              </Panel>
            </div>

            <Panel title="読み出し時の投影" icon={<Code2 className="h-5 w-5 text-violet-600" />}>
              <pre className="overflow-x-auto rounded-xl bg-slate-950 p-4 text-xs leading-6 text-sky-200">{`ObservationSetView = {
  ...activeObservationSet,
  memberships: activeSameOwnerMemberships
    .sort(position, membershipDocumentId),
  observations: memberships
    .map(m => readableActiveObservationById[m.observationId])
}`}</pre>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                Observationを一度更新すると、所属する全SetのViewへ次回再構築時に反映されます。Set内へ子データを複製して同期する処理はありません。
              </p>
            </Panel>

            <div className="grid gap-5 md:grid-cols-2">
              <Panel title="ID・時刻・位置" icon={<Database className="h-5 w-5 text-purple-600" />}>
                <ul className="space-y-2 text-sm leading-6 text-slate-600">
                  <li><strong>ID:</strong> RFC 9562形式の小文字UUIDv7。</li>
                  <li><strong>path identity:</strong> persisted idとFirestore document IDは同一。</li>
                  <li><strong>time:</strong> runtime/exchangeは実在するRFC 3339、Firestoreはtimestamp。</li>
                  <li><strong>location:</strong> 緯度±90、経度±180、accuracyは0以上。</li>
                </ul>
              </Panel>
              <Panel title="画像とローカルcache" icon={<HardDrive className="h-5 w-5 text-sky-600" />}>
                <ul className="space-y-2 text-sm leading-6 text-slate-600">
                  <li>画像は最大1024×768、quality 0.85のWebP data URLへ変換。</li>
                  <li><code>imagePath</code>は将来のStorage path用。uploadは未実装。</li>
                  <li>cache keyはprincipal別の <code>observer-2.normalized-cache.v2.&lt;uid&gt;</code>。</li>
                  <li>mine-feedとattachment-pickerを別snapshotとして保存し、principal・保存時刻・query limit・件数・completeを検証する。</li>
                  <li>limit件に達したsnapshotは次ページprobeが空のときだけcompleteとしてfallbackに使う。5分を超えたsnapshotは使わない。</li>
                  <li>cacheも3種類のentity mapで、Viewを保存しない。</li>
                  <li>Firestoreの1 MiB制限に対する画像サイズ保証は未実装。</li>
                </ul>
              </Panel>
            </div>
          </div>
        )}

        {activeTab === 'security' && (
          <div className="space-y-5">
            <Panel title="独立したACL" icon={<ShieldCheck className="h-5 w-5 text-emerald-600" />}>
              <p className="text-sm leading-7 text-slate-600">
                Setを読めてもObservation本文を読めるとは限りません。MembershipはSetへのアクセスで読めますが、各Observationは自身のvisibility、allowedEmails、uid、deletedAtで再評価します。Setのvisibility変更やsoft-deleteはObservationを変更しません。
              </p>
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full border-collapse text-center text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500">
                      <th className="p-2 text-left">visibility</th>
                      <th className="p-2">未認証</th>
                      <th className="p-2">匿名認証</th>
                      <th className="p-2">非匿名認証</th>
                      <th className="p-2">owner</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ['public', '○', '○', '○', '○'],
                      ['authenticated', '×', '○', '○', '○'],
                      ['shared', '×', '×', 'email一致のみ', '○'],
                      ['private', '×', 'ownerのみ', 'ownerのみ', '○'],
                    ].map((row) => (
                      <tr key={row[0]} className="border-b border-slate-100">
                        <td className="p-2 text-left font-mono font-bold">{row[0]}</td>
                        {row.slice(1).map((cell, index) => <td key={index} className="p-2 text-slate-600">{cell}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>

            <div className="grid gap-5 lg:grid-cols-2">
              <Panel title="書込みlifecycle" icon={<Workflow className="h-5 w-5 text-blue-600" />}>
                <ul className="list-disc space-y-2 pl-5 text-sm leading-6 text-slate-600">
                  <li>作成は認証owner、closed key set、schema 2.0.0、active record。</li>
                  <li><code>id</code>、<code>uid</code>、<code>schemaVersion</code>、<code>createdAt</code>は不変。</li>
                  <li><code>updatedAt</code>は単調非減少。</li>
                  <li>soft-delete後のendpoint更新は禁止。</li>
                  <li>Membership更新はpositionだけ。</li>
                  <li>Membership作成時は<code>getAfter()</code>でactive owner endpointを検査。</li>
                </ul>
              </Panel>
              <Panel title="Rulesはfilterではない" icon={<Database className="h-5 w-5 text-indigo-600" />}>
                <p className="text-sm leading-7 text-slate-600">
                  queryはownerまたはvisibility、<code>deletedAt == null</code>、<code>createdAt desc</code>を明示します。sharedはさらにallowedEmails array-containsを使います。必要な複合indexは<code>firestore.indexes.json</code>が正本です。
                </p>
              </Panel>
            </div>

            <Panel title="Remote read policy" icon={<HardDrive className="h-5 w-5 text-sky-600" />}>
              <div className="grid gap-3 md:grid-cols-3">
                {[
                  ['成功・データあり', 'remoteを採用し、正規化cacheを更新'],
                  ['成功・空配列', '空を正本として採用。stale cacheを復活させない'],
                  ['v2契約違反', 'RemoteDataIntegrityErrorを再送出。fallback禁止'],
                  ['一時的通信障害', 'ownerのmineだけ、5分以内のprincipal-scoped cacheをfallbackに使う'],
                  ['権限・未検出', '一般feedではエラー、Observation endpointだけACL redaction'],
                ].map(([title, description]) => (
                  <div key={title} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="text-xs font-bold text-slate-900">{title}</div>
                    <p className="mt-1 text-xs leading-5 text-slate-600">{description}</p>
                  </div>
                ))}
              </div>
              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs leading-6 text-amber-950">
                <strong>残作業:</strong> 実Firestore/Authでの手動受入れ。
              </div>
            </Panel>
          </div>
        )}

        {activeTab === 'exchange' && (
          <div className="space-y-5">
            <Panel title="交換bundle 2.0.0" icon={<FileJson className="h-5 w-5 text-blue-600" />}>
              <pre className="overflow-x-auto rounded-xl bg-slate-950 p-4 text-xs leading-6 text-emerald-300">{`{
  "schemaVersion": "2.0.0",
  "exportedAt": "RFC 3339",
  "observations": [],
  "observationSets": [],
  "memberships": []
}`}</pre>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div className="rounded-xl border border-slate-200 p-4">
                  <h3 className="text-xs font-bold text-slate-900">構造検証</h3>
                  <p className="mt-1 text-xs leading-5 text-slate-600">
                    JSON Schemaがclosed shape、required fields、enum、UUIDv7、date-time、metadata subshapeを定義。
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 p-4">
                  <h3 className="text-xs font-bold text-slate-900">意味検証</h3>
                  <p className="mt-1 text-xs leading-5 text-slate-600">
                    codecがduplicate、tuple ID、参照先、owner一致、実時刻、座標、JSON互換性を検査。
                  </p>
                </div>
              </div>
              <p className="mt-4 text-sm leading-6 text-slate-600">
                exportはentity ID順、object key順で決定的にserializeします。これは独自のstable JSONであり、現時点ではRFC 8785 JCS準拠を主張しません。
              </p>
              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs leading-6 text-amber-950">
                UIはowner-scoped export/downloadと、構造・意味・owner・reference・deletion・collision・sizeを確認するno-write import dry-runを提供します。Firestore commit、owner remapping、conflict policyは未実装です。
              </div>
            </Panel>

            <div className="grid gap-5 lg:grid-cols-2">
              <Panel title="Server runtime" icon={<Server className="h-5 w-5 text-violet-600" />}>
                <ul className="space-y-2 text-sm leading-6 text-slate-600">
                  <li><code>GET /api/health</code></li>
                  <li><code>POST /api/analyze-object</code></li>
                  <li><code>POST /api/analyze-ocr</code></li>
                  <li><code>GEMINI_API_KEY</code>はExpress serverだけが読む。</li>
                  <li>Firebase設定は<code>firebase-applet-config.json</code>。</li>
                  <li>外部契約APIを追加する場合は<code>/api/vN</code>以下。</li>
                </ul>
              </Panel>
              <Panel title="実行・検証" icon={<Code2 className="h-5 w-5 text-slate-700" />}>
                <pre className="overflow-x-auto rounded-xl bg-slate-950 p-4 text-xs leading-6 text-sky-200">{`npm ci --ignore-scripts
npm run lint
npm run build
npm test
npm run verify:m2m:harness
npm run test:firestore:emulator  # Java 21`}</pre>
                <p className="mt-3 text-xs leading-5 text-slate-600">
                  AI StudioにはJDKがないためEmulator本体はGitHub ActionsのTemurin JDK 21で検証します。現在のmainにはpackage-lock.jsonがあるため、依存関係はnpm ciで再現します。
                </p>
              </Panel>
            </div>

            <Panel title="v1の扱い" icon={<AlertTriangle className="h-5 w-5 text-amber-600" />}>
              <p className="text-sm leading-7 text-slate-600">
                現在のデータ数はゼロのため、v1 Firestoreデータの移行・読取り互換・インポート互換は実装しません。dual-writeとbackfillも行わず、2.0.0 validatorはlegacy fieldとcollectionを拒否します。
              </p>
            </Panel>
          </div>
        )}

        {activeTab === 'delivery' && (
          <div className="space-y-5">
            <Panel title="WP00〜WP07の現在状態" icon={<Workflow className="h-5 w-5 text-blue-600" />}>
              <p className="text-sm leading-6 text-slate-600">
                audit/m2m/progress.jsonはWP00 A8の固定基線であり、現在状態はdocs/work-packages.mdが管理します。
              </p>
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500">
                      <th className="p-2.5">WP</th>
                      <th className="p-2.5">範囲</th>
                      <th className="p-2.5">状態</th>
                      <th className="p-2.5">残り</th>
                    </tr>
                  </thead>
                  <tbody>
                    {workPackageRows.map((row) => (
                      <tr key={row.id} className="border-b border-slate-100 align-top">
                        <td className="p-2.5 font-mono font-bold">{row.id}</td>
                        <td className="p-2.5">{row.scope}</td>
                        <td className="p-2.5"><StatusBadge status={row.status} /></td>
                        <td className="p-2.5 text-slate-600">{row.remaining}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>

            <div className="grid gap-5 lg:grid-cols-2">
              <Panel title="完了までの見積り" icon={<Clock3 className="h-5 w-5 text-amber-600" />}>
                <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
                  <div className="font-mono text-3xl font-extrabold text-blue-900">3 iterations</div>
                  <div className="mt-1 text-xs font-bold text-blue-800">この文書・/dev変更がmainへ反映された後</div>
                </div>
                <p className="mt-3 text-sm leading-6 text-slate-600">
                  PR #13反映後の基準では、この変更を含めて6回、ここからさらに3回です。妥当範囲は以後2〜5回。import方針の決定速度と手動検証で見つかる不具合数が主な不確実性です。
                </p>
              </Panel>
              <Panel title="推奨する残りの順序" icon={<CheckCircle2 className="h-5 w-5 text-emerald-600" />}>
                <ol className="list-decimal space-y-2 pl-5 text-sm leading-6 text-slate-600">
                  <li>Firestore importのownership・conflict・atomicity・receipt方針。</li>
                  <li>実Firestore/AuthでのM01〜M03と<code>/test</code>受入れ。</li>
                  <li>累積台帳、全CI、最終tree closeout。</li>
                </ol>
              </Panel>
            </div>

            <Panel title="Source of truth" icon={<BookOpen className="h-5 w-5 text-indigo-600" />}>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {sourceRows.map(([label, path]) => (
                  <div key={path} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</div>
                    <code className="mt-1 block break-all text-[11px] text-blue-800">{path}</code>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-xs leading-5 text-slate-600">
                文書と実行可能contractが矛盾した場合は、都合のよい一方を選ばず、同じ変更で整合させます。
              </p>
            </Panel>
          </div>
        )}

        {activeTab === 'tools' && (
          <div className="space-y-5">
            <DummyDataPanel />
          </div>
        )}
      </div>
    </main>
  );
}
