import React, { useState, useRef, useEffect } from 'react';
import { Camera, FileText, Loader2, Sparkles, CheckCircle, Copy, Tag, AlignLeft, Upload, SwitchCamera, AlertCircle, RefreshCw } from 'lucide-react';
import { processImageToWebP } from '../../utils/imageUtils';
import { AIModelSelector } from '../AIModelSelector';
import { getStoredAIModel, FREE_VISION_MODELS } from '../../constants/aiModels';

interface OCRScannerProps {
  onCapture: (data: {
    rawContent: string;
    title: string;
    summary: string;
    tags: string[];
    imageUrl?: string;
    metadata?: Record<string, any>;
  }) => void;
}

const PRESET_OCR_SAMPLES = [
  {
    name: 'カフェの案内看板',
    url: 'https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&w=800&q=80',
    desc: 'メニュー名と価格が書かれた黒板看板',
  },
  {
    name: '道路案内と各種標識',
    url: 'https://images.unsplash.com/photo-1572949645841-094f3a9c4c94?auto=format&fit=crop&w=800&q=80',
    desc: '地名や方向、制限速度を示す交通標識',
  },
  {
    name: '図書・レシート・書類',
    url: 'https://images.unsplash.com/photo-1589829545856-d10d557cf95f?auto=format&fit=crop&w=800&q=80',
    desc: '活字テキストが印字された公式文書',
  },
];

