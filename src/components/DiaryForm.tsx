import React, { Suspense, lazy, useEffect, useState, type CSSProperties } from 'react';
import type { DiaryEntry, MoodType, WeatherType, LocationInfo } from '../types/index.ts';
import { ModalHeader } from './ModalHeader';
import { ModalShell } from './ModalShell';
import { useThemeContext } from './ThemeProvider';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import { useIsMobile } from '../hooks/useIsMobile';
import type { ThemeConfig } from '../hooks/useTheme';
import {
  MAX_ENTRY_CONTENT_LENGTH,
  MAX_ENTRY_MOOD_LENGTH,
  MAX_ENTRY_TAG_LENGTH,
  MAX_ENTRY_TAGS_COUNT,
  MAX_ENTRY_TITLE_LENGTH,
  MAX_ENTRY_WEATHER_LENGTH,
  sanitizeEntryContentType,
} from '../utils/entryTextValidation.ts';
import { getRenderableEntryImages } from './entry/entryImages';

const MarkdownEditor = lazy(() =>
  import('./MarkdownEditor').then((module) => ({ default: module.MarkdownEditor }))
);
const ImageUpload = lazy(() =>
  import('./ImageUpload').then((module) => ({ default: module.ImageUpload }))
);
const LocationPicker = lazy(() =>
  import('./LocationPicker').then((module) => ({ default: module.LocationPicker }))
);

interface DiaryFormProps {
  entry?: DiaryEntry;
  onSave: (entry: Omit<DiaryEntry, 'id' | 'created_at' | 'updated_at'>) => Promise<void>;
  onCancel: () => void;
  isOpen: boolean;
}

type DiaryFormOption<T extends string> = {
  value: T;
  label: string;
  emoji?: string;
};

type DiaryFormSelectWithCustomFieldProps = {
  label: string;
  value: string;
  options: DiaryFormOption<string>[];
  customOptionLabel: string;
  showCustom: boolean;
  customValue: string;
  customPlaceholder: string;
  customMaxLength?: number;
  onSelectChange: (value: string) => void;
  onCustomChange: (value: string) => void;
  theme: ThemeConfig;
  isMobile: boolean;
};

const moods: DiaryFormOption<MoodType>[] = [
  { value: 'happy', label: '开心', emoji: '😊' },
  { value: 'sad', label: '难过', emoji: '😢' },
  { value: 'neutral', label: '平静', emoji: '😐' },
  { value: 'excited', label: '兴奋', emoji: '🤩' },
  { value: 'anxious', label: '焦虑', emoji: '😰' },
  { value: 'peaceful', label: '平和', emoji: '😌' },
  { value: 'calm', label: '冷静', emoji: '😌' },
  { value: 'angry', label: '愤怒', emoji: '😠' },
  { value: 'grateful', label: '感恩', emoji: '🙏' },
  { value: 'loved', label: '被爱', emoji: '🥰' },
];

const weathers: DiaryFormOption<WeatherType>[] = [
  { value: 'sunny', label: '晴天' },
  { value: 'cloudy', label: '多云' },
  { value: 'rainy', label: '雨天' },
  { value: 'snowy', label: '雪天' },
  { value: 'unknown', label: '未知' },
];

type DiaryFormSnapshot = {
  title: string;
  content: string;
  contentType: 'markdown' | 'plain';
  mood: string;
  weather: string;
  customMood: string;
  customWeather: string;
  images: string[];
  location: LocationInfo | null;
  tags: string[];
};

function createEmptySnapshot(): DiaryFormSnapshot {
  return {
    title: '',
    content: '',
    contentType: 'markdown',
    mood: 'neutral',
    weather: 'unknown',
    customMood: '',
    customWeather: '',
    images: [],
    location: null,
    tags: [],
  };
}

function sanitizeFormTags(value: string[]): string[] {
  const nextTags: string[] = [];

  for (const item of value) {
    const tag = item.trim();
    if (!tag || tag.length > MAX_ENTRY_TAG_LENGTH || nextTags.includes(tag)) {
      continue;
    }

    if (nextTags.length >= MAX_ENTRY_TAGS_COUNT) {
      break;
    }

    nextTags.push(tag);
  }

  return nextTags;
}

function clampText(value: string, maxLength: number): string {
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}

