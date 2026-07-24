import React, { useState, useRef, useEffect } from 'react';
import jsQR from 'jsqr';
import { Camera, Upload, QrCode, Sparkles, CheckCircle, AlertCircle } from 'lucide-react';

interface QRScannerProps {
  onCapture: (data: {
    rawContent: string;
    title: string;
    summary: string;
    tags: string[];
    imageUrl?: string;
  }) => void;
}

const SAMPLE_QRS = [
  {
    label: 'WebサイトURL',
    content: 'https://ai.studio/build',
    title: 'AI Studio WebサイトQR',
    summary: 'Google AI Studioの開発プラットフォームURLを観測',
    tags: ['URL', 'Web', '開発ツール'],
  },
  {
    label: 'Wi-Fi設定情報',
    content: 'WIFI:S:Lab_5G_Guest;T:WPA;P:ObservationPass2026;;',
    title: '研究室Wi-Fi接続情報QR',
    summary: '観測ラボのゲストアクセス用Wi-Fiネットワーク設定',
    tags: ['WiFi', 'ネットワーク', '設定'],
  },
  {
    label: '観測機器シリアル名刺',
    content: 'BEGIN:VCARD\nVERSION:3.0\nN:観測装置;センサーA102\nTEL:090-1234-5678\nEND:VCARD',
    title: 'センサー装置A102 登録カード',
    summary: 'フィールド観測用IoTセンサーA102の機器情報',
    tags: ['機器カード', 'vCard', 'IoT'],
  },
];

