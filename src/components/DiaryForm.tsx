import React, { useState, useEffect } from 'react';
import { X, Save } from 'lucide-react';
import { DiaryEntry, MoodType, WeatherType, LocationInfo } from '../types';
import { MarkdownEditor } from './MarkdownEditor';
import { ImageUpload } from './ImageUpload';
import { LocationPicker } from './LocationPicker';
import { useThemeContext } from './ThemeProvider';

interface DiaryFormProps {
  entry?: DiaryEntry;
  onSave: (entry: Omit<DiaryEntry, 'id' | 'created_at' | 'updated_at'>) => Promise<void>;
  onCancel: () => void;
  isOpen: boolean;
}

const moods: { value: MoodType; label: string; emoji: string }[] = [
  { value: 'happy', label: '开心', emoji: '😊' },
  { value: 'sad', label: '难过', emoji: '😢' },
  { value: 'neutral', label: '平静', emoji: '😐' },
  { value: 'excited', label: '兴奋', emoji: '🤩' },
  { value: 'anxious', label: '焦虑', emoji: '😰' },
  { value: 'peaceful', label: '宁静', emoji: '😌' },
  { value: 'calm', label: '冷静', emoji: '😌' },
  { value: 'angry', label: '愤怒', emoji: '😠' },
  { value: 'grateful', label: '感恩', emoji: '🙏' },
  { value: 'loved', label: '被爱', emoji: '🥰' },
];

const weathers: { value: WeatherType; label: string }[] = [
  { value: 'sunny', label: '晴天' },
  { value: 'cloudy', label: '多云' },
  { value: 'rainy', label: '雨天' },
  { value: 'snowy', label: '雪天' },
  { value: 'unknown', label: '未知' },
];

