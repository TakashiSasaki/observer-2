import { ObservationSet, Observation, ObservationType, VisibilityType, LocationData, ObservationMetadata, CURRENT_SCHEMA_VERSION } from '../types';
import { processImageToWebP } from '../utils/imageUtils';
import { generateId } from '../utils/idUtils';

/**
 * 観測セット (ObservationSetModel)
 * 同一対象物に対する複数の「観測 (Observation)」の集合および全体情報を管理するドメインモデル
 */
export class ObservationSetModel implements ObservationSet {
  id: string;
  uid: string;
  observerName: string;
  observerPhoto?: string;
  type: ObservationType;
  title: string;
  summary: string;
  rawContent: string;
  imageUrl?: string;
  imagePath?: string;
  location?: LocationData;
  visibility: VisibilityType;
  allowedEmails: string[];
  tags: string[];
  metadata?: ObservationMetadata;
  observationIds: string[];
  observations: Observation[];
  schemaVersion: string;
  createdAt: string;

  constructor(initData: Partial<ObservationSet> & { type: ObservationType; title: string }) {
    this.id = initData.id || generateId();
    if (!initData.uid) throw new Error('uid is required');
    this.uid = initData.uid;
    this.observerName = initData.observerName;
    this.observerPhoto = initData.observerPhoto;
    this.type = initData.type;
    this.title = initData.title || '無題の観測セット';
    this.summary = initData.summary || '';
    this.rawContent = initData.rawContent || '';
    this.imageUrl = initData.imageUrl;
    this.imagePath = initData.imagePath;
    this.location = initData.location;
    this.visibility = initData.visibility || 'private';
    this.allowedEmails = initData.allowedEmails || [];
    this.tags = initData.tags || [];
    this.metadata = initData.metadata || {};
    this.schemaVersion = initData.schemaVersion || CURRENT_SCHEMA_VERSION;
    
    const rawObsList: Observation[] = initData.observations || [];
    this.observations = rawObsList.map((o) => {
      const obsId = o.id || generateId();
      if (!o.uid) throw new Error('Observation uid is required');
      return {
        id: obsId,
        parentSetId: o.parentSetId || this.id,
        uid: o.uid,
        observerName: o.observerName,
        observerPhoto: o.observerPhoto,
        type: o.type || this.type,
        title: o.title || '',
        summary: o.summary || '',
        rawContent: o.rawContent || '',
        imageUrl: o.imageUrl,
        imagePath: o.imagePath,
        location: o.location,
        visibility: o.visibility || this.visibility,
        allowedEmails: Array.isArray(o.allowedEmails) ? o.allowedEmails : (this.allowedEmails || []),
        metadata: o.metadata || {},
        schemaVersion: o.schemaVersion || CURRENT_SCHEMA_VERSION,
        createdAt: o.createdAt || new Date().toISOString(),
      };
    });
    this.observationIds = initData.observationIds && initData.observationIds.length > 0
      ? initData.observationIds
      : this.observations.map((o) => o.id);
    this.createdAt = initData.createdAt || new Date().toISOString();
  }

  /**
   * 個別観測 (Observation) の追加（複数観測セットからの参照をサポート）
   */
  public addObservation(obs: Omit<Observation, 'id' | 'createdAt'> & { id?: string; createdAt?: string }): void {
    const obsId = obs.id || generateId();
    const newObs: Observation = {
      id: obsId,
      parentSetId: obs.parentSetId || this.id,
      uid: obs.uid || this.uid,
      observerName: obs.observerName || this.observerName,
      observerPhoto: obs.observerPhoto || this.observerPhoto,
      type: obs.type,
      title: obs.title,
      summary: obs.summary,
      rawContent: obs.rawContent,
      imageUrl: obs.imageUrl,
      imagePath: obs.imagePath,
      location: obs.location,
      visibility: obs.visibility || this.visibility,
      allowedEmails: obs.allowedEmails || this.allowedEmails,
      metadata: obs.metadata || {},
      schemaVersion: obs.schemaVersion || CURRENT_SCHEMA_VERSION,
      createdAt: obs.createdAt || new Date().toISOString(),
    };
    this.observations.push(newObs);
    if (!this.observationIds.includes(obsId)) {
      this.observationIds.push(obsId);
    }

    // タグの同期
    if (!this.tags.includes(obs.type)) {
      this.tags.push(obs.type);
    }
  }