export const OCRScanner: React.FC<OCRScannerProps> = ({ onCapture }) => {
  const [activeTab, setActiveTab] = useState<'camera' | 'file' | 'sample'>('camera');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [userNote, setUserNote] = useState<string>('');
  const [selectedModel, setSelectedModel] = useState<string>(getStoredAIModel());
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [usedModelName, setUsedModelName] = useState<string | null>(null);
  const [analysisResult, setAnalysisResult] = useState<{
    title: string;
    summary: string;
    extractedText: string;
    language: string;
    textType: string;
    keyEntities: string[];
    tags: string[];
  } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);

  // Camera State & Refs
  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [cameraError, setCameraError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Start Camera Stream
  const startCamera = async (facing: 'environment' | 'user' = facingMode) => {
    setCameraError(null);
    stopCamera();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } },
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setIsCameraActive(true);
      } else {
        stream.getTracks().forEach((track) => track.stop());
      }
    } catch (err: any) {
      console.warn('Camera initiation error:', err);
      setCameraError('カメラの起動に失敗しました。ブラウザのカメラ許可設定を確認するか、ファイル選択をご利用ください。');
      setIsCameraActive(false);
    }
  };

  const stopCamera = () => {
    setIsCameraActive(false);
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((track) => track.stop());
      videoRef.current.srcObject = null;
    }
  };

  const toggleCameraFacing = () => {
    const nextFacing = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(nextFacing);
    if (activeTab === 'camera') {
      startCamera(nextFacing);
    }
  };

  const capturePhotoFromCamera = async () => {
    if (!videoRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current || document.createElement('canvas');
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d');

    if (ctx) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
      try {
        const webpUrl = await processImageToWebP(dataUrl, 1024, 768, 0.85);
        setSelectedImage(webpUrl);
      } catch {
        setSelectedImage(dataUrl);
      }
      setAnalysisResult(null);
      setErrorMsg(null);
      stopCamera();
    }
  };

  useEffect(() => {
    if (activeTab === 'camera' && !selectedImage) {
      startCamera();
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [activeTab]);

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const webpUrl = await processImageToWebP(file, 1024, 768, 0.85);
      setSelectedImage(webpUrl);
      setAnalysisResult(null);
      setErrorMsg(null);
    } catch {
      const reader = new FileReader();
      reader.onload = (evt) => {
        setSelectedImage(evt.target?.result as string);
        setAnalysisResult(null);
        setErrorMsg(null);
      };
      reader.readAsDataURL(file);
    }
  };

  const handlePresetSelect = async (url: string) => {
    try {
      const webpUrl = await processImageToWebP(url, 1024, 768, 0.85);
      setSelectedImage(webpUrl);
    } catch {
      setSelectedImage(url);
    }
    setAnalysisResult(null);
    setErrorMsg(null);
  };

  const runOCR = async () => {
    if (!selectedImage) return;

    setIsAnalyzing(true);
    setErrorMsg(null);

    try {
      let base64Image = selectedImage;
      if (selectedImage.startsWith('http')) {
        const response = await fetch(selectedImage);
        const blob = await response.blob();
        base64Image = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(blob);
        });
      }

      const res = await fetch('/api/analyze-ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: base64Image,
          userNote,
          model: selectedModel,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || '文字認識APIからの応答取得に失敗しました。');
      }

      const parsed = data.data;
      setAnalysisResult(parsed);
      const activeModelObj = FREE_VISION_MODELS.find((m) => m.id === (data.usedModel || selectedModel));
      setUsedModelName(activeModelObj?.name || data.usedModel || selectedModel);

      onCapture({
        rawContent: parsed.extractedText || '',
        title: parsed.title || '写真文字読み取り (OCR)',
        summary: parsed.summary || '写真内テキストを抽出しました',
        tags: parsed.tags || ['OCR', '文字認識'],
        imageUrl: base64Image,
        metadata: {
          extractedText: parsed.extractedText,
          language: parsed.language,
          textType: parsed.textType,
          keyEntities: parsed.keyEntities,
        },
      });
    } catch (err: any) {
      console.error('OCR failed:', err);
      setErrorMsg(err.message || '文字読み取りに失敗しました。');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const copyTextToClipboard = () => {
    if (analysisResult?.extractedText) {
      navigator.clipboard.writeText(analysisResult.extractedText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="space-y-4">
      {/* AI Model Switcher */}
      <AIModelSelector
        selectedModel={selectedModel}
        onModelChange={(m) => setSelectedModel(m)}
      />

      {/* Input Mode Tabs */}
      <div className="flex border-b border-slate-200">
        <button
          type="button"
          onClick={() => setActiveTab('camera')}
          className={`px-3 py-2 text-xs font-bold border-b-2 flex items-center gap-1.5 transition cursor-pointer ${
            activeTab === 'camera'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Camera className="w-3.5 h-3.5" />
          リアルタイムカメラで撮影
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('file')}
          className={`px-3 py-2 text-xs font-bold border-b-2 flex items-center gap-1.5 transition cursor-pointer ${
            activeTab === 'file'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Upload className="w-3.5 h-3.5" />
          写真ファイルを選択
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('sample')}
          className={`px-3 py-2 text-xs font-bold border-b-2 flex items-center gap-1.5 transition cursor-pointer ${
            activeTab === 'sample'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5 text-amber-500" />
          OCRサンプル
        </button>
      </div>

      {/* Tab Content: Live Camera */}
      {activeTab === 'camera' && (
        <div className="space-y-2">
          <div className="relative rounded-xl overflow-hidden bg-slate-900 min-h-[240px] flex flex-col items-center justify-center text-white p-3">
            {cameraError ? (
              <div className="text-center space-y-3 p-4">
                <AlertCircle className="w-10 h-10 text-amber-400 mx-auto" />
                <p className="text-xs text-slate-300 max-w-sm">{cameraError}</p>
                <div className="flex justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => startCamera()}
                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    カメラを再試行
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('file')}
                    className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-xs font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    ファイルを選択
                  </button>
                </div>
              </div>
            ) : (
              <>
                <video
                  ref={videoRef}
                  playsInline
                  autoPlay
                  muted
                  className="w-full max-h-[260px] object-cover rounded-lg bg-black"
                />
                <canvas ref={canvasRef} className="hidden" />

                {/* Camera controls overlay */}
                <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between gap-2 bg-slate-900/80 backdrop-blur-xs p-2 rounded-xl border border-slate-700/60">
                  <button
                    type="button"
                    onClick={toggleCameraFacing}
                    title="カメラ切り替え (イン/アウト)"
                    className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold flex items-center gap-1 transition cursor-pointer"
                  >
                    <SwitchCamera className="w-4 h-4" />
                    <span className="hidden sm:inline">カメラ切り替え</span>
                  </button>

                  <button
                    type="button"
                    onClick={capturePhotoFromCamera}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold flex items-center gap-2 shadow-lg hover:scale-105 active:scale-95 transition cursor-pointer"
                  >
                    <Camera className="w-4 h-4" />
                    <span>文書・看板を撮影</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Tab Content: File Input */}
      {activeTab === 'file' && (
        <div className="p-6 border-2 border-dashed border-slate-300 rounded-xl hover:bg-slate-50 text-center transition">
          <input
            type="file"
            ref={fileInputRef}
            accept="image/*"
            capture="environment"
            onChange={handleImageSelect}
            className="hidden"
            id="ocr-file-input"
          />
          <label htmlFor="ocr-file-input" className="cursor-pointer space-y-2 block">
            <Upload className="w-10 h-10 text-indigo-600 mx-auto" />
            <div className="text-sm font-bold text-slate-700">
              画像ファイルを選択 / スマホカメラ起動
            </div>
            <p className="text-xs text-slate-500">
              看板・文書・手書きメモを画像ファイルまたは撮影ダイアログから読み込み
            </p>
          </label>
        </div>
      )}

      {/* Tab Content: Preset Samples */}
      {activeTab === 'sample' && (
        <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
          <div className="text-xs font-bold text-slate-700 flex items-center gap-1">
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            テスト用OCRサンプル
          </div>
          <div className="grid grid-cols-3 gap-2">
            {PRESET_OCR_SAMPLES.map((preset, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handlePresetSelect(preset.url)}
                className="relative rounded-lg overflow-hidden border border-slate-200 group aspect-video hover:ring-2 hover:ring-indigo-500 transition cursor-pointer"
              >
                <img
                  src={preset.url}
                  alt={preset.name}
                  className="w-full h-full object-cover group-hover:scale-105 transition"
                />
                <div className="absolute inset-0 bg-slate-900/50 opacity-0 group-hover:opacity-100 transition flex items-center justify-center p-1 text-center">
                  <span className="text-[10px] font-bold text-white line-clamp-2">
                    {preset.name}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Preview & Execution */}
      {selectedImage && (
        <div className="p-4 bg-slate-900 rounded-xl space-y-3 text-white">
          <div className="relative max-h-[240px] rounded-lg overflow-hidden flex justify-center bg-black">
            <img src={selectedImage} alt="OCR対象" className="max-h-[240px] object-contain" />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-slate-300">
              補足メモ（言語指定や文脈など）:
            </label>
            <input
              type="text"
              value={userNote}
              onChange={(e) => setUserNote(e.target.value)}
              placeholder="例: 和英混在の看板、領収書の金額を抽出など"
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <button
            type="button"
            onClick={runOCR}
            disabled={isAnalyzing}
            className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition shadow"
          >
            {isAnalyzing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Gemini OCRが文字を高度スキャン・解析中...
              </>
            ) : (
              <>
                <FileText className="w-4 h-4" />
                Gemini AIで文字読み取り (OCR) 実行
              </>
            )}
          </button>
        </div>
      )}

      {errorMsg && (
        <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs font-medium">
          {errorMsg}
        </div>
      )}

      {/* Rendered OCR Analysis Results */}
      {analysisResult && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl space-y-3 text-slate-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-emerald-900 font-bold text-sm">
              <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
              {analysisResult.title}
            </div>
            <div className="flex gap-1.5 text-[10px] items-center">
              {usedModelName && (
                <span className="px-2 py-0.5 bg-emerald-200/80 text-emerald-900 rounded font-mono font-bold">
                  モデル: {usedModelName}
                </span>
              )}
              {analysisResult.language && (
                <span className="px-2 py-0.5 bg-emerald-200 text-emerald-800 rounded font-bold">
                  {analysisResult.language}
                </span>
              )}
              {analysisResult.textType && (
                <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded font-bold">
                  {analysisResult.textType}
                </span>
              )}
            </div>
          </div>

          <p className="text-xs text-slate-700">{analysisResult.summary}</p>

          {/* Extracted Text Block */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs font-bold text-slate-700">
              <span className="flex items-center gap-1">
                <AlignLeft className="w-3.5 h-3.5 text-indigo-600" />
                抽出されたテキスト全般
              </span>
              <button
                type="button"
                onClick={copyTextToClipboard}
                className="text-[11px] text-indigo-600 hover:text-indigo-800 flex items-center gap-1 font-semibold"
              >
                <Copy className="w-3 h-3" />
                {copied ? 'コピー完了!' : 'テキストをコピー'}
              </button>
            </div>
            <pre className="p-3 bg-white border border-slate-200 rounded-lg text-xs font-mono whitespace-pre-wrap text-slate-800 leading-relaxed max-h-48 overflow-y-auto">
              {analysisResult.extractedText}
            </pre>
          </div>

          {/* Key Entities */}
          {analysisResult.keyEntities && analysisResult.keyEntities.length > 0 && (
            <div className="space-y-1">
              <div className="text-[11px] font-bold text-slate-600">抽出されたキーエンティティ:</div>
              <div className="flex flex-wrap gap-1">
                {analysisResult.keyEntities.map((entity, i) => (
                  <span
                    key={i}
                    className="px-2 py-0.5 bg-slate-200/80 text-slate-800 rounded text-[10px] font-medium"
                  >
                    {entity}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