export function DiaryForm({ entry, onSave, onCancel, isOpen }: DiaryFormProps) {
  const { theme } = useThemeContext();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [contentType, setContentType] = useState<'markdown' | 'plain'>('markdown');
  const [mood, setMood] = useState<string>('neutral');
  const [weather, setWeather] = useState<string>('unknown');
  const [customMood, setCustomMood] = useState('');
  const [customWeather, setCustomWeather] = useState('');
  const [showCustomMood, setShowCustomMood] = useState(false);
  const [showCustomWeather, setShowCustomWeather] = useState(false);
  const [images, setImages] = useState<string[]>([]);
  const [location, setLocation] = useState<LocationInfo | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  // 检测是否为移动设备
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // 分离初始化逻辑，只在entry变化时执行
  useEffect(() => {
    if (!isOpen) {
      setIsInitialized(false);
      return; // 只在对话框打开时初始化
    }

    // 防止重复初始化
    if (isInitialized && entry?.id === entry?.id) return;

    try {
      if (entry) {
        setTitle(entry.title);
        setContent(entry.content);
        setContentType((entry.content_type as 'markdown' | 'plain') || 'markdown');

        // 处理心情：检查是否为预定义选项
        const entryMood = entry.mood || 'neutral';
        const predefinedMood = moods.find(m => m.value === entryMood);
        if (predefinedMood) {
          setMood(entryMood);
          setShowCustomMood(false);
          setCustomMood('');
        } else {
          setMood('custom');
          setShowCustomMood(true);
          setCustomMood(entryMood);
        }

        // 处理天气：检查是否为预定义选项
        const entryWeather = entry.weather || 'unknown';
        const predefinedWeather = weathers.find(w => w.value === entryWeather);
        if (predefinedWeather) {
          setWeather(entryWeather);
          setShowCustomWeather(false);
          setCustomWeather('');
        } else {
          setWeather('custom');
          setShowCustomWeather(true);
          setCustomWeather(entryWeather);
        }

        setImages(entry.images || []);
        setLocation(entry.location || null);
        setTags(entry.tags || []);
      } else {
        setTitle('');
        setContent('');
        setContentType('markdown');
        setMood('neutral');
        setWeather('unknown');
        setCustomMood('');
        setCustomWeather('');
        setShowCustomMood(false);
        setShowCustomWeather(false);
        setImages([]);
        setLocation(null);
        setTags([]);
      }
      setTagInput('');
      setIsInitialized(true);
    } catch (error) {
      console.error('DiaryForm初始化失败:', error);
    }
  }, [entry?.id, isOpen]); // 只依赖entry的id和isOpen状态

  // 打开弹窗时锁定背景滚动，关闭时恢复
  useEffect(() => {
    if (!isOpen) return;

    const originalHtmlOverflow = document.documentElement.style.overflow;
    const originalBodyOverflow = document.body.style.overflow;
    const originalTouchAction = (document.body.style as any).touchAction;

    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    (document.body.style as any).touchAction = 'none';

    return () => {
      document.documentElement.style.overflow = originalHtmlOverflow;
      document.body.style.overflow = originalBodyOverflow;
      (document.body.style as any).touchAction = originalTouchAction;
    };
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;

    setLoading(true);
    try {
      // 处理最终的心情和天气值
      const finalMood = mood === 'custom' ? customMood.trim() : mood;
      const finalWeather = weather === 'custom' ? customWeather.trim() : weather;

      await onSave({
        title: title.trim() || '无标题',
        content: content.trim(),
        content_type: contentType,
        mood: finalMood,
        weather: finalWeather,
        images,
        location,
        tags,
      });
    } finally {
      setLoading(false);
    }
  };

  const addTag = () => {
    const tag = tagInput.trim();
    if (tag && !tags.includes(tag)) {
      setTags([...tags, tag]);
      setTagInput('');
    }
  };

  const removeTag = (tagToRemove: string) => {
    setTags(tags.filter(tag => tag !== tagToRemove));
  };

  const handleTagKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addTag();
    }
  };

  const handleMoodChange = (value: string) => {
    setMood(value);
    if (value === 'custom') {
      setShowCustomMood(true);
    } else {
      setShowCustomMood(false);
      setCustomMood('');
    }
  };

  const handleWeatherChange = (value: string) => {
    setWeather(value);
    if (value === 'custom') {
      setShowCustomWeather(true);
    } else {
      setShowCustomWeather(false);
      setCustomWeather('');
    }
  };



  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        padding: isMobile ? '8px' : '16px',
        boxSizing: 'border-box',
        overflow: 'hidden',
        overscrollBehavior: 'contain'
      }}
      onClick={(e) => {
        // 点击背景关闭弹窗
        if (e.target === e.currentTarget) {
          onCancel();
        }
      }}
    >
      <div
        className={`${isMobile ? 'rounded-lg' : 'rounded-xl'} shadow-2xl w-full ${isMobile ? 'max-w-full h-full' : 'max-w-4xl max-h-[90vh]'} overflow-y-auto ${theme.effects.blur}`}
        style={{ backgroundColor: theme.colors.background, overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
        onClick={(e) => {
          // 防止点击弹窗内容时关闭弹窗
          e.stopPropagation();
        }}
      >
        <div
          className={`flex justify-between items-center ${isMobile ? 'p-4' : 'p-6'}`}
          style={{ borderBottom: `1px solid ${theme.colors.border}` }}
        >
          <h2
            className={`${isMobile ? 'text-lg' : 'text-2xl'} font-bold`}
            style={{ color: theme.colors.text }}
          >
            {entry ? '✏️ 编辑日记' : '📝 写新日记'}
          </h2>
          <button
            onClick={onCancel}
            className={`${isMobile ? 'p-1.5' : 'p-2'} rounded-full transition-all duration-200 hover:scale-110`}
            style={{
              backgroundColor: theme.colors.surface,
              color: theme.colors.textSecondary
            }}
          >
            <X className={`${isMobile ? 'w-4 h-4' : 'w-5 h-5'}`} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className={`${isMobile ? 'p-4' : 'p-6'} space-y-${isMobile ? '4' : '6'}`}>
          {/* Title - Optional */}
          <div>
            <label
              className={`block ${isMobile ? 'text-xs' : 'text-sm'} font-medium mb-2`}
              style={{ color: theme.colors.text }}
            >
              📝 标题 <span className="text-xs opacity-60">(可选)</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={`w-full ${isMobile ? 'px-3 py-2' : 'px-4 py-3'} rounded-lg border focus:outline-none focus:ring-2 transition-all duration-200`}
              style={{
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border,
                color: theme.colors.text,
                '--tw-ring-color': theme.colors.primary,
              } as React.CSSProperties}
              placeholder="为这篇日记起个标题吧..."
            />
          </div>

          {/* Content Type Toggle - 移动端隐藏 */}
          {!isMobile && (
            <div>
              <label
                className="block text-sm font-medium mb-2"
                style={{ color: theme.colors.text }}
              >
                ✍️ 内容格式
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setContentType('markdown')}
                  className={`px-4 py-2 rounded-lg text-sm transition-all duration-200 ${
                    contentType === 'markdown' ? 'font-medium' : ''
                  }`}
                  style={{
                    backgroundColor: contentType === 'markdown' ? theme.colors.primary : theme.colors.surface,
                    color: contentType === 'markdown' ? 'white' : theme.colors.textSecondary,
                    border: `1px solid ${theme.colors.border}`
                  }}
                >
                  Markdown
                </button>
                <button
                  type="button"
                  onClick={() => setContentType('plain')}
                  className={`px-4 py-2 rounded-lg text-sm transition-all duration-200 ${
                    contentType === 'plain' ? 'font-medium' : ''
                  }`}
                  style={{
                    backgroundColor: contentType === 'plain' ? theme.colors.primary : theme.colors.surface,
                    color: contentType === 'plain' ? 'white' : theme.colors.textSecondary,
                    border: `1px solid ${theme.colors.border}`
                  }}
                >
                  纯文本
                </button>
              </div>
            </div>
          )}

          {/* Content */}
          <div className="flex-1">
            <label
              className={`block ${isMobile ? 'text-xs' : 'text-sm'} font-medium mb-2`}
              style={{ color: theme.colors.text }}
            >
              📄 内容
            </label>
            {contentType === 'markdown' && !isMobile && isInitialized ? (
              <MarkdownEditor
                key={`markdown-editor-${entry?.id || 'new'}`}
                value={content}
                onChange={setContent}
                placeholder="使用 Markdown 语法记录你的想法和感受..."
              />
            ) : (
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={isMobile ? 16 : 12}
                className={`w-full ${isMobile ? 'px-3 py-2' : 'px-4 py-3'} rounded-lg border resize-none focus:outline-none focus:ring-2 transition-all duration-200`}
                style={{
                  backgroundColor: theme.colors.surface,
                  borderColor: theme.colors.border,
                  color: theme.colors.text,
                  '--tw-ring-color': theme.colors.primary,
                  minHeight: isMobile ? '300px' : 'auto'
                } as React.CSSProperties}
                placeholder={isMobile ? "记录你的想法和感受..." : "详细记录你的想法和感受..."}
                required
              />
            )}
          </div>

          {/* 移动端高级选项切换 */}
          {isMobile && (
            <div className="text-center">
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="px-4 py-2 rounded-lg text-sm transition-all duration-200"
                style={{
                  backgroundColor: theme.colors.surface,
                  color: theme.colors.primary,
                  border: `1px solid ${theme.colors.border}`
                }}
              >
                {showAdvanced ? '收起高级选项' : '展开高级选项'} ({showAdvanced ? '▲' : '▼'})
              </button>
            </div>
          )}

          {/* 高级选项区域 */}
          {(showAdvanced || !isMobile) && (
            <>
              {/* Images */}
              <div>
                <label
                  className={`block ${isMobile ? 'text-xs' : 'text-sm'} font-medium mb-2`}
                  style={{ color: theme.colors.text }}
                >
                  🖼️ 图片
                </label>
                <ImageUpload
                  images={images}
                  onImagesChange={setImages}
                  maxImages={5}
                />
              </div>

              {/* Mood and Weather */}
              <div className={`grid grid-cols-1 ${isMobile ? 'gap-3' : 'md:grid-cols-2 gap-4'}`}>
                <div>
                  <label
                    className={`block ${isMobile ? 'text-xs' : 'text-sm'} font-medium mb-2`}
                    style={{ color: theme.colors.text }}
                  >
                    😊 心情
                  </label>
                  <div className="space-y-2">
                    <select
                      value={mood}
                      onChange={(e) => handleMoodChange(e.target.value)}
                      className={`w-full ${isMobile ? 'px-3 py-2' : 'px-3 py-2'} border rounded-md focus:outline-none focus:ring-2 transition-all duration-200`}
                      style={{
                        backgroundColor: theme.colors.surface,
                        borderColor: theme.colors.border,
                        color: theme.colors.text,
                        '--tw-ring-color': theme.colors.primary,
                      } as React.CSSProperties}
                    >
                      {moods.map((m) => (
                        <option key={m.value} value={m.value}>
                          {m.emoji} {m.label}
                        </option>
                      ))}
                      <option value="custom">✨ 自定义心情</option>
                    </select>

                    {showCustomMood && (
                      <input
                        type="text"
                        value={customMood}
                        onChange={(e) => setCustomMood(e.target.value)}
                        placeholder="输入自定义心情..."
                        className={`w-full ${isMobile ? 'px-3 py-2' : 'px-3 py-2'} border rounded-md focus:outline-none focus:ring-2 transition-all duration-200`}
                        style={{
                          backgroundColor: theme.colors.surface,
                          borderColor: theme.colors.border,
                          color: theme.colors.text,
                          '--tw-ring-color': theme.colors.primary,
                        } as React.CSSProperties}
                      />
                    )}
                  </div>
                </div>

                <div>
                  <label
                    className={`block ${isMobile ? 'text-xs' : 'text-sm'} font-medium mb-2`}
                    style={{ color: theme.colors.text }}
                  >
                    🌤️ 天气
                  </label>
                  <div className="space-y-2">
                    <select
                      value={weather}
                      onChange={(e) => handleWeatherChange(e.target.value)}
                      className={`w-full ${isMobile ? 'px-3 py-2' : 'px-3 py-2'} border rounded-md focus:outline-none focus:ring-2 transition-all duration-200`}
                      style={{
                        backgroundColor: theme.colors.surface,
                        borderColor: theme.colors.border,
                        color: theme.colors.text,
                        '--tw-ring-color': theme.colors.primary,
                      } as React.CSSProperties}
                    >
                      {weathers.map((w) => (
                        <option key={w.value} value={w.value}>
                          {w.label}
                        </option>
                      ))}
                      <option value="custom">🌈 自定义天气</option>
                    </select>

                    {showCustomWeather && (
                      <input
                        type="text"
                        value={customWeather}
                        onChange={(e) => setCustomWeather(e.target.value)}
                        placeholder="输入自定义天气..."
                        className={`w-full ${isMobile ? 'px-3 py-2' : 'px-3 py-2'} border rounded-md focus:outline-none focus:ring-2 transition-all duration-200`}
                        style={{
                          backgroundColor: theme.colors.surface,
                          borderColor: theme.colors.border,
                          color: theme.colors.text,
                          '--tw-ring-color': theme.colors.primary,
                        } as React.CSSProperties}
                      />
                    )}
                  </div>
                </div>
              </div>

              {/* Tags */}
              <div>
                <label
                  className={`block ${isMobile ? 'text-xs' : 'text-sm'} font-medium mb-2`}
                  style={{ color: theme.colors.text }}
                >
                  🏷️ 标签
                </label>
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={handleTagKeyDown}
                    className={`flex-1 ${isMobile ? 'px-3 py-2' : 'px-3 py-2'} border rounded-md focus:outline-none focus:ring-2 transition-all duration-200`}
                    style={{
                      backgroundColor: theme.colors.surface,
                      borderColor: theme.colors.border,
                      color: theme.colors.text,
                      '--tw-ring-color': theme.colors.primary,
                    } as React.CSSProperties}
                    placeholder="添加标签..."
                  />
                  <button
                    type="button"
                    onClick={addTag}
                    className={`${isMobile ? 'px-3 py-2' : 'px-4 py-2'} rounded-md transition-colors`}
                    style={{
                      backgroundColor: theme.colors.primary,
                      color: 'white'
                    }}
                  >
                    {isMobile ? '+' : '添加'}
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {tags.map((tag) => (
                    <span
                      key={tag}
                      className={`px-2 py-1 ${isMobile ? 'text-xs' : 'text-sm'} rounded-full flex items-center gap-1`}
                      style={{
                        backgroundColor: `${theme.colors.primary}20`,
                        color: theme.colors.primary,
                        border: `1px solid ${theme.colors.primary}40`
                      }}
                    >
                      #{tag}
                      <button
                        type="button"
                        onClick={() => removeTag(tag)}
                        className="hover:opacity-80 transition-opacity"
                        style={{ color: theme.colors.primary }}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              </div>

            </>
          )}

          {/* Location - 始终显示，不在高级选项中 */}
          <LocationPicker
            location={location}
            onLocationChange={setLocation}
            disabled={loading}
          />

          {/* Actions */}
          <div
            className={`flex ${isMobile ? 'flex-col gap-2' : 'justify-end gap-3'} pt-4`}
            style={{ borderTop: `1px solid ${theme.colors.border}` }}
          >
            <button
              type="button"
              onClick={onCancel}
              className={`${isMobile ? 'w-full py-3' : 'px-4 py-2'} rounded-md transition-colors`}
              style={{
                color: theme.colors.textSecondary,
                border: `1px solid ${theme.colors.border}`,
                backgroundColor: theme.colors.surface
              }}
            >
              取消
            </button>
            <button
              type="submit"
              disabled={loading || !content.trim()}
              className={`${isMobile ? 'w-full py-3' : 'px-6 py-3'} rounded-xl font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 flex items-center justify-center gap-2 ${!isMobile ? 'hover:scale-105' : ''}`}
              style={{
                backgroundColor: theme.colors.primary,
                color: 'white'
              }}
            >
              <Save className={`${isMobile ? 'w-4 h-4' : 'w-5 h-5'}`} />
              {loading ? '保存中...' : '保存日记'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
