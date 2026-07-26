/**
 * Contract-owned types for the immutable Observer observation interchange
 * release. Application-specific projections and Firebase types stay outside
 * this module.
 */
export const CONTRACT_ID = 'jp.moukaeritai.observer.observation-interchange' as const;
export const CONTRACT_VERSION = '2.0.0' as const;
export const CONTRACT_PROFILE = 'observer-owner-scoped' as const;
export const SCHEMA_ID = '2f1fd347-e99b-477e-884a-86a7dbb0358b' as const;
export const SCHEMA_URI = `urn:uuid:${SCHEMA_ID}` as const;

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
  [key: string]: unknown;
}

export type VisibilityType = 'public' | 'authenticated' | 'shared' | 'private';

export type ObservationType = 'nfc' | 'qr' | 'object' | 'ocr' | 'manual';

export interface Observation {
  id: string;
  uid: string;
  observerName?: string;
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
  metadata: ObservationMetadata;
  schemaVersion: typeof CONTRACT_VERSION;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
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
  imageUrl?: string;
  imagePath?: string;
  location?: LocationData;
  visibility: VisibilityType;
  allowedEmails: string[];
  tags: string[];
  metadata: ObservationMetadata;
  schemaVersion: typeof CONTRACT_VERSION;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface ObservationSetMembership {
  id: string;
  observationSetId: string;
  observationId: string;
  uid: string;
  position: number;
  schemaVersion: typeof CONTRACT_VERSION;
  createdAt: string;
}

export interface ObservationInterchangeBundle {
  schemaVersion: typeof CONTRACT_VERSION;
  exportedAt: string;
  observations: Observation[];
  observationSets: ObservationSet[];
  memberships: ObservationSetMembership[];
}
