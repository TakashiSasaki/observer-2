export interface AIModelOption {
  id: string;
  name: string;
  category: 'Gemini 3 シリーズ' | 'Gemini 2.5 シリーズ' | 'その他・オープン';
  description: string;
  badge?: string;
}

export const FREE_VISION_MODELS: AIModelOption[] = [
  {
    id: 'gemini-3.6-flash',
    name: 'Gemini 3.6 Flash',
    category: 'Gemini 3 シリーズ',
    description: '高速かつ高度な多角理解に対応する最新標準マルチモーダルモデル',
    badge: '推奨',
  },
  {
    id: 'gemini-3.1-flash-lite',
    name: 'Gemini 3.1 Flash-Lite',
    category: 'Gemini 3 シリーズ',
    description: '画像・動画・テキスト対応の軽量・超高速モデル',
  },
  {
    id: 'gemini-3-flash-preview',
    name: 'Gemini 3 Flash Preview',
    category: 'Gemini 3 シリーズ',
    description: 'Gemini 3 世代のプレビュー版マルチモーダルモデル',
  },
  {
    id: 'gemini-3.1-pro-preview',
    name: 'Gemini 3.1 Pro Preview',
    category: 'Gemini 3 シリーズ',
    description: '複雑な図表解析・高度な推論に強い高性能モデル',
  },
];

export const DEFAULT_AI_MODEL = 'gemini-3.6-flash';
export const STORAGE_KEY_AI_MODEL = 'field_observer_selected_ai_model';

export function getStoredAIModel(): string {
  try {
    const saved = localStorage.getItem(STORAGE_KEY_AI_MODEL);
    if (saved && FREE_VISION_MODELS.some((m) => m.id === saved)) {
      return saved;
    }
  } catch {
    // LocalStorage access error fallback
  }
  return DEFAULT_AI_MODEL;
}

export function setStoredAIModel(modelId: string): void {
  try {
    localStorage.setItem(STORAGE_KEY_AI_MODEL, modelId);
  } catch {
    // LocalStorage access error fallback
  }
}
