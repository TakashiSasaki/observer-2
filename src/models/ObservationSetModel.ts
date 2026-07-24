import { ObservationSet, Observation, ObservationType, VisibilityType, LocationData, ObservationMetadata } from '../types';
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
  allowedEmails?: string[];
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
    this.schemaVersion = initData.schemaVersion || '1.0.0';
    
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
        schemaVersion: o.schemaVersion || '1.0.0',
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
      schemaVersion: obs.schemaVersion || '1.0.0',
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
      observationIds: this.observationIds || this.observations.map((o) => o.id),
      observations: this.observations || [],
      schemaVersion: this.schemaVersion || '1.0.0',
      createdAt: this.createdAt,
    };
  }

  /**
   * Firestoreドキュメントからのインスタンス生成
   */
  public static fromFirestore(id: string, data: Record<string, any>): ObservationSetModel {
    let createdAtIso = new Date().toISOString();
    if (data.createdAt && typeof data.createdAt.toDate === 'function') {
      createdAtIso = data.createdAt.toDate().toISOString();
    } else if (typeof data.createdAt === 'string') {
      createdAtIso = data.createdAt;
    }

    const rawObsArray: any[] = Array.isArray(data.observations) ? data.observations : [];

    const parentSetUid = data.uid;
    if (!parentSetUid) throw new Error('Document missing uid');
    
    const parentSetVisibility = data.visibility;
    if (!parentSetVisibility) throw new Error('Document missing visibility');

    const parentSetAllowedEmails = Array.isArray(data.allowedEmails) ? data.allowedEmails : [];

    const mappedObservations: Observation[] = rawObsArray.map((o: any) => {
      const obsId = o.id || generateId();
      if (!o.uid) throw new Error('Observation missing uid');
      return {
        id: obsId,
        parentSetId: o.parentSetId || id,
        uid: o.uid,
        observerName: o.observerName,
        observerPhoto: o.observerPhoto,
        type: o.type || data.type || 'manual',
        title: o.title || '',
        summary: o.summary || '',
        rawContent: o.rawContent || '',
        imageUrl: o.imageUrl,
        imagePath: o.imagePath,
        location: o.location,
        visibility: o.visibility || parentSetVisibility,
        allowedEmails: Array.isArray(o.allowedEmails) ? o.allowedEmails : parentSetAllowedEmails,
        metadata: o.metadata || {},
        schemaVersion: o.schemaVersion || '1.0.0',
        createdAt: o.createdAt || createdAtIso,
      };
    });

    const obsIds = Array.isArray(data.observationIds) ? data.observationIds : mappedObservations.map((o) => o.id);
    if (!Array.isArray(data.observationIds)) {
       throw new Error('observationIds is required in new format');
    }

    return new ObservationSetModel({
      id,
      uid: parentSetUid,
      observerName: data.observerName,
      observerPhoto: data.observerPhoto,
      type: data.type || 'manual',
      title: data.title || '無題の観測セット',
      summary: data.summary || '',
      rawContent: data.rawContent || '',
      imageUrl: data.imageUrl,
      imagePath: data.imagePath,
      location: data.location,
      visibility: parentSetVisibility,
      allowedEmails: parentSetAllowedEmails,
      tags: Array.isArray(data.tags) ? data.tags : [],
      metadata: data.metadata || {},
      observationIds: obsIds,
      observations: mappedObservations,
      schemaVersion: data.schemaVersion || '1.0.0',
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

