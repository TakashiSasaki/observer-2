import React, { useState, useEffect } from 'react';
import {
  FREE_VISION_MODELS,
  getStoredAIModel,
  setStoredAIModel,
  AIModelOption,
} from '../constants/aiModels';
import { Cpu, Sparkles, Check, Info } from 'lucide-react';

interface AIModelSelectorProps {
  selectedModel?: string;
  onModelChange?: (modelId: string) => void;
  compact?: boolean;
}

export const AIModelSelector: React.FC<AIModelSelectorProps> = ({
  selectedModel: externalSelectedModel,
  onModelChange,
  compact = false,
}) => {
  const [currentModelId, setCurrentModelId] = useState<string>(
    externalSelectedModel || getStoredAIModel()
  );
  const [showInfo, setShowInfo] = useState<boolean>(false);

  useEffect(() => {
    if (externalSelectedModel) {
      setCurrentModelId(externalSelectedModel);
    }
  }, [externalSelectedModel]);

  const handleSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newId = e.target.value;
    setCurrentModelId(newId);
    setStoredAIModel(newId);
    if (onModelChange) {
      onModelChange(newId);
    }
  };

  const selectedModelObj =
    FREE_VISION_MODELS.find((m) => m.id === currentModelId) || FREE_VISION_MODELS[0];

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 shrink-0">
          <Cpu className="w-3.5 h-3.5 text-indigo-600" />
          <span>AIモデル:</span>
        </div>
        <select
          value={currentModelId}
          onChange={handleSelect}
          className="px-2.5 py-1 text-xs font-mono font-medium bg-white border border-slate-200 rounded-lg shadow-2xs focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-slate-800"
        >
          {FREE_VISION_MODELS.map((model) => (
            <option key={model.id} value={model.id}>
              {model.name} {model.badge ? `(${model.badge})` : ''}
            </option>
          ))}
        </select>
      </div>
    );
  }

  return (
    <div className="p-3.5 bg-gradient-to-r from-slate-50 to-indigo-50/30 border border-slate-200 rounded-xl space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-indigo-100 text-indigo-700 rounded-lg shrink-0">
            <Cpu className="w-4 h-4" />
          </div>
          <div>
            <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
              <span>画像解析AIモデル切り替え</span>
              <span className="px-1.5 py-0.2 bg-emerald-100 text-emerald-800 rounded text-[10px] font-semibold">
                無料枠 / Vision対応
              </span>
            </div>
            <p className="text-[11px] text-slate-500">
              観測データの解析・OCRに使用する言語モデルを選択できます
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowInfo(!showInfo)}
          className="text-slate-400 hover:text-indigo-600 p-1 transition"
          title="モデルの比較説明を表示"
        >
          <Info className="w-4 h-4" />
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
        <div className="relative flex-1">
          <select
            value={currentModelId}
            onChange={handleSelect}
            className="w-full pl-3 pr-8 py-2 bg-white border border-slate-300 rounded-lg text-xs font-mono font-bold text-slate-800 shadow-2xs focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 cursor-pointer"
          >
            {FREE_VISION_MODELS.map((model) => (
              <option key={model.id} value={model.id}>
                {model.name} [{model.category}] {model.badge ? `★${model.badge}` : ''}
              </option>
            ))}
          </select>
        </div>

        {selectedModelObj && (
          <div className="flex items-center gap-1.5 text-[11px] text-slate-600 bg-white/80 border border-slate-200 px-2.5 py-1.5 rounded-lg shrink-0">
            <Sparkles className="w-3 h-3 text-amber-500 shrink-0" />
            <span className="truncate max-w-[280px] font-medium">{selectedModelObj.description}</span>
          </div>
        )}
      </div>

      {showInfo && (
        <div className="p-3 bg-white border border-slate-200 rounded-lg text-xs space-y-2 mt-2">
          <div className="font-bold text-slate-800 text-[11px]">選択可能モデル一覧（全10モデル）:</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-48 overflow-y-auto text-[11px]">
            {FREE_VISION_MODELS.map((model) => (
              <div
                key={model.id}
                onClick={() => {
                  setCurrentModelId(model.id);
                  setStoredAIModel(model.id);
                  if (onModelChange) onModelChange(model.id);
                }}
                className={`p-2 rounded border cursor-pointer transition flex items-start justify-between gap-1 ${
                  model.id === currentModelId
                    ? 'bg-indigo-50 border-indigo-300 text-indigo-900 font-medium'
                    : 'bg-slate-50 border-slate-100 hover:bg-slate-100 text-slate-700'
                }`}
              >
                <div>
                  <div className="font-bold font-mono text-[11px] flex items-center gap-1">
                    {model.name}
                    {model.badge && (
                      <span className="px-1 py-0.1 bg-amber-100 text-amber-800 rounded text-[9px] font-sans">
                        {model.badge}
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] opacity-80">{model.description}</div>
                </div>
                {model.id === currentModelId && (
                  <Check className="w-3.5 h-3.5 text-indigo-600 shrink-0 mt-0.5" />
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