export const QRScanner: React.FC<QRScannerProps> = ({ onCapture }) => {
  const [activeTab, setActiveTab] = useState<'camera' | 'file' | 'sample'>('camera');
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState<string | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Start Camera Scan
  const startCamera = async () => {
    setCameraError(null);
    setScanResult(null);
    setIsScanning(true);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });

      if (!videoRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      videoRef.current.srcObject = stream;
      try {
        await videoRef.current.play();
      } catch (playErr: any) {
        if (playErr.name !== 'AbortError') {
          console.warn('Camera play interrupted:', playErr);
        }
      }
      animationFrameRef.current = requestAnimationFrame(tickScan);
    } catch (err: any) {
      console.warn('Camera error:', err);
      setCameraError('カメラの起動に失敗しました。ファイル送信またはサンプル観測をお試しください。');
      setIsScanning(false);
    }
  };

  const stopCamera = () => {
    setIsScanning(false);
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((track) => track.stop());
      videoRef.current.srcObject = null;
    }
  };

  const tickScan = () => {
    if (videoRef.current && videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA) {
      const canvas = canvasRef.current || document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (ctx && videoRef.current) {
        canvas.height = videoRef.current.videoHeight;
        canvas.width = videoRef.current.videoWidth;
        ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: 'dontInvert',
        });

        if (code && code.data) {
          const snapshotUrl = canvas.toDataURL('image/jpeg');
          setScanResult(code.data);
          setCapturedImage(snapshotUrl);
          stopCamera();
          handleProcessQR(code.data, snapshotUrl);
          return;
        }
      }
    }
    if (isScanning) {
      animationFrameRef.current = requestAnimationFrame(tickScan);
    }
  };

  useEffect(() => {
    if (activeTab === 'camera') {
      startCamera();
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [activeTab]);

  // Read QR from File
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const imgUrl = event.target?.result as string;
      setCapturedImage(imgUrl);

      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0);
          const imageData = ctx.getImageData(0, 0, img.width, img.height);
          const code = jsQR(imageData.data, imageData.width, imageData.height);
          if (code && code.data) {
            setScanResult(code.data);
            handleProcessQR(code.data, imgUrl);
          } else {
            setScanResult(null);
            alert('画像からQRコードを検出できませんでした。別の画像をお試しください。');
          }
        }
      };
      img.src = imgUrl;
    };
    reader.readAsDataURL(file);
  };

  // Helper to categorize QR content
  const handleProcessQR = (content: string, imageUrl?: string) => {
    let title = 'QRコード観測データ';
    let summary = `内容: ${content.substring(0, 80)}`;
    const tags: string[] = ['QRコード'];

    if (content.startsWith('http://') || content.startsWith('https://')) {
      title = `URLリンク: ${new URL(content).hostname}`;
      summary = `Webサイトへのリンクアドレス: ${content}`;
      tags.push('URL', 'Web');
    } else if (content.startsWith('WIFI:')) {
      title = 'Wi-Fiネットワーク設定情報';
      summary = 'Wi-FiルーターのSSIDおよびパスワード情報';
      tags.push('Wi-Fi', 'ネットワーク');
    } else if (content.startsWith('BEGIN:VCARD')) {
      title = 'vCard 電子名刺データ';
      summary = '連絡先プロフィールデータ';
      tags.push('名刺', '連絡先');
    }

    onCapture({
      rawContent: content,
      title,
      summary,
      tags,
      imageUrl,
    });
  };

  return (
    <div className="space-y-4">
      {/* Tab Selectors */}
      <div className="flex border-b border-slate-200">
        <button
          type="button"
          onClick={() => setActiveTab('camera')}
          className={`px-4 py-2 text-sm font-medium border-b-2 flex items-center gap-2 transition ${
            activeTab === 'camera'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Camera className="w-4 h-4" />
          リアルタイムカメラ
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('file')}
          className={`px-4 py-2 text-sm font-medium border-b-2 flex items-center gap-2 transition ${
            activeTab === 'file'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Upload className="w-4 h-4" />
          写真ファイルから解析
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('sample')}
          className={`px-4 py-2 text-sm font-medium border-b-2 flex items-center gap-2 transition ${
            activeTab === 'sample'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Sparkles className="w-4 h-4 text-amber-500" />
          テスト用QRサンプル
        </button>
      </div>

      {/* Camera View */}
      {activeTab === 'camera' && (
        <div className="relative rounded-xl overflow-hidden bg-slate-900 min-h-[260px] flex flex-col items-center justify-center text-white p-4">
          {cameraError ? (
            <div className="text-center space-y-3 p-4">
              <AlertCircle className="w-10 h-10 text-amber-400 mx-auto" />
              <p className="text-sm text-slate-300">{cameraError}</p>
              <button
                type="button"
                onClick={startCamera}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold"
              >
                カメラを再起動
              </button>
            </div>
          ) : (
            <>
              <video
                ref={videoRef}
                playsInline
                className="w-full max-h-[300px] object-cover rounded-lg"
              />
              <canvas ref={canvasRef} className="hidden" />
              {isScanning && (
                <div className="absolute inset-0 border-2 border-indigo-400/60 rounded-xl pointer-events-none flex items-center justify-center">
                  <div className="w-48 h-48 border-2 border-dashed border-indigo-300 rounded-2xl animate-pulse flex items-center justify-center">
                    <p className="text-xs bg-slate-900/80 px-2 py-1 rounded text-slate-200">
                      QRコードにかざしてください
                    </p>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* File Upload View */}
      {activeTab === 'file' && (
        <div className="border-2 border-dashed border-slate-300 rounded-xl p-6 text-center hover:bg-slate-50 transition">
          <input
            type="file"
            accept="image/*"
            id="qr-file-input"
            onChange={handleFileUpload}
            className="hidden"
          />
          <label htmlFor="qr-file-input" className="cursor-pointer space-y-2 block">
            <QrCode className="w-10 h-10 text-indigo-600 mx-auto" />
            <div className="text-sm font-semibold text-slate-700">
              QRコードが含まれる写真を選択
            </div>
            <p className="text-xs text-slate-500">PNG, JPG, WEBP に対応</p>
          </label>
        </div>
      )}

      {/* Sample Quick Testing View */}
      {activeTab === 'sample' && (
        <div className="space-y-3">
          <p className="text-xs text-slate-600">
            カメラや現物がない環境でも、ワンタップでQR観測の動作テストを行えます:
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {SAMPLE_QRS.map((sample, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => {
                  setScanResult(sample.content);
                  onCapture({
                    rawContent: sample.content,
                    title: sample.title,
                    summary: sample.summary,
                    tags: sample.tags,
                  });
                }}
                className="p-3 border border-slate-200 rounded-xl bg-slate-50 hover:bg-indigo-50 hover:border-indigo-300 text-left transition group"
              >
                <div className="text-xs font-bold text-slate-800 group-hover:text-indigo-700 flex items-center gap-1">
                  <QrCode className="w-3.5 h-3.5" />
                  {sample.label}
                </div>
                <div className="text-[11px] text-slate-500 mt-1 line-clamp-2">
                  {sample.summary}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Result Indicator */}
      {scanResult && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-3">
          <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          <div className="space-y-1 text-xs">
            <div className="font-semibold text-emerald-900">QRコード読み取り完了</div>
            <div className="text-emerald-800 font-mono break-all">{scanResult}</div>
          </div>
        </div>
      )}
    </div>
  );
};
