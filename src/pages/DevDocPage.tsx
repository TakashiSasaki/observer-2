import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Database, Code, LayoutList, ShieldCheck, UserCheck, Layers, Cpu } from 'lucide-react';

type TabType = 'database' | 'security' | 'user-relations' | 'types';

export default function DevDocPage() {
  const [activeTab, setActiveTab] = useState<TabType>('database');

  return (
    <div className="min-h-screen bg-slate-50 p-2 sm:p-4 font-sans text-slate-800">
      <div className="max-w-4xl mx-auto space-y-3">
        {/* Header */}
        <div className="flex flex-row items-center justify-between gap-2 bg-white p-3 sm:p-4 rounded-xl shadow-sm border border-slate-200">
          <div>
            <h1 className="text-base sm:text-xl font-extrabold flex items-center gap-2 text-slate-800">
              <Database className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600 shrink-0" />
              開発者ドキュメント
            </h1>
            <p className="text-slate-500 text-[11px] sm:text-xs font-medium">データ構造・セキュリティ・型定義仕様</p>
          </div>
          <Link
            to="/"
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 transition shadow-sm shrink-0"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            トップへ
          </Link>
        </div>

        {/* Navigation Tabs */}
        <div className="flex bg-white p-1 rounded-lg border border-slate-200 shadow-sm overflow-x-auto gap-1 text-xs font-bold">
          <button
            onClick={() => setActiveTab('database')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md whitespace-nowrap transition ${
              activeTab === 'database'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            1. DB構造
          </button>
          <button
            onClick={() => setActiveTab('security')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md whitespace-nowrap transition ${
              activeTab === 'security'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            2. アクセス制御
          </button>
          <button
            onClick={() => setActiveTab('user-relations')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md whitespace-nowrap transition ${
              activeTab === 'user-relations'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <UserCheck className="w-3.5 h-3.5" />
            3. ユーザーリレーション
          </button>
          <button
            onClick={() => setActiveTab('types')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md whitespace-nowrap transition ${
              activeTab === 'types'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Code className="w-3.5 h-3.5" />
            4. TypeScript型定義
          </button>
        </div>

        {/* TAB 1: Database Architecture */}
        {activeTab === 'database' && (
          <div className="space-y-3">
            <section className="bg-white p-3 sm:p-4 rounded-xl shadow-sm border border-slate-200 space-y-2.5">
              <h2 className="text-sm sm:text-base font-bold flex items-center gap-1.5 border-b border-slate-100 pb-1.5 text-slate-800">
                <LayoutList className="w-4 h-4 text-indigo-500 shrink-0" />
                Firestore コレクション構成
              </h2>
              <p className="text-xs text-slate-600 leading-relaxed">
                ルート直下の2つのコレクションで「観測セット」および「独立した単一観測データ」を管理しています。
              </p>
              
              <div className="grid sm:grid-cols-2 gap-2">
                <div className="bg-slate-900 text-slate-100 p-2.5 rounded-lg font-mono text-[11px] space-y-1">
                  <div className="text-blue-400 font-bold">/observations (Collection)</div>
                  <div className="pl-2 border-l border-slate-700 text-emerald-300">
                    └─ /{'{'}obsSetId{'}'} (Document)
                  </div>
                  <p className="text-[10px] text-slate-400 font-sans pt-1">
                    観測セット全体（開示範囲、位置情報、タグ、参照ID `observationIds`）を管理。
                  </p>
                </div>

                <div className="bg-slate-900 text-slate-100 p-2.5 rounded-lg font-mono text-[11px] space-y-1">
                  <div className="text-emerald-400 font-bold">/singleObservations (Collection)</div>
                  <div className="pl-2 border-l border-slate-700 text-emerald-300">
                    └─ /{'{'}obsId{'}'} (Document)
                  </div>
                  <p className="text-[10px] text-slate-400 font-sans pt-1">
                    独立した個別の観測要素。複数セットから参照・共有可能です。
                  </p>
                </div>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-[11px] space-y-1 text-slate-700">
                <h3 className="font-bold text-slate-800 text-xs">💡 ルート直下コレクション構造の採用理由</h3>
                <ul className="list-disc pl-4 space-y-0.5 text-slate-600">
                  <li>
                    <strong>クロスユーザー共有クエリの最適化：</strong> ユーザーサブコレクション（<code>/users/{"{uid}"}/observations</code>）に比べ、<code>public</code> や <code>authenticated</code> の複合検索がシンプルかつ高速。
                  </li>
                  <li>
                    <strong>時系列・マップ一括検索：</strong> 複数ユーザーの観測データを同一マップやタイムライン上に描画する際、直感的に取得可能。
                  </li>
                </ul>
              </div>

              {/* 画像データストレージ設計 */}
              <div className="bg-emerald-50/60 border border-emerald-200 rounded-lg p-2.5 space-y-1.5 text-[11px] text-slate-700">
                <div className="font-bold text-emerald-900 text-xs">📷 画像ストレージ設計（Base64 内包 ⇄ Cloud Storage バケット 互換データモデル）</div>
                <div className="grid sm:grid-cols-2 gap-2 text-[10px]">
                  <div className="p-2 bg-white rounded border border-emerald-200 space-y-0.5">
                    <div className="font-bold text-slate-800">1. 現在の仕様（Base64 WebP埋め込み）</div>
                    <p className="text-slate-600">
                      クライアント側で最大1024x768のWebP（圧縮率0.85）にリサイズし、<code>data:image/webp;base64,...</code> を <code>imageUrl</code> に直接保持。1回のクエリで画像まで即座に描画可能です。
                    </p>
                  </div>
                  <div className="p-2 bg-white rounded border border-emerald-200 space-y-0.5">
                    <div className="font-bold text-slate-800">2. 本番 Cloud Storage バケット移行対応</div>
                    <p className="text-slate-600">
                      <code>imageUrl</code> に Cloud Storage の公開ダウンロードURL（<code>https://firebasestorage...</code>）を格納するだけでフロントエンドを変更せず透過的に移行可能。さらにバケット内参照パス保持用に <code>imagePath</code> フィールドを予約配置しています。
                    </p>
                  </div>
                </div>
              </div>

              {/* ID採番アルゴリズムとインデックス効率 */}
              <div className="bg-purple-50/60 border border-purple-200 rounded-lg p-2.5 space-y-1.5 text-[11px] text-slate-700">
                <div className="font-bold text-purple-900 text-xs">🔑 ID採番標準（UUIDv7 採用設計）</div>
                <div className="grid sm:grid-cols-3 gap-2 text-[10px]">
                  <div className="p-2 bg-white rounded border border-purple-200 space-y-0.5">
                    <div className="font-bold text-slate-800">1. 採用方式: UUIDv7</div>
                    <p className="text-slate-600">
                      観測（<code>Observation</code>）および観測セット（<code>ObservationSet</code>）のID採番に <strong>UUIDv7</strong> を標準採用。クライアント側での一律生成を可能にしオフライン生成をサポート。
                    </p>
                  </div>
                  <div className="p-2 bg-white rounded border border-purple-200 space-y-0.5">
                    <div className="font-bold text-slate-800">2. フォーマット: 標準小文字ハイフン付き</div>
                    <p className="text-slate-600">
                      RFC 9562 準拠の <strong>小文字ハイフン付き 36文字形式</strong>（例: <code>018f6e8b-8772-7443-85e7-2938a164b4a3</code>）。先頭48bitがミリ秒タイムスタンプのため<strong>文字列比較（Lexicographical Order）でも自然と時系列順</strong>にソートされます。
                    </p>
                  </div>
                  <div className="p-2 bg-white rounded border border-purple-200 space-y-0.5">
                    <div className="font-bold text-slate-800">3. インデックス & 分散耐性</div>
                    <p className="text-slate-600">
                      連番整数IDのようなボトルネックや列挙攻撃リスクを排除しつつ、時系列ソート可能なためB-Treeインデックスの断片化を防止し高速走査を実現。
                    </p>
                  </div>
                </div>
              </div>
            </section>

            <section className="bg-white p-3 sm:p-4 rounded-xl shadow-sm border border-slate-200 space-y-2.5">
              <h2 className="text-sm sm:text-base font-bold flex items-center gap-1.5 border-b border-slate-100 pb-1.5 text-slate-800">
                <Cpu className="w-4 h-4 text-indigo-500 shrink-0" />
                「観測セット ⇄ 個別観測」の多対多参照とパフォーマンス設計
              </h2>

              <p className="text-xs text-slate-600 leading-relaxed">
                参照ID配列（<code>observationIds</code>）により、<strong>1つの観測を複数セットへ自由に紐付け・再利用できる設計</strong>です。
              </p>

              <div className="bg-indigo-50/60 border border-indigo-200 rounded-lg p-2.5 space-y-2 text-xs text-slate-700">
                <div className="font-bold text-indigo-900 text-xs">🔗 完全分離（正規化）とハイブリッド（非正規化展開）のコスト比較</div>
                
                <div className="grid sm:grid-cols-2 gap-2 text-[11px]">
                  <div className="p-2 bg-white rounded border border-indigo-100 space-y-0.5">
                    <div className="font-bold text-rose-700">❌ 完全分離（正規化）モデルの場合</div>
                    <p className="text-slate-600">
                      一覧表示の度に該当する全 <code>observations</code> を個別取得（Join）する必要があります。
                    </p>
                    <p className="font-bold text-rose-800 text-[10px]">
                      ※ 例: 20件のセット（各3観測）で 1 + 60 = 61回のReadが発生。
                    </p>
                  </div>

                  <div className="p-2 bg-white rounded border border-indigo-100 space-y-0.5">
                    <div className="font-bold text-emerald-700">✅ ハイブリッドモデル（現在採用中）</div>
                    <p className="text-slate-600">
                      <code>/singleObservations</code> に保存しつつ、<code>observationsets</code> 側にも展開済みキャッシュを保持。
                    </p>
                    <p className="font-bold text-emerald-800 text-[10px]">
                      ※ 例: 20件のセット表示でも僅か 20回のReadで即時描画。
                    </p>
                  </div>
                </div>

                <div className="p-2 bg-indigo-100/70 rounded border border-indigo-200 text-[10px] text-indigo-900 font-medium">
                  📌 <strong>将来のアーキテクチャ移行方針:</strong> 現時点では読み取り速度・Readコスト削減を優先してハイブリッドモデルを採用しています。ただし、観測データの更新頻度増大や完全なリアルタイム一貫性が重視されるフェーズへ移行する場合、データソースを <code>/singleObservations</code> に一本化する「完全正規化モデル」へスムーズに移行できるよう、<code>observationIds</code> のID参照リレーション構造も並行して維持しています。
                </div>
              </div>

              {/* 修正課題 */}
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 space-y-1.5 text-[11px] text-slate-700">
                <div className="font-bold text-amber-900 text-xs">⚠️ 観測修正（更新）時の不整合対策アプローチ</div>
                <div className="grid sm:grid-cols-3 gap-1.5 text-[10px]">
                  <div className="p-2 bg-white rounded border border-amber-200 space-y-0.5">
                    <div className="font-bold text-slate-800">① Cloud Functions 同期</div>
                    <p className="text-slate-600"><code>/singleObservations</code> の更新トリガーで全セットのキャッシュをバックエンドで非同期自動更新。</p>
                  </div>
                  <div className="p-2 bg-white rounded border border-amber-200 space-y-0.5">
                    <div className="font-bold text-slate-800">② クライアント一括更新</div>
                    <p className="text-slate-600">単一観測更新時、該当セットもBatch Writeで同時一括更新（※書き込み課金数は不変ですが、通信往復・レイテンシ・不整合を節約）。</p>
                  </div>
                  <div className="p-2 bg-white rounded border border-amber-200 space-y-0.5">
                    <div className="font-bold text-slate-800">③ 不変（Immutable）ログ</div>
                    <p className="text-slate-600">観測データは直接変更せず、変更時は「修正観測」として新規IDを追加する監査ログ設計。</p>
                  </div>
                </div>
              </div>

              {/* Firestoreクライアントキャッシュ */}
              <div className="bg-sky-50 border border-sky-200 rounded-lg p-2.5 space-y-1.5 text-[11px] text-slate-700">
                <div className="font-bold text-sky-900 text-xs">💡 Firestore クライアントキャッシュ（IndexedDB永続化）の活用</div>
                <div className="grid sm:grid-cols-2 gap-2 text-[10px]">
                  <div className="p-2 bg-white rounded border border-sky-200 space-y-0.5">
                    <div className="font-bold text-slate-800">1. キャッシュヒット時の挙動</div>
                    <p className="text-slate-600">ウォームキャッシュ状態では端末内データを参照するため Firestore 課金なしで即時取得。</p>
                  </div>
                  <div className="p-2 bg-white rounded border border-sky-200 space-y-0.5">
                    <div className="font-bold text-slate-800">2. 完全正規化時に残る課題</div>
                    <p className="text-slate-600">初回ロードや他ユーザーの観測取得時はリクエスト非同期待ちが発生し、容量上限によるEvictionリスクも存在。</p>
                  </div>
                </div>
              </div>
            </section>
          </div>
        )}

        {/* TAB 2: Security Rules */}
        {activeTab === 'security' && (
          <section className="bg-white p-3 sm:p-4 rounded-xl shadow-sm border border-slate-200 space-y-3">
            <h2 className="text-sm sm:text-base font-bold flex items-center gap-1.5 border-b border-slate-100 pb-1.5 text-slate-800">
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
              ユーザーアクセス制御 (Security Rules) 仕様
            </h2>
            <p className="text-xs text-slate-600 leading-relaxed">
              アクセス制御は <code>uid</code>（作成者）、<code>visibility</code>（開示レベル）、<code>allowedEmails</code>（許可メール）に基づいて判定されます。
            </p>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 text-xs">
              <div className="p-2 sm:p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg space-y-0.5">
                <div className="font-bold text-emerald-900 text-xs">1. public</div>
                <div className="text-[10px] font-semibold text-emerald-800">全体公開</div>
                <p className="text-emerald-700 text-[10px]">未認証ゲスト含む全員が開示可能</p>
              </div>
              <div className="p-2 sm:p-2.5 bg-indigo-50 border border-indigo-200 rounded-lg space-y-0.5">
                <div className="font-bold text-indigo-900 text-xs">2. authenticated</div>
                <div className="text-[10px] font-semibold text-indigo-800">ログインユーザー</div>
                <p className="text-indigo-700 text-[10px]">ログイン中の全ユーザーが開示可能</p>
              </div>
              <div className="p-2 sm:p-2.5 bg-blue-50 border border-blue-200 rounded-lg space-y-0.5">
                <div className="font-bold text-blue-900 text-xs">3. shared</div>
                <div className="text-[10px] font-semibold text-blue-800">メール限定</div>
                <p className="text-blue-700 text-[10px]">許可メールアドレスのみ開示可能</p>
              </div>
              <div className="p-2 sm:p-2.5 bg-slate-50 border border-slate-200 rounded-lg space-y-0.5">
                <div className="font-bold text-slate-800 text-xs">4. private</div>
                <div className="text-[10px] font-semibold text-slate-700">非公開</div>
                <p className="text-slate-500 text-[10px]">作成者本人のみ開示・編集可能</p>
              </div>
            </div>

            <div className="bg-sky-50 border border-sky-200 rounded-lg p-2.5 space-y-1.5 text-[11px] text-slate-700">
              <div className="font-bold text-sky-900 text-xs">💡 Firestore セキュリティルール評価と読み取り課金（Read Count）の原則</div>
              <div className="grid sm:grid-cols-2 gap-2 text-[10px]">
                <div className="p-2 bg-white rounded border border-sky-200 space-y-0.5">
                  <div className="font-bold text-slate-800">1. ブロックされたリクエストは「課金ゼロ」</div>
                  <p className="text-slate-600">
                    セキュリティルールによって拒否（Permission Denied）されたクエリやドキュメント読み取りは、<strong>Firestore の Read 課金カウントに一切計上されません（完全無料）</strong>。
                  </p>
                </div>
                <div className="p-2 bg-white rounded border border-sky-200 space-y-0.5">
                  <div className="font-bold text-slate-800">2. 「セキュリティルールはフィルタではない」原則</div>
                  <p className="text-slate-600">
                    ルールは自動フィルタリングを行いません。アクセス不可ドキュメントが含まれうる無制限クエリを投げるとリクエスト自体が即時拒否（エラー）となるため、クエリ側で <code>where</code> フィルタを明示指定します。
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-1">
              <h3 className="font-bold text-slate-800 text-xs">適用中の firestore.rules</h3>
              <pre className="bg-slate-900 text-slate-100 p-2.5 rounded-lg text-[10px] sm:text-[11px] font-mono overflow-x-auto leading-tight">
{`rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function isAuthenticated() { return request.auth != null; }
    function isNonAnonymous() {
      return isAuthenticated() && request.auth.token.email != null && 
             (!('sign_in_provider' in request.auth.token.firebase) || request.auth.token.firebase.sign_in_provider != 'anonymous');
    }
    function isDocOwner() {
      return isAuthenticated() && 
        ((resource.data.keys().hasAll(['uid']) && resource.data.uid == request.auth.uid) ||
         (resource.data.keys().hasAll(['userId']) && resource.data.userId == request.auth.uid));
    }
    function isEmailAllowed() {
      return isNonAnonymous() && resource.data.keys().hasAll(['allowedEmails']) && request.auth.token.email in resource.data.allowedEmails;
    }

    match /singleObservations/{obsId} {
      allow read: if isAuthenticated();
      allow create, update, delete: if isAuthenticated() && 
        ((request.resource.data.keys().hasAll(['uid']) && request.resource.data.uid == request.auth.uid) ||
         (request.resource.data.keys().hasAll(['userId']) && request.resource.data.userId == request.auth.uid));
    }

    match /observations/{obsSetId} {
      allow read: if resource.data.visibility == 'public' ||
                     (resource.data.visibility == 'authenticated' && isAuthenticated()) ||
                     (resource.data.visibility == 'shared' && isEmailAllowed()) || isDocOwner();
      allow create: if isAuthenticated() && 
        ((request.resource.data.keys().hasAll(['uid']) && request.resource.data.uid == request.auth.uid) ||
         (request.resource.data.keys().hasAll(['userId']) && request.resource.data.userId == request.auth.uid));
      allow update, delete: if isDocOwner();
    }
  }
}`}
              </pre>
            </div>
          </section>
        )}

        {/* TAB 3: User Relations */}
        {activeTab === 'user-relations' && (
          <section className="bg-white p-3 sm:p-4 rounded-xl shadow-sm border border-slate-200 space-y-2.5">
            <h2 className="text-sm sm:text-base font-bold flex items-center gap-1.5 border-b border-slate-100 pb-1.5 text-slate-800">
              <UserCheck className="w-4 h-4 text-indigo-500 shrink-0" />
              ユーザーリレーションと `observerName` / `observerPhoto` の設計
            </h2>
            <div className="space-y-2 text-xs text-slate-600 leading-relaxed">
              <p>
                観測データ（<code>ObservationSet</code>）は作成者の <code>uid</code> により <code>/users/{"{uid}"}</code> と<strong>1対1で一義的に紐づいています</strong>。
              </p>

              <div className="bg-blue-50/60 border border-blue-200 rounded-lg p-2.5 space-y-2 text-[11px] text-slate-700">
                <div className="font-bold text-blue-900 text-xs">💡 ドキュメント内に `observerName` / `observerPhoto` を保持する目的</div>
                <ul className="list-disc pl-4 space-y-1 text-slate-600">
                  <li>
                    <strong>パフォーマンス最適化（N+1クエリ防止）:</strong> タイムラインやマップ上に描画する際、ドキュメントごとに <code>/users/{"{uid}"}</code> を毎回Join参照するとリクエストが急増します。初期表示用キャッシュとして保持し、1回のクエリで即時描画可能にしています。
                  </li>
                  <li>
                    <strong>ユーザー情報同期:</strong> 主識別子は常に <code>uid</code> です。名前変更時は最新のユーザープロフィールを表示するか、変更時に観測ドキュメントのキャッシュ値をバッチ更新する運用とします。
                  </li>
                </ul>
              </div>
            </div>
          </section>
        )}

        {/* TAB 4: TypeScript Types */}
        {activeTab === 'types' && (
          <section className="bg-white p-3 sm:p-4 rounded-xl shadow-sm border border-slate-200 space-y-3">
            <h2 className="text-sm sm:text-base font-bold flex items-center gap-1.5 border-b border-slate-100 pb-1.5 text-slate-800">
              <Code className="w-4 h-4 text-indigo-500 shrink-0" />
              主要な TypeScript データ型定義
            </h2>
            
            <div className="space-y-3">
              <div>
                <h3 className="font-bold text-slate-800 text-xs mb-1">ObservationSet</h3>
                <pre className="bg-slate-900 text-slate-100 p-2.5 rounded-lg text-[10px] sm:text-[11px] font-mono overflow-x-auto leading-tight">
{`interface ObservationSet {
  id: string;             // ドキュメントID
  uid: string;            // 作成者のFirebase Auth UID
  observerName: string;   // 観測者名
  observerPhoto?: string; // 観測者のアバターURL
  type: ObservationType;  // メインの観測種別 (qr, nfc, object, ocr, manual)
  title: string;          // タイトル
  summary: string;        // 概要
  rawContent: string;     // 詳細内容・生データ
  imageUrl?: string;      // 添付画像URL (Data URL または Cloud Storage HTTPS URL)
  imagePath?: string;     // Cloud Storage バケット内参照パス (例: observations/{id}.webp)
  location?: { latitude: number; longitude: number; accuracy?: number; address?: string; };
  visibility: 'private' | 'authenticated' | 'shared' | 'public';
  allowedEmails?: string[];       // shared時開示許可メールアドレスリスト
  tags: string[];                 // 検索用タグ
  metadata?: Record<string, any>; // 付加情報
  observationIds?: string[];      // 複数セットから参照可能な単一観測ID参照配列
  observations?: Observation[];   // UI高速表示用（非正規化・展開済み観測オブジェクト配列）
  createdAt: string;              // 作成日時 (ISO 8601)
}`}
                </pre>
              </div>

              <div>
                <h3 className="font-bold text-slate-800 text-xs mb-1">Observation</h3>
                <pre className="bg-slate-900 text-slate-100 p-2.5 rounded-lg text-[10px] sm:text-[11px] font-mono overflow-x-auto leading-tight">
{`interface Observation {
  id: string;             // 個別観測ID
  uid?: string;           // 作成者のUID
  observerName?: string;  // 観測者名
  observerPhoto?: string; // 観測者のアバターURL
  type: ObservationType;  // 観測種別
  title: string;          // タイトル
  summary: string;        // 概要
  rawContent: string;     // 詳細内容・生データ
  imageUrl?: string;      // 個別添付画像URL (Data URL または Cloud Storage HTTPS URL)
  imagePath?: string;     // Cloud Storage バケット内参照パス (例: observations/{id}.webp)
  location?: { latitude: number; longitude: number; accuracy?: number; address?: string; };
  visibility?: 'private' | 'authenticated' | 'shared' | 'public';
  metadata?: Record<string, any>;
  createdAt: string;      // 作成日時 (ISO 8601)
}`}
                </pre>
              </div>
              
              <div>
                <h3 className="font-bold text-slate-800 text-xs mb-1">ObservationType & ObservationMetadata</h3>
                <pre className="bg-slate-900 text-slate-100 p-2.5 rounded-lg text-[10px] sm:text-[11px] font-mono overflow-x-auto leading-tight">
{`type ObservationType = 'qr' | 'nfc' | 'object' | 'ocr' | 'manual';

// 観測種別ごとの固有メタデータ構造 (metadata フィールド内)
interface ObservationMetadata {
  // NFC 観測固有データ
  serialNumber?: string;    // NFCタグの固有シリアル番号/UID (例: "04:80:A2:3F:89:12")
  nfcTech?: string;         // タグ規格 (例: "NFC Forum Type 2 (NTAG215)", "Mifare DESFire")
  
  // 物体認識 (object) 固有データ
  detectedObjects?: Array<{ name: string; category: string; confidence: number }>;
  
  // OCR 固有データ
  extractedText?: string;   // 抽出文字列
  language?: string;        // 判定言語
  
  [key: string]: any;       // その他の拡張メタデータ
}`}
                </pre>
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