function resolveSubmittedText(value: string, fallbackValue: string, maxLength: number): string {
  return clampText(value.trim() || fallbackValue, maxLength);
}

function getFormControlStyle(theme: ThemeConfig): CSSProperties {
  return {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    color: theme.colors.text,
    '--tw-ring-color': theme.colors.primary,
  } as CSSProperties;
}

function getSecondaryButtonStyle(theme: ThemeConfig): CSSProperties {
  return {
    color: theme.colors.textSecondary,
    border: `1px solid ${theme.colors.border}`,
    backgroundColor: theme.colors.surface,
  };
}

function shouldShowAdvancedOptions(snapshot: DiaryFormSnapshot) {
  return (
    snapshot.images.length > 0 ||
    snapshot.tags.length > 0 ||
    Boolean(snapshot.location) ||
    snapshot.mood === 'custom' ||
    snapshot.weather === 'custom'
  );
}

function isPresetOption(options: DiaryFormOption<string>[], value: string) {
  return options.some((option) => option.value === value);
}

function resolveSelectableField(options: DiaryFormOption<string>[], value: string, fallbackValue: string, maxLength: number) {
  const normalizedValue = clampText(value || fallbackValue, maxLength);

  if (isPresetOption(options, normalizedValue)) {
    return {
      value: normalizedValue,
      customValue: '',
    };
  }

  return {
    value: 'custom',
    customValue: normalizedValue,
  };
}

function createSnapshotFromEntry(entry: DiaryEntry): DiaryFormSnapshot {
  const moodState = resolveSelectableField(moods, entry.mood || 'neutral', 'neutral', MAX_ENTRY_MOOD_LENGTH);
  const weatherState = resolveSelectableField(weathers, entry.weather || 'unknown', 'unknown', MAX_ENTRY_WEATHER_LENGTH);

  return {
    title: clampText(entry.title || '', MAX_ENTRY_TITLE_LENGTH),
    content: clampText(entry.content || '', MAX_ENTRY_CONTENT_LENGTH),
    contentType: sanitizeEntryContentType(entry.content_type),
    mood: moodState.value,
    weather: weatherState.value,
    customMood: moodState.customValue,
    customWeather: weatherState.customValue,
    images: getRenderableEntryImages(entry.images),
    location: entry.location || null,
    tags: sanitizeFormTags(entry.tags || []),
  };
}

function resolveSubmittedValue(value: string, customValue: string, maxLength: number) {
  return clampText(value === 'custom' ? customValue.trim() : value, maxLength);
}

function DiaryFormSelectWithCustomField({
  label,
  value,
  options,
  customOptionLabel,
  showCustom,
  customValue,
  customPlaceholder,
  customMaxLength,
  onSelectChange,
  onCustomChange,
  theme,
  isMobile,
}: DiaryFormSelectWithCustomFieldProps) {
  const controlStyle = getFormControlStyle(theme);

  return (
    <div>
      <label
        className={`block ${isMobile ? 'text-xs' : 'text-sm'} font-medium mb-2`}
        style={{ color: theme.colors.text }}
      >
        {label}
      </label>
      <div className="space-y-2">
        <select
          value={value}
          onChange={(event) => onSelectChange(event.target.value)}
          className="w-full border rounded-md px-3 py-2 focus:outline-none focus:ring-2 transition-all duration-200"
          style={controlStyle}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.emoji ? `${option.emoji} ` : ''}
              {option.label}
            </option>
          ))}
          <option value="custom">{customOptionLabel}</option>
        </select>

        {showCustom && (
          <input
            type="text"
            value={customValue}
            maxLength={customMaxLength}
            autoComplete="off"
            onChange={(event) => onCustomChange(event.target.value)}
            placeholder={customPlaceholder}
            className="w-full border rounded-md px-3 py-2 focus:outline-none focus:ring-2 transition-all duration-200"
            style={controlStyle}
          />
        )}
      </div>
    </div>
  );
}

