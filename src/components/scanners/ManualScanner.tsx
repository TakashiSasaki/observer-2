import React, { useState, useRef } from 'react';
import { Edit3, Camera, Tag, Plus, Trash2 } from 'lucide-react';
import { processImageToWebP } from '../../utils/imageUtils';

interface ManualScannerProps {
  onCapture: (data: {
    rawContent: string;
    title: string;
    summary: string;
    tags: string[];
    imageUrl?: string;
  }) => void;
}

export const ManualScanner: React.FC<ManualScannerProps> = ({ onCapture }) => {
  const [title, setTitle] = useState<string>('');
  const [content, setContent] = useState<string>('');
  const [tagInput, setTagInput] = useState<string>('');
  const [tags, setTags] = useState<string[]>(['フィールドメモ', '直接観測']);
  const [attachedImage, setAttachedImage] = useState<string | null>(null);

  const imageInputRef = useRef<HTMLInputElement | null>(null);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const webpUrl = await processImageToWebP(file, 1024, 768, 0.85);
      setAttachedImage(webpUrl);
    } catch {
      const reader = new FileReader();
      reader.onload = (evt) => {
        setAttachedImage(evt.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAddTag = () => {
    if (tagInput.trim() && !tags.includes(tagInput.trim())) {
      setTags([...tags, tagInput.trim()]);
      setTagInput('');
    }
  };

  const handleRemoveTag = (tToRemove: string) => {
    setTags(tags.filter((t) => t !== tToRemove));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) {
      alert('観測タイトルと観測メモを入力してください。');
      return;
    }

    onCapture({
      rawContent: content,
      title,
      summary: content.length > 80 ? `${content.substring(0, 80)}...` : content,
      tags,
      imageUrl: attachedImage || undefined,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 text-xs">
      {/* Title */}
      <div className="space-y-1">
        <label className="font-bold text-slate-700">観測タイトル <span className="text-rose-500">*</span></label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="例: ラボ前の気象環境、未知の野生植物発見ログなど"
          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 focus:outline-none focus:border-indigo-500"
          required
        />
      </div>

      {/* Observation Detail Notes */}
      <div className="space-y-1">
        <label className="font-bold text-slate-700">観測内容・フィールドノート <span className="text-rose-500">*</span></label>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={4}
          placeholder="具体的な観測数値、状態、特記事項を自由に記録してください..."
          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 focus:outline-none focus:border-indigo-500"
          required
        />
      </div>

      {/* Optional Photo Attachment */}
      <div className="space-y-2">
        <label className="font-bold text-slate-700">現況写真（オプション）</label>
        {attachedImage ? (
          <div className="relative rounded-lg overflow-hidden border border-slate-200 max-h-40 bg-slate-900 flex justify-center">
            <img src={attachedImage} alt="添付写真" className="max-h-40 object-contain" />
            <button
              type="button"
              onClick={() => setAttachedImage(null)}
              className="absolute top-2 right-2 p-1 bg-rose-600 text-white rounded-full hover:bg-rose-700"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => imageInputRef.current?.click()}
            className="w-full py-3 border border-dashed border-slate-300 rounded-lg bg-slate-50 hover:bg-slate-100 flex items-center justify-center gap-2 text-slate-600 transition"
          >
            <Camera className="w-4 h-4 text-indigo-600" />
            写真を添付する
          </button>
        )}
        <input
          type="file"
          ref={imageInputRef}
          accept="image/*"
          onChange={handleImageUpload}
          className="hidden"
        />
      </div>

      {/* Tags Input */}
      <div className="space-y-2">
        <label className="font-bold text-slate-700">観測タグ</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            placeholder="新しいタグを追加"
            className="flex-1 px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-800"
          />
          <button
            type="button"
            onClick={handleAddTag}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-bold flex items-center gap-1"
          >
            <Plus className="w-3.5 h-3.5" />
            追加
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5 pt-1">
          {tags.map((tag) => (
            <span
              key={tag}
              className="px-2 py-0.5 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-md text-[11px] font-medium flex items-center gap-1"
            >
              <Tag className="w-3 h-3" />
              {tag}
              <button
                type="button"
                onClick={() => handleRemoveTag(tag)}
                className="hover:text-rose-600 ml-1 font-bold"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      </div>

      <button
        type="submit"
        className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold flex items-center justify-center gap-2 transition"
      >
        <Edit3 className="w-4 h-4" />
        直接観測ログをフォーム入力で確定
      </button>
    </form>
  );
};
