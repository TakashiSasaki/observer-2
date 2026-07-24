import React, { useState, useRef, useEffect } from 'react';
import { Camera, Upload, Eye, Loader2, Sparkles, CheckCircle, Tag, Package, SwitchCamera, AlertCircle, RefreshCw } from 'lucide-react';
import { DetectedObject } from '../../types';
import { processImageToWebP } from '../../utils/imageUtils';
import { AIModelSelector } from '../AIModelSelector';
import { getStoredAIModel, FREE_VISION_MODELS } from '../../constants/aiModels';

interface ObjectScannerProps {
  onCapture: (data: {
    rawContent: string;
    title: string;
    summary: string;
    tags: string[];
    imageUrl?: string;
    metadata?: Record<string, any>;
  }) => void;
}

// Preset sample images for instant AI object recognition testing
const PRESET_OBJECT_SAMPLES = [
  {
    name: 'ワークスペースと電子機器',
    url: 'https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&w=800&q=80',
    desc: 'ノートPC、コーヒーカップ、ノート、ペンが置かれたデスク',
  },
  {
    name: '街角の景色と標識',
    url: 'https://images.unsplash.com/photo-1519501025264-65ba15a82390?auto=format&fit=crop&w=800&q=80',
    desc: 'ビル街、信号機、街灯、通過する自動車',
  },
  {
    name: '植物と観葉植物',
    url: 'https://images.unsplash.com/photo-1485955900006-10f4d324d411?auto=format&fit=crop&w=800&q=80',
    desc: '鉢植えの緑豊かな植物と日光',
  },
];

export const ObjectScanner: React.FC<ObjectScannerProps> = ({ onCapture }) => {
  const [activeTab, setActiveTab] = useState<'camera' | 'file' | 'sample'>('camera');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [userNote, setUserNote] = useState<string>('');
  const [selectedModel, setSelectedModel] = useState<string>(getStoredAIModel());
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [usedModelName, setUsedModelName] = useState<string | null>(null);
  const [analysisResult, setAnalysisResult] = useState<{
    title: string;
    summary: string;
    objects: DetectedObject[];
    tags: string[];
    detailedDescription: string;
  } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

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

  const runObjectAnalysis = async () => {
    if (!selectedImage) return;

    setIsAnalyzing(true);
    setErrorMsg(null);

    try {
      // If preset URL, fetch and convert to base64
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

      const res = await fetch('/api/analyze-object', {
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
        throw new Error(data.error || '画像識別APIからの応答取得に失敗しました。');
      }

      const parsed = data.data;
      setAnalysisResult(parsed);
      const activeModelObj = FREE_VISION_MODELS.find((m) => m.id === (data.usedModel || selectedModel));
      setUsedModelName(activeModelObj?.name || data.usedModel || selectedModel);

      onCapture({
        rawContent: JSON.stringify(parsed.objects || []),
        title: parsed.title || '写真物体観測',
        summary: parsed.summary || '写真内の要素を分析・特定しました',
        tags: parsed.tags || ['物体識別', 'AI観測'],
        imageUrl: base64Image,
        metadata: {
          detectedObjects: parsed.objects,
          detailedDescription: parsed.detailedDescription,
        },
      });
    } catch (err: any) {
      console.error('Object analysis failed:', err);
      setErrorMsg(err.message || '物体識別に失敗しました。');
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* AI Model Switcher */}
      <AIModelSelector
        selectedModel={selectedModel}
        onModelChange={(m) => setSelectedModel(m)}
      />

      {/* Photo Picker Input Mode Tabs */}
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
          サンプル写真
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
                    <span>写真を撮影して選択</span>
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
            id="object-file-input"
          />
          <label htmlFor="object-file-input" className="cursor-pointer space-y-2 block">
            <Upload className="w-10 h-10 text-indigo-600 mx-auto" />
            <div className="text-sm font-bold text-slate-700">
              画像ファイルを選択 / スマホカメラ起動
            </div>
            <p className="text-xs text-slate-500">
              JPG, PNG, WEBP 画像ファイルに対応（カメラ撮影ダイアログも起動可能）
            </p>
          </label>
        </div>
      )}

      {/* Tab Content: Preset Samples */}
      {activeTab === 'sample' && (
        <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
          <div className="text-xs font-bold text-slate-700 flex items-center gap-1">
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            テスト用サンプル写真
          </div>
          <div className="grid grid-cols-3 gap-2">
            {PRESET_OBJECT_SAMPLES.map((preset, idx) => (
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

      {/* Selected Image Preview & Controls */}
      {selectedImage && (
        <div className="p-4 bg-slate-900 rounded-xl space-y-3 text-white">
          <div className="relative max-h-[240px] rounded-lg overflow-hidden flex justify-center bg-black">
            <img src={selectedImage} alt="観測対象" className="max-h-[240px] object-contain" />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-slate-300">
              観測者メモ（注目点や場所などのオプショナル追加情報）:
            </label>
            <input
              type="text"
              value={userNote}
              onChange={(e) => setUserNote(e.target.value)}
              placeholder="例: ラボデスクの作業環境、屋外での発見物など"
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <button
            type="button"
            onClick={runObjectAnalysis}
            disabled={isAnalyzing}
            className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition shadow"
          >
            {isAnalyzing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                AIが写真を高精度スキャン・物体識別中...
              </>
            ) : (
              <>
                <Eye className="w-4 h-4" />
                Gemini AIで写真の物体を自動識別
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

      {/* Rendered AI Analysis Results */}
      {analysisResult && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl space-y-3 text-slate-800">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-emerald-900 font-bold text-sm">
              <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
              {analysisResult.title}
            </div>
            {usedModelName && (
              <span className="px-2 py-0.5 bg-emerald-200/80 text-emerald-900 rounded font-mono text-[10px] font-bold shrink-0">
                モデル: {usedModelName}
              </span>
            )}
          </div>

          <p className="text-xs text-slate-700 leading-relaxed">{analysisResult.summary}</p>

          {/* Detected Objects List */}
          {analysisResult.objects && analysisResult.objects.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-bold text-slate-700 flex items-center gap-1">
                <Package className="w-3.5 h-3.5 text-indigo-600" />
                検出された要素 ({analysisResult.objects.length}件):
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {analysisResult.objects.map((obj, i) => (
                  <div
                    key={i}
                    className="p-2.5 bg-white border border-slate-200 rounded-lg text-xs space-y-1 shadow-xs"
                  >
                    <div className="flex items-center justify-between font-bold text-slate-800">
                      <span>{obj.name}</span>
                      <span className="text-[10px] px-1.5 py-0.5 bg-indigo-100 text-indigo-700 rounded font-mono">
                        {(obj.confidence * 100).toFixed(0)}% 確度
                      </span>
                    </div>
                    {obj.category && (
                      <div className="text-[10px] text-slate-500 font-semibold">
                        カテゴリ: {obj.category}
                      </div>
                    )}
                    {obj.description && (
                      <p className="text-[11px] text-slate-600 line-clamp-2">
                        {obj.description}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tags */}
          {analysisResult.tags && analysisResult.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {analysisResult.tags.map((t, idx) => (
                <span
                  key={idx}
                  className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-md text-[11px] font-medium flex items-center gap-1"
                >
                  <Tag className="w-3 h-3" />
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
