import React from 'react';
import { Link } from 'react-router-dom';

const collectionRows = [
  {
    path: '/observations/{observationId}',
    role: '個別観測の正本',
    rule: '観測自身の visibility / allowedEmails / uid で読取を判定',
  },
  {
    path: '/observationSets/{observationSetId}',
    role: '観測集合の正本',
    rule: '集合自身の visibility / allowedEmails / uid で読取を判定',
  },
  {
    path: '/observationSetMemberships/{setId}__{observationId}',
    role: '所属関係の正本',
    rule: '同一所有者の有効な二つの端点だけを結び、position はこの文書だけに属する',
  },
];

export default function DevDocPage() {
  return (
    <main className="min-h-screen bg-slate-100 text-slate-800 px-4 py-8 sm:px-8">
      <section className="mx-auto max-w-5xl space-y-6">
        <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="font-mono text-xs font-bold tracking-wider text-blue-700">OBSERVER DATA MODEL · 2.0.0</p>
          <h1 className="mt-2 text-2xl font-bold text-slate-900">明示的な多対多 Membership モデル</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
            Observation、ObservationSet、Membership はそれぞれ独立した正本です。UIの集合表示は、三つの正本を読み出した後にだけ構築される投影であり、Firestoreへ埋込み保存しません。
          </p>
          <Link className="mt-4 inline-block text-sm font-semibold text-blue-700 hover:underline" to="/app">
            アプリへ戻る
          </Link>
        </header>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900">正本コレクション</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <th className="p-3">Path</th>
                  <th className="p-3">役割</th>
                  <th className="p-3">アクセス境界</th>
                </tr>
              </thead>
              <tbody>
                {collectionRows.map((row) => (
                  <tr key={row.path} className="border-b border-slate-100 align-top">
                    <td className="p-3 font-mono text-xs text-blue-800">{row.path}</td>
                    <td className="p-3">{row.role}</td>
                    <td className="p-3 text-slate-600">{row.rule}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="grid gap-5 md:grid-cols-2">
          <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-bold text-slate-900">不変条件</h2>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-slate-600">
              <li>所属は <code>setId__observationId</code> という決定的IDのMembershipで一意に表す。</li>
              <li>一つのObservationは複数のObservationSetに所属できる。</li>
              <li>detachはMembershipだけを物理削除し、Observationを削除しない。</li>
              <li>ObservationとObservationSetの削除は論理削除であり、相手側を連鎖削除しない。</li>
              <li>集合内の順序はMembership.positionにだけ保存する。</li>
            </ul>
          </article>
          <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-bold text-slate-900">独立したACL</h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Setを読めてもObservationの本文を読めるとは限りません。Membershipの読取りは集合へのアクセスを基準にし、各Observation本文は自身のACLで別途検査します。したがって、集合の可視性変更は子Observationの可視性を更新しません。
            </p>
          </article>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-slate-950 p-6 text-slate-100 shadow-sm">
          <h2 className="text-lg font-bold">読み出し時の投影</h2>
          <pre className="mt-4 overflow-x-auto rounded-lg bg-slate-900 p-4 text-xs leading-6 text-emerald-300">{`ObservationSetView = {
  ...ObservationSet,
  memberships: Membership[]
    .filter(m => m.observationSetId === ObservationSet.id)
    .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id)),
  observations: memberships
    .map(m => observations[m.observationId])
    .filter(observation => observation is readable and not soft-deleted)
}`}</pre>
          <p className="mt-4 text-sm leading-6 text-slate-300">
            この投影を再構築するため、Observationの更新は所属するすべての集合ビューへ次回読み出し時に反映されます。ローカルキャッシュも同じ三エンティティを正規化して保存します。
          </p>
        </section>

        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6 shadow-sm">
          <h2 className="text-lg font-bold text-amber-950">v1データの扱い</h2>
          <p className="mt-2 text-sm leading-6 text-amber-900">
            v1 Firestoreデータの移行・読取り方針は未決定です。v2クライアントは <code>parentSetId</code>、埋込み <code>observations</code>、正本としての <code>observationIds</code> を書き込みません。交換形式は <code>schemas/observation-interchange.schema.json</code> の2.0.0三配列表現を使用します。
          </p>
        </section>
      </section>
    </main>
  );
}