export function DiaryForm({ entry, onSave, onCancel, isOpen }: DiaryFormProps) {
  const { theme } = useThemeContext();
  const titleInputRef = React.useRef<HTMLInputElement>(null);
  const formRef = React.useRef<HTMLFormElement>(null);
  const focusContentTimeoutRef = React.useRef<number | null>(null);
  const focusContentFrameRef = React.useRef<number | null>(null);
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
  const isMobile = useIsMobile();
  const [showAdvanced, setShowAdvanced] = useState(false);
  const controlStyle = getFormControlStyle(theme);
  const secondaryButtonStyle = getSecondaryButtonStyle(theme);

  const applySnapshot = (snapshot: DiaryFormSnapshot) => {
    setTitle(snapshot.title);
    setContent(snapshot.content);
    setContentType(snapshot.contentType);
    setMood(snapshot.mood);
    setWeather(snapshot.weather);
    setCustomMood(snapshot.customMood);
    setCustomWeather(snapshot.customWeather);
    setShowCustomMood(snapshot.mood === 'custom');
    setShowCustomWeather(snapshot.weather === 'custom');
    setImages(snapshot.images);
    setLocation(snapshot.location);
    setTags(snapshot.tags);
    setShowAdvanced(shouldShowAdvancedOptions(snapshot));
  };

  // 根据当前条目重置表单状态
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const nextFormSnapshot = entry ? createSnapshotFromEntry(entry) : createEmptySnapshot();
    applySnapshot(nextFormSnapshot);

    setTagInput('');
  }, [entry, isOpen]);

  useBodyScrollLock(isOpen);

  const clearPendingContentFocus = React.useCallback(() => {
    if (focusContentTimeoutRef.current !== null) {
      window.clearTimeout(focusContentTimeoutRef.current);
      focusContentTimeoutRef.current = null;
    }

    if (focusContentFrameRef.current !== null) {
      window.cancelAnimationFrame(focusContentFrameRef.current);
      focusContentFrameRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!isOpen) {
      clearPendingContentFocus();
    }
  }, [clearPendingContentFocus, isOpen]);

  useEffect(() => () => {
    clearPendingContentFocus();
  }, [clearPendingContentFocus]);

  const handleClose = () => {
    if (loading) {
      return;
    }

    onCancel();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;

    setLoading(true);
    try {
      await onSave({
        title: resolveSubmittedText(title, '无标题', MAX_ENTRY_TITLE_LENGTH),
        content: resolveSubmittedText(content, '', MAX_ENTRY_CONTENT_LENGTH),
        content_type: contentType,
        mood: resolveSubmittedValue(mood, customMood, MAX_ENTRY_MOOD_LENGTH),
        weather: resolveSubmittedValue(weather, customWeather, MAX_ENTRY_WEATHER_LENGTH),
        images: getRenderableEntryImages(images),
        location,
        tags: sanitizeFormTags(tags),
      });
    } finally {
      setLoading(false);
    }
  };

  const addTag = () => {
    const tag = tagInput.trim();
    if (tag && tag.length <= MAX_ENTRY_TAG_LENGTH && tags.length < MAX_ENTRY_TAGS_COUNT && !tags.includes(tag)) {
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
    const isCustomValue = value === 'custom';
    setShowCustomMood(isCustomValue);
    if (!isCustomValue) {
      setCustomMood('');
    }
  };

  const handleWeatherChange = (value: string) => {
    setWeather(value);
    const isCustomValue = value === 'custom';
    setShowCustomWeather(isCustomValue);
    if (!isCustomValue) {
      setCustomWeather('');
    }
  };

  const focusContentInput = () => {
    clearPendingContentFocus();

    const tryFocus = (attempt = 0) => {
      const contentInput = formRef.current?.querySelector<HTMLTextAreaElement>('textarea[data-diary-content-input="true"]');

      if (contentInput) {
        contentInput.focus();
        const cursorPosition = contentInput.value.length;
        contentInput.setSelectionRange(cursorPosition, cursorPosition);
        focusContentTimeoutRef.current = null;
        return;
      }

      if (attempt < 4) {
        focusContentTimeoutRef.current = window.setTimeout(() => tryFocus(attempt + 1), 60);
      }
    };

    focusContentFrameRef.current = window.requestAnimationFrame(() => {
      focusContentFrameRef.current = null;
      tryFocus();
    });
  };



  if (!isOpen) return null;

  const sectionFallback = (
    <div
      className="rounded-lg border px-4 py-3 text-sm"
      style={{
        backgroundColor: theme.colors.surface,
        borderColor: theme.colors.border,
        color: theme.colors.textSecondary,
      }}
    >
      正在加载编辑模块...
    </div>
  );

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={handleClose}
      ariaLabelledby="diary-form-title"
      initialFocusRef={titleInputRef}
      zIndex={50}
      padding={isMobile ? '8px' : '16px'}
      backdropStyle={{
        backgroundColor: 'rgba(0, 0, 0, 0.45)',
        overflow: 'hidden',
        overscrollBehavior: 'contain'
      }}
      panelClassName={`${isMobile ? 'max-w-full rounded-[1.4rem]' : 'max-w-4xl rounded-xl'} w-full overflow-hidden shadow-2xl`}
      panelStyle={{
        backgroundColor: theme.colors.background,
        overscrollBehavior: 'contain',
        WebkitOverflowScrolling: 'touch',
        display: 'flex',
        flexDirection: 'column',
        height: isMobile ? 'calc(var(--app-height, 100vh) - 16px)' : 'auto',
        maxHeight: isMobile ? 'calc(var(--app-height, 100vh) - 16px)' : '90vh',
      } as CSSProperties}
    >
      <ModalHeader
        titleId="diary-form-title"
        title={entry ? '编辑日记' : '写新日记'}
        onClose={handleClose}
        padded={isMobile ? 'sm' : 'lg'}
      />

      <form
        ref={formRef}
        onSubmit={handleSubmit}
        className={`${isMobile ? 'space-y-3 p-3 pb-5' : 'space-y-6 p-6'} flex-1 overflow-y-auto`}
        style={{ scrollPaddingBottom: isMobile ? '7rem' : undefined }}
      >
          {/* Title - Optional */}
          <div>
            <label
              className={`block ${isMobile ? 'text-xs' : 'text-sm'} font-medium mb-2`}
              style={{ color: theme.colors.text }}
            >
              标题 <span className="text-xs opacity-60">(可选)</span>
            </label>
            <input
              ref={titleInputRef}
              type="text"
              value={title}
              maxLength={MAX_ENTRY_TITLE_LENGTH}
              autoComplete="off"
              enterKeyHint="next"
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(event) => {
                if (event.key !== 'Enter') {
                  return;
                }

                event.preventDefault();
                focusContentInput();
              }}
              className={`w-full ${isMobile ? 'px-3 py-2' : 'px-4 py-3'} rounded-lg border focus:outline-none focus:ring-2 transition-all duration-200`}
              style={controlStyle}
              placeholder="为这篇日记起个标题吧..."
            />
          </div>

          {/* Content Type Toggle */}
          <div>
            <label
              className={`block ${isMobile ? 'text-xs' : 'text-sm'} font-medium mb-2`}
              style={{ color: theme.colors.text }}
            >
              内容格式
            </label>
            <div className={`grid gap-2 ${isMobile ? 'grid-cols-2' : 'grid-cols-[auto_auto]'}`}>
              <button
                type="button"
                onClick={() => setContentType('markdown')}
                className={`${isMobile ? 'px-3 py-2 text-xs' : 'px-4 py-2 text-sm'} rounded-lg transition-all duration-200 ${
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
                className={`${isMobile ? 'px-3 py-2 text-xs' : 'px-4 py-2 text-sm'} rounded-lg transition-all duration-200 ${
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

          {/* Content */}
          <div className="flex-1">
            <label
              className={`block ${isMobile ? 'text-xs' : 'text-sm'} font-medium mb-2`}
              style={{ color: theme.colors.text }}
            >
              内容
            </label>
            {contentType === 'markdown' ? (
              <Suspense fallback={sectionFallback}>
                <MarkdownEditor
                  key={`markdown-editor-${entry?.id || 'new'}`}
                  value={content}
                  maxLength={MAX_ENTRY_CONTENT_LENGTH}
                  onChange={setContent}
                  placeholder={isMobile ? '使用 Markdown 记录想法...' : '使用 Markdown 语法记录你的想法和感受...'}
                />
              </Suspense>
            ) : (
              <textarea
                data-diary-content-input="true"
                value={content}
                maxLength={MAX_ENTRY_CONTENT_LENGTH}
                onChange={(e) => setContent(e.target.value)}
                enterKeyHint={isMobile ? 'done' : undefined}
                rows={isMobile ? 16 : 12}
                className={`w-full ${isMobile ? 'px-3 py-2' : 'px-4 py-3'} rounded-lg border resize-none focus:outline-none focus:ring-2 transition-all duration-200`}
                style={{
                  ...controlStyle,
                  minHeight: isMobile ? '300px' : 'auto',
                }}
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
                  ...secondaryButtonStyle,
                  color: theme.colors.primary,
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
                <Suspense fallback={sectionFallback}>
                  <ImageUpload
                    images={images}
                    onImagesChange={setImages}
                    maxImages={5}
                  />
                </Suspense>
              </div>

              {/* Mood and Weather */}
              <div className={`grid grid-cols-1 ${isMobile ? 'gap-3' : 'md:grid-cols-2 gap-4'}`}>
                <DiaryFormSelectWithCustomField
                  label="心情"
                  value={mood}
                  options={moods}
                  customOptionLabel="✨ 自定义心情"
                  showCustom={showCustomMood}
                  customValue={customMood}
                  customPlaceholder="输入自定义心情..."
                  customMaxLength={MAX_ENTRY_MOOD_LENGTH}
                  onSelectChange={handleMoodChange}
                  onCustomChange={setCustomMood}
                  theme={theme}
                  isMobile={isMobile}
                />

                <DiaryFormSelectWithCustomField
                  label="天气"
                  value={weather}
                  options={weathers}
                  customOptionLabel="🌈 自定义天气"
                  showCustom={showCustomWeather}
                  customValue={customWeather}
                  customPlaceholder="输入自定义天气..."
                  customMaxLength={MAX_ENTRY_WEATHER_LENGTH}
                  onSelectChange={handleWeatherChange}
                  onCustomChange={setCustomWeather}
                  theme={theme}
                  isMobile={isMobile}
                />
              </div>

              {/* Tags */}
              <div>
                <label
                  className={`block ${isMobile ? 'text-xs' : 'text-sm'} font-medium mb-2`}
                  style={{ color: theme.colors.text }}
                >
                  标签
                </label>
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={tagInput}
                    maxLength={MAX_ENTRY_TAG_LENGTH}
                    autoComplete="off"
                    enterKeyHint="done"
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={handleTagKeyDown}
                    className={`flex-1 ${isMobile ? 'px-3 py-2' : 'px-3 py-2'} border rounded-md focus:outline-none focus:ring-2 transition-all duration-200`}
                    style={controlStyle}
                    placeholder="添加标签..."
                  />
                  <button
                    type="button"
                    onClick={addTag}
                    disabled={tags.length >= MAX_ENTRY_TAGS_COUNT}
                    className={`${isMobile ? 'px-3 py-2' : 'px-4 py-2'} rounded-md transition-colors`}
                    style={{
                      backgroundColor: theme.colors.primary,
                      color: 'white',
                      opacity: tags.length >= MAX_ENTRY_TAGS_COUNT ? 0.6 : 1,
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
          <Suspense fallback={sectionFallback}>
            <LocationPicker
              location={location}
              onLocationChange={setLocation}
              disabled={loading}
            />
          </Suspense>

          {/* Actions */}
          <div
            className={`flex ${isMobile ? 'sticky bottom-0 -mx-3 flex-wrap gap-2 px-3 pb-[calc(0.75rem+var(--safe-area-bottom,0px))] pt-3' : 'justify-end gap-3 pt-4'}`}
            style={{
              borderTop: `1px solid ${theme.colors.border}`,
              backgroundColor: isMobile ? theme.colors.background : 'transparent',
            }}
          >
            <button
              type="button"
              onClick={handleClose}
              className={`${isMobile ? 'min-w-0 flex-1 py-3' : 'px-4 py-2'} rounded-md transition-colors`}
              style={secondaryButtonStyle}
            >
              取消
            </button>
            <button
              type="submit"
              disabled={loading || !content.trim()}
              className={`${isMobile ? 'min-w-0 flex-[1.2] py-3' : 'px-6 py-3'} rounded-xl font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 flex items-center justify-center gap-2 ${!isMobile ? 'hover:scale-105' : ''}`}
              style={{
                backgroundColor: theme.colors.primary,
                color: 'white'
              }}
            >
              {loading ? '保存中...' : '保存日记'}
            </button>
          </div>
      </form>
    </ModalShell>
  );
}