  /**
   * 個別観測の削除
   */
  public removeObservation(obsId: string): void {
    this.observations = this.observations.filter((s) => s.id !== obsId);
    this.observationIds = this.observationIds.filter((id) => id !== obsId);
  }

  /**
   * 観測件数の取得
   */
  public getObservationCount(): number {
    return this.observations.length;
  }

  /**
   * 複合観測セットかどうか
   */
  public isComposite(): boolean {
    return this.observations.length > 0;
  }

  /**
   * プレーンJavaScriptオブジェクトへの変換
   */
  public toJSON(): ObservationSet {
    return {
      id: this.id,
      uid: this.uid,
      observerName: this.observerName,
      observerPhoto: this.observerPhoto,
      type: this.type,
      title: this.title,
      summary: this.summary,
      rawContent: this.rawContent,
      imageUrl: this.imageUrl,
      imagePath: this.imagePath,
      location: this.location,
      visibility: this.visibility,
      allowedEmails: this.allowedEmails,
      tags: this.tags,
      metadata: this.metadata,
      observationIds: this.observationIds,
      observations: this.observations,
      schemaVersion: this.schemaVersion,
      createdAt: this.createdAt,
    };
  }

  /**
   * Firestore保存用データ変換
   */
  public toFirestoreData(): Record<string, any> {
    return {
      uid: this.uid,
      observerName: this.observerName,
      observerPhoto: this.observerPhoto || null,
      type: this.type,
      title: this.title,
      summary: this.summary,
      rawContent: this.rawContent,
      imageUrl: this.imageUrl || null,
      imagePath: this.imagePath || null,
      location: this.location || null,
      visibility: this.visibility,
      allowedEmails: this.visibility === 'shared' ? (this.allowedEmails || []) : [],
      tags: this.tags,
      metadata: this.metadata || {},
      observationIds: this.observationIds,
      observations: this.observations,
      schemaVersion: this.schemaVersion,
      createdAt: this.createdAt,
    };
  }

