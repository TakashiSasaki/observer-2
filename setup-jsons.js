import fs from 'fs';
import crypto from 'crypto';

const requirements = {
  "R01": "ObservationとObservationSetは独立した正本であり、単一親や観測本体の埋込みを正規形にしない。",
  "R02": "所属は明示的なMembershipとし、同じObservationSetとObservationの組を一意にする。セット内順序はMembershipに属する。",
  "R03": "一つのObservationを複数のObservationSetへ所属させられる。",
  "R04": "セットから外す操作はMembershipだけを削除し、Observationを削除しない。",
  "R05": "ObservationとObservationSetのクライアント削除は論理削除とし、相手側エンティティを連鎖削除しない。",
  "R06": "Observationの更新が、所属するすべてのセットの再構築ビューへ反映される。",
  "R07": "ObservationとObservationSetの可視性およびACLは独立し、セット閲覧権限だけで観測内容を取得できない。",
  "R08": "`/observations`、`/observationSets`、`/observationSetMemberships`の三コレクションと必要なインデックスを使用する。",
  "R09": "Security Rulesが所有者、参照先、決定的Membership文書ID、不変フィールドを検証する。2.0.0では同一所有者間の所属だけを許可する。",
  "R10": "ローカルキャッシュも三エンティティへ正規化し、表示用セットを読み出し時に構築する。",
  "R11": "交換形式2.0.0を`observations`、`observationSets`、`memberships`の三配列構造とし、構造検証、意味検証、往復検証を行う。",
  "R12": "v1データの処理方針を明示し、切替後は`parentSetId`、埋込み`observations`、正本としての`observationIds`を書き込まない。"
};

const verificationCatalog = {
  "H01": { "executionPlane": "ai-local", "requirementIds": [] },
  "H02": { "executionPlane": "external", "requirementIds": [] },
  "D01": { "executionPlane": "ai-local", "requirementIds": ["R01", "R03"] },
  "D02": { "executionPlane": "ai-local", "requirementIds": ["R02"] },
  "D03": { "executionPlane": "ai-local", "requirementIds": ["R04"] },
  "D04": { "executionPlane": "ai-local", "requirementIds": ["R05"] },
  "D05": { "executionPlane": "ai-local", "requirementIds": ["R06"] },
  "D06": { "executionPlane": "ai-local", "requirementIds": ["R07"] },
  "F01": { "executionPlane": "external", "requirementIds": ["R08"] },
  "F02": { "executionPlane": "ai-local", "requirementIds": ["R10"] },
  "F03": { "executionPlane": "ai-local", "requirementIds": ["R07", "R09"] },
  "F04": { "executionPlane": "external", "requirementIds": ["R08", "R09"] },
  "X01": { "executionPlane": "ai-local", "requirementIds": ["R11"] },
  "X02": { "executionPlane": "ai-local", "requirementIds": ["R11"] },
  "X03": { "executionPlane": "ai-local", "requirementIds": ["R03", "R11"] },
  "X04": { "executionPlane": "ai-local", "requirementIds": ["R12"] },
  "L01": { "executionPlane": "ai-local", "requirementIds": ["R01", "R12"] }
};

const manualChecks = {
  "M01": "一つの観測をセットAとセットBへ所属させる。",
  "M02": "セットAから外し、セットBとの所属と観測本体が残ることを確認する。",
  "M03": "セットの可視性変更および論理削除が、観測のACLと本体を変更しないことを確認する。"
};

const workPackages = {
  "WP00": "ハーネスと外部検証入口",
  "WP01": "v2ドメイン型と不変条件",
  "WP02": "Membership操作、ビュー再構築、正規化キャッシュ",
  "WP03": "Firestoreリポジトリ、クエリ、インデックス",
  "WP04": "Security Rulesと外部Emulatorテスト",
  "WP05": "UI",
  "WP06": "交換形式2.0.0とv1処理",
  "WP07": "レガシー除去と最終検証"
};

const decisions = {
  "dataSchemaVersion": "2.0.0",
  "relationshipModel": "explicit-many-to-many-membership",
  "membershipDocumentId": "setId__observationId",
  "crossOwnerMembership": "disallowed-in-2.0.0",
  "entityDeletion": "soft-delete",
  "setDeletionCascadesToObservations": false,
  "aclModel": "independent",
  "membershipPositionTieBreaker": "membership-document-id",
  "v1FirestoreDataPolicy": "pending-user-decision"
};

const progress = {
  "packetId": "WP00",
  "attempt": "A1",
  "externalBaseCommit": "2b01e6c94b8f91eb86a4789c53fb5223953277ea",
  "externalBaseCommitVerifiedByAgent": false,
  "H01": "LOCAL_PASS",
  "H02": "EXTERNAL_PENDING",
  "D01": "PLANNED",
  "D02": "PLANNED",
  "D03": "PLANNED",
  "D04": "PLANNED",
  "D05": "PLANNED",
  "D06": "PLANNED",
  "F01": "PLANNED",
  "F02": "PLANNED",
  "F03": "PLANNED",
  "F04": "PLANNED",
  "X01": "PLANNED",
  "X02": "PLANNED",
  "X03": "PLANNED",
  "X04": "PLANNED",
  "L01": "PLANNED",
  "M01": "PLANNED",
  "M02": "PLANNED",
  "M03": "PLANNED",
  "WP00": "PLANNED",
  "WP01": "PLANNED",
  "WP02": "PLANNED",
  "WP03": "PLANNED",
  "WP04": "PLANNED",
  "WP05": "PLANNED",
  "WP06": "PLANNED",
  "WP07": "PLANNED"
};

const writeJson = (filename, data) => {
  const content = JSON.stringify(data, null, 2) + '\n';
  fs.writeFileSync(filename, content);
  return content;
};

const c1 = writeJson('audit/m2m/requirements.json', requirements);
const c2 = writeJson('audit/m2m/verification-catalog.json', verificationCatalog);
const c3 = writeJson('audit/m2m/manual-checks.json', manualChecks);
const c4 = writeJson('audit/m2m/work-packages.json', workPackages);
writeJson('audit/m2m/decisions.json', decisions);
writeJson('audit/m2m/progress.json', progress);

const hash = crypto.createHash('sha256');
hash.update(c1);
hash.update(c2);
hash.update(c3);
hash.update(c4);
const lock = {
  "hash": hash.digest('hex')
};
writeJson('audit/m2m/registry-lock.json', lock);
console.log('Files created');
