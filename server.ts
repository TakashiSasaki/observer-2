import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '15mb' }));

// Lazy load Gemini AI instance
function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY environment variable is missing.');
  }
const ai = new GoogleGenAI({ 
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });
  return ai;
}

// Health check route
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Helper to strip base64 header
function parseBase64Image(dataUrl: string): { mimeType: string; base64Data: string } {
  const matches = dataUrl.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
  if (matches && matches.length === 3) {
    return { mimeType: matches[1], base64Data: matches[2] };
  }
  // Default fallback if raw base64
  return { mimeType: 'image/jpeg', base64Data: dataUrl };
}

// 1. Photo Object Analysis Endpoint
app.post('/api/analyze-object', async (req, res) => {
  try {
    const { image, userNote, model } = req.body;
    if (!image) {
      return res.status(400).json({ error: '画像データが必要です。' });
    }

    // Default to gemini-3.6-flash if invalid or not specified
    const targetModel = model || 'gemini-3.6-flash';

    const { mimeType, base64Data } = parseBase64Image(image);
    const ai = getGeminiClient();

    const prompt = `あなたは高度な物体識別・視覚観測AIアシスタントです。
提供された写真を精密に観察し、写っている主要な物体、全体の文脈、特徴、タグを分析してください。
観測者(ユーザー)の追加ノート: "${userNote || 'なし'}"

出力は必ず以下の厳密なJSONフォーマットで返してください:
{
  "title": "簡潔で具体的な観測タイトル（例: 『街角の赤い郵便ポストと古い看板』）",
  "summary": "観測結果の分かりやすい概要（2〜3文の日本語）",
  "objects": [
    {
      "name": "物体名（日本語）",
      "category": "カテゴリ（例: 機器, 家具, 建物, 自然, 標識, 動物など）",
      "confidence": 0.95,
      "description": "その物体の色、状態、位置などの詳細"
    }
  ],
  "tags": ["タグ1", "タグ2", "タグ3"],
  "detailedDescription": "周囲の環境や状況を含めた詳細な観測メモ"
}`;

    const response = await ai.models.generateContent({
      model: targetModel,
      contents: [
        {
          inlineData: {
            mimeType,
            data: base64Data,
          },
        },
        prompt,
      ],
      config: {
        responseMimeType: 'application/json',
      },
    });

    const jsonText = response.text || '{}';
    const parsed = JSON.parse(jsonText);
    res.json({ success: true, data: parsed, usedModel: targetModel });
  } catch (error: any) {
    console.error('Error in analyze-object:', error);
    res.status(500).json({
      error: error?.message || '画像分析中にエラーが発生しました。',
    });
  }
});

// 2. Photo OCR / Text Analysis Endpoint
app.post('/api/analyze-ocr', async (req, res) => {
  try {
    const { image, userNote, model } = req.body;
    if (!image) {
      return res.status(400).json({ error: '画像データが必要です。' });
    }

    const targetModel = model || 'gemini-3.6-flash';

    const { mimeType, base64Data } = parseBase64Image(image);
    const ai = getGeminiClient();

    const prompt = `あなたは高度なOCR・文字認識AIアシスタントです。
提供された写真内に含まれるすべての文字（看板、文書、ラベル、手書きメモ、レシート、標識など）を極めて高精度に抽出・構造化してください。
観測者(ユーザー)の追加ノート: "${userNote || 'なし'}"

出力は必ず以下の厳密なJSONフォーマットで返してください:
{
  "title": "読み取ったテキストの主旨タイトル（例: 『カフェのメニュー看板』）",
  "summary": "テキスト内容の短い要約",
  "extractedText": "画像から読み取った全テキスト（改行やレイアウトを自然に再現）",
  "language": "主要言語（例: 日本語, 英語, 多言語など）",
  "textType": "文字のタイプ（例: 看板, 書類, 手書きメモ, レシート, ラベル, その他）",
  "keyEntities": ["検出された重要なキーワード、日付、金額、固有名称など"],
  "tags": ["OCR", "文字読み取り", "タグ"]
}`;

    const response = await ai.models.generateContent({
      model: targetModel,
      contents: [
        {
          inlineData: {
            mimeType,
            data: base64Data,
          },
        },
        prompt,
      ],
      config: {
        responseMimeType: 'application/json',
      },
    });

    const jsonText = response.text || '{}';
    const parsed = JSON.parse(jsonText);
    res.json({ success: true, data: parsed, usedModel: targetModel });
  } catch (error: any) {
    console.error('Error in analyze-ocr:', error);
    res.status(500).json({
      error: error?.message || '文字読み取り中にエラーが発生しました。',
    });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`観測ハブサーバー稼働中: http://0.0.0.0:${PORT}`);
  });
}

startServer();