  /**
   * Firestoreドキュメントからのインスタンス生成
   */
  public static fromFirestore(id: string, data: Record<string, any>): ObservationSetModel {
    if (!id) throw new Error('Document missing id');
    if (!data.uid || typeof data.uid !== 'string') throw new Error('Document missing uid');
    if (!data.type || typeof data.type !== 'string') throw new Error('Document missing type');
    if (!data.title || typeof data.title !== 'string') throw new Error('Document missing title');
    if (typeof data.summary !== 'string') throw new Error('Document missing summary');
    if (typeof data.rawContent !== 'string') throw new Error('Document missing rawContent');
    if (!data.visibility || typeof data.visibility !== 'string') throw new Error('Document missing visibility');
    if (!Array.isArray(data.allowedEmails)) throw new Error('Document allowedEmails must be an array');
    if (!Array.isArray(data.tags)) throw new Error('Document tags must be an array');
    if (!Array.isArray(data.observationIds)) throw new Error('Document observationIds must be an array');
    if (!Array.isArray(data.observations)) throw new Error('Document observations must be an array');
    if (data.schemaVersion !== CURRENT_SCHEMA_VERSION) throw new Error(`Unsupported schema version: ${data.schemaVersion}`);

    let createdAtIso: string;
    if (data.createdAt && typeof data.createdAt.toDate === 'function') {
      createdAtIso = data.createdAt.toDate().toISOString();
    } else if (typeof data.createdAt === 'string') {
      createdAtIso = data.createdAt;
    } else {
      throw new Error('Document missing valid createdAt');
    }

    const mappedObservations: Observation[] = data.observations.map((o: any) => {
      if (!o.id || typeof o.id !== 'string') throw new Error('Observation missing id');
      if (o.parentSetId !== id) throw new Error('Observation parentSetId must match parent id');
      if (o.uid !== data.uid) throw new Error('Observation uid must match parent uid');
      if (!o.type || typeof o.type !== 'string') throw new Error('Observation missing type');
      if (!o.title || typeof o.title !== 'string') throw new Error('Observation missing title');
      if (typeof o.summary !== 'string') throw new Error('Observation missing summary');
      if (typeof o.rawContent !== 'string') throw new Error('Observation missing rawContent');
      if (o.visibility !== data.visibility) throw new Error('Observation visibility must match parent visibility');
      if (!Array.isArray(o.allowedEmails)) throw new Error('Observation allowedEmails must be an array');
      if (o.schemaVersion !== CURRENT_SCHEMA_VERSION) throw new Error(`Observation unsupported schema version: ${o.schemaVersion}`);
      if (typeof o.createdAt !== 'string') throw new Error('Observation missing createdAt');

      return {
        id: o.id,
        parentSetId: o.parentSetId,
        uid: o.uid,
        observerName: o.observerName,
        observerPhoto: o.observerPhoto,
        type: o.type,
        title: o.title,
        summary: o.summary,
        rawContent: o.rawContent,
        imageUrl: o.imageUrl,
        imagePath: o.imagePath,
        location: o.location,
        visibility: o.visibility,
        allowedEmails: o.allowedEmails,
        metadata: o.metadata,
        schemaVersion: o.schemaVersion,
        createdAt: o.createdAt,
      };
    });

    return new ObservationSetModel({
      id,
      uid: data.uid,
      observerName: data.observerName,
      observerPhoto: data.observerPhoto,
      type: data.type as ObservationType,
      title: data.title,
      summary: data.summary,
      rawContent: data.rawContent,
      imageUrl: data.imageUrl,
      imagePath: data.imagePath,
      location: data.location,
      visibility: data.visibility as VisibilityType,
      allowedEmails: data.allowedEmails,
      tags: data.tags,
      metadata: data.metadata || {},
      observationIds: data.observationIds,
      observations: mappedObservations,
      schemaVersion: data.schemaVersion,
      createdAt: createdAtIso,
    });
  }

  /**
   * クライアント側で画像を1024x768のWebP形式にリサイズ・変換して添付
   */
  public async setWebPImage(imageInput: File | Blob | string): Promise<void> {
    try {
      const webpUrl = await processImageToWebP(imageInput, 1024, 768, 0.85);
      this.imageUrl = webpUrl;
    } catch (err) {
      console.warn('WebP image processing failed:', err);
    }
  }

  /**
   * バリデーション
   */
  public validate(): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!this.title || this.title.trim().length === 0) {
      errors.push('観測タイトルは必須です。');
    }
    if (!this.type) {
      errors.push('観測種別は必須です。');
    }
    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * 所有権判定
   */
  public isOwnedBy(userUid?: string): boolean {
    if (!userUid) return false;
    return this.uid === userUid;
  }

  /**
   * 位置情報保有判定
   */
  public hasLocation(): boolean {
    return Boolean(this.location && typeof this.location.latitude === 'number');
  }

  /**
   * 画像保有判定
   */
  public hasImage(): boolean {
    return Boolean(this.imageUrl && this.imageUrl.length > 0);
  }

  /**
   * 日時フォーマット出力
   */
  public getFormattedCreatedAt(): string {
    try {
      return new Date(this.createdAt).toLocaleString('ja-JP');
    } catch {
      return this.createdAt;
    }
  }
}

