export type VisibilityType = 'public' | 'authenticated' | 'shared' | 'private';

export type ObservationType = 'nfc' | 'qr' | 'object' | 'ocr' | 'manual';

export interface LocationData {
  latitude: number;
  longitude: number;
  accuracy?: number;
  address?: string;
}

export interface DetectedObject {
  name: string;
  category: string;
  confidence: number;
  description?: string;
}

export interface ObservationMetadata {
  nfcTech?: string;
  serialNumber?: string;
  detectedObjects?: DetectedObject[];
  extractedText?: string;
  language?: string;
  textType?: string;
  keyEntities?: string[];
  [key: string]: any;
}

export interface Observation {
  id: string;
  parentSetId: string;
  uid: string;
  observerName?: string;
  observerPhoto?: string;
  type: ObservationType;
  title: string;
  summary: string;
  rawContent: string;
  imageUrl?: string; // Data URL (Base64) または Cloud Storage HTTPS URL
  imagePath?: string; // Cloud Storage バケット内参照パス (例: observations/{id}.webp)
  location?: LocationData;
  visibility: VisibilityType;
  allowedEmails?: string[];
  metadata?: ObservationMetadata;
  schemaVersion: string;
  createdAt: string;
}

export interface ObservationSet {
  id: string;
  uid: string;
  observerName?: string;
  observerPhoto?: string;
  type: ObservationType;
  title: string;
  summary: string;
  rawContent: string;
  imageUrl?: string; // Data URL (Base64) または Cloud Storage HTTPS URL
  imagePath?: string; // Cloud Storage バケット内参照パス (例: observations/{id}.webp)
  location?: LocationData;
  visibility: VisibilityType;
  allowedEmails?: string[];
  tags: string[];
  metadata?: ObservationMetadata;
  observationIds: string[]; // 参照用: 複数のセットから参照可能な個別観測IDリスト
  observations: Observation[]; // 展開用: 非正規化観測オブジェクト配列
  schemaVersion: string;
  createdAt: string; // ISO string
}

export interface ObserverUser {
  uid: string;
  displayName: string;
  photoURL?: string;
  email?: string;
  isAnonymous: boolean;
}
