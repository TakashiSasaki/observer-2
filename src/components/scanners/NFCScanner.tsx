import React, { useState, useEffect } from 'react';
import { Wifi, Sparkles, CheckCircle, Smartphone, Info } from 'lucide-react';

interface NFCScannerProps {
  onCapture: (data: {
    rawContent: string;
    title: string;
    summary: string;
    tags: string[];
    metadata?: Record<string, any>;
  }) => void;
}

const SAMPLE_NFC_TAGS = [
  {
    name: 'Smart IoT 気象観測ノード #04',
    serial: '04:80:A2:3F:89:12',
    tech: 'NFC Forum Type 2 (NTAG215)',
    content: 'https://lab.observation.net/nodes/04?temp=24.5C&humidity=62%',
    title: 'スマートIoT気象センサータグ #04',
    summary: '環境計測ノード#04（気温24.5℃, 湿度62%）のNFCタッチ観測',
    tags: ['NFC', 'IoTセンサー', '環境計測'],
  },
  {
    name: '機器管理アセット ID: EQ-2026-99',
    serial: '04:1B:5C:E2:00:88',
    tech: 'NFC Forum Type 4 (Mifare DESFire)',
    content: 'ASSET_ID:EQ-2026-99;LOC:BLDG-B-3F;MAINT:2026-07-20',
    title: 'ラボ設備管理タグ [EQ-2026-99]',
    summary: '研究棟B 3階設置の広域観測顕微鏡のメンテナンスタグ',
    tags: ['NFC', '設備管理', 'アセット'],
  },
  {
    name: 'スマートポスター / 展示ガイド',
    serial: '04:FE:11:33:44:00',
    tech: 'NFC Forum Type 2',
    content: 'https://museum.example.jp/exhibit/artifact_302',
    title: '展示物NFCガイドタグ #302',
    summary: '『古代地層標本302号』の音声解説＆高解像度データリンク',
    tags: ['NFC', '展示ガイド', 'スマートポスター'],
  },
];

export const NFCScanner: React.FC<NFCScannerProps> = ({ onCapture }) => {
  const [hasNFCSupport, setHasNFCSupport] = useState<boolean>(false);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [nfcStatus, setNfcStatus] = useState<string>('NFC読み取り準備完了');
  const [lastScanned, setLastScanned] = useState<string | null>(null);

  useEffect(() => {
    if ('NDEFReader' in window) {
      setHasNFCSupport(true);
    }
  }, []);

  // Web NFC Scan
  const startNFCScan = async () => {
    if (!('NDEFReader' in window)) {
      alert('お使いのブラウザまたは端末はWeb NFCに未対応です。下のタッチシミュレーターをお試しください。');
      return;
    }

    try {
      setIsScanning(true);
      setNfcStatus('スマートフォンをNFCタグにかざしてください...');
      // @ts-ignore
      const ndef = new NDEFReader();
      await ndef.scan();

      // @ts-ignore
      ndef.addEventListener('reading', ({ message, serialNumber }: any) => {
        let recordContent = '';
        for (const record of message.records) {
          if (record.recordType === 'text') {
            const textDecoder = new TextDecoder(record.encoding);
            recordContent += textDecoder.decode(record.data);
          } else if (record.recordType === 'url') {
            const textDecoder = new TextDecoder();
            recordContent += textDecoder.decode(record.data);
          }
        }

        const raw = recordContent || `NFC Tag (Serial: ${serialNumber || 'Unknown'})`;
        setLastScanned(raw);
        setNfcStatus('NFCの読み取りに成功しました！');
        setIsScanning(false);

        onCapture({
          rawContent: raw,
          title: `NFCタグ観測 (シリアル: ${serialNumber || '不明'})`,
          summary: `NFCタグから読み取ったデータ: ${raw}`,
          tags: ['NFC', 'WebNFC'],
          metadata: {
            serialNumber,
            tech: 'Web NFC Direct',
          },
        });
      });
    } catch (err: any) {
      console.warn('NFC Scan error:', err);
      setNfcStatus(`NFCエラー: ${err.message || '許可が得られませんでした'}`);
      setIsScanning(false);
    }
  };

  const triggerSampleNFC = (sample: (typeof SAMPLE_NFC_TAGS)[0]) => {
    setLastScanned(sample.content);
    onCapture({
      rawContent: sample.content,
      title: sample.title,
      summary: sample.summary,
      tags: sample.tags,
      metadata: {
        serialNumber: sample.serial,
        nfcTech: sample.tech,
      },
    });
  };

  return (
    <div className="space-y-4">
      {/* Web NFC Hardware Status Banner */}
      <div className="p-4 rounded-xl bg-gradient-to-r from-indigo-900 to-slate-900 text-white flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-indigo-600/40 rounded-lg">
            <Wifi className="w-6 h-6 text-indigo-300 animate-pulse" />
          </div>
          <div>
            <div className="text-xs font-semibold text-indigo-200">
              Web NFC 観測モード
            </div>
            <div className="text-sm font-bold">
              {hasNFCSupport ? '実機NFC対応デバイス' : 'NFCシミュレーター稼働中'}
            </div>
            <p className="text-[11px] text-slate-300">{nfcStatus}</p>
          </div>
        </div>

        {hasNFCSupport && (
          <button
            type="button"
            onClick={startNFCScan}
            disabled={isScanning}
            className="px-4 py-2 bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition shrink-0"
          >
            {isScanning ? 'かざすのを待機中...' : 'NFCスキャン開始'}
          </button>
        )}
      </div>

      {!hasNFCSupport && (
        <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-xl flex items-start gap-2.5 text-xs text-indigo-900">
          <Info className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
          <div>
            PC環境や非NFC端末でもNFC観測の動作を完全に体験できるよう、下の**タッチシミュレーター**で様々なNFCタグ（IoTセンサー、設備タグ、ポスター）をタッチ観測できます。
          </div>
        </div>
      )}

      {/* Interactive Touch Simulator Cards */}
      <div className="space-y-2">
        <div className="text-xs font-bold text-slate-700 flex items-center gap-1.5 uppercase tracking-wider">
          <Sparkles className="w-4 h-4 text-amber-500" />
          NFCタグ・タッチ観測シミュレーター
        </div>

        <div className="grid grid-cols-1 gap-2">
          {SAMPLE_NFC_TAGS.map((tag, idx) => (
            <div
              key={idx}
              onClick={() => triggerSampleNFC(tag)}
              className="p-3 border border-slate-200 rounded-lg bg-white hover:bg-blue-50/70 hover:border-blue-300 transition cursor-pointer flex items-center justify-between group"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-slate-100 group-hover:bg-blue-100 flex items-center justify-center text-slate-600 group-hover:text-blue-600 font-bold transition">
                  <Smartphone className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-800 group-hover:text-blue-900">
                    {tag.name}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5 font-mono">
                    UID: {tag.serial} • {tag.tech}
                  </div>
                  <div className="text-[11px] text-slate-600 line-clamp-1 mt-0.5">
                    {tag.summary}
                  </div>
                </div>
              </div>

              <span className="px-3 py-1 bg-blue-600 group-hover:bg-blue-700 text-white rounded text-xs font-bold shrink-0 transition">
                タッチ観測
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Last Scanned Result */}
      {lastScanned && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-2.5">
          <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          <div className="text-xs space-y-1">
            <div className="font-semibold text-emerald-900">NFC観測完了</div>
            <div className="text-emerald-800 font-mono break-all">{lastScanned}</div>
          </div>
        </div>
      )}
    </div>
  );
};
