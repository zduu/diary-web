import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useThemeContext } from './ThemeProvider';
import { LazyMarkdownRenderer } from './LazyMarkdownRenderer';
import { useIsMobile } from '../hooks/useIsMobile';
import { debugError, debugWarn } from '../utils/logger.ts';
import type { ThemeConfig } from '../hooks/useTheme';

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  maxLength?: number;
}

export function MarkdownEditor({ value, onChange, placeholder, maxLength }: MarkdownEditorProps) {
  const { theme } = useThemeContext();
  const isMobile = useIsMobile();
  const [mode, setMode] = useState<'edit' | 'preview' | 'split'>('edit');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isMountedRef = useRef(false);
  const selectionRestoreTimeoutRef = useRef<number | null>(null);
  const [isComponentMounted, setIsComponentMounted] = useState(false);

  const clearPendingSelectionRestore = useCallback(() => {
    if (selectionRestoreTimeoutRef.current !== null) {
      window.clearTimeout(selectionRestoreTimeoutRef.current);
      selectionRestoreTimeoutRef.current = null;
    }
  }, []);

  // 组件挂载状态管理
  useEffect(() => {
    isMountedRef.current = true;
    setIsComponentMounted(true);
    return () => {
      isMountedRef.current = false;
      clearPendingSelectionRestore();
    };
  }, [clearPendingSelectionRestore]);

  useEffect(() => {
    if (isMobile && mode === 'split') {
      setMode('edit');
    }
  }, [isMobile, mode]);

  const insertMarkdown = useCallback((before: string, after: string = '') => {
    if (!isMountedRef.current) return;

    const textarea = textareaRef.current;
    if (!textarea) return;

    try {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const selectedText = value.substring(start, end);
      const newText = value.substring(0, start) + before + selectedText + after + value.substring(end);

      onChange(maxLength === undefined ? newText : newText.slice(0, maxLength));

      // 重新设置光标位置
      clearPendingSelectionRestore();
      selectionRestoreTimeoutRef.current = window.setTimeout(() => {
        selectionRestoreTimeoutRef.current = null;

        if (isMountedRef.current && textareaRef.current === textarea) {
          textarea.focus();
          textarea.setSelectionRange(start + before.length, start + before.length + selectedText.length);
        }
      }, 0);
    } catch (error) {
      debugError('插入Markdown语法失败:', error);
    }
  }, [clearPendingSelectionRestore, maxLength, value, onChange]);

  const handleModeChange = useCallback((e: React.MouseEvent, newMode: 'edit' | 'preview' | 'split') => {
    e.preventDefault();
    e.stopPropagation();

    try {
      // 确保组件已挂载
      if (!isMountedRef.current) {
        debugWarn('组件未挂载，无法切换模式');
        return;
      }

      // 防止重复设置相同模式
      if (mode === newMode) return;

      setMode(newMode);
    } catch (error) {
      debugError('切换编辑模式失败:', error);
      // 如果切换失败，保持当前模式
    }
  }, [mode]);

  const toolbarButtons = [
    { label: 'B', action: () => insertMarkdown('**', '**'), title: '粗体' },
    { label: 'I', action: () => insertMarkdown('*', '*'), title: '斜体' },
    { label: 'H', action: () => insertMarkdown('# '), title: '标题' },
    { label: '•', action: () => insertMarkdown('- '), title: '列表' },
    { label: '链', action: () => insertMarkdown('[', '](url)'), title: '链接' },
    { label: '图', action: () => insertMarkdown('![', '](image-url)'), title: '图片' },
    { label: '</>', action: () => insertMarkdown('`', '`'), title: '代码' },
  ];
  const isSplitMode = mode === 'split' && !isMobile;
  const editorHeight = isMobile ? 'min(52vh, 460px)' : '24rem';

  // 如果组件未挂载，显示加载状态
  if (!isComponentMounted) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-center p-8">
          <div className="text-sm" style={{ color: theme.colors.textSecondary }}>
            正在加载编辑器...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 工具栏 */}
      <div className={`flex gap-3 ${isMobile ? 'flex-col' : 'items-center justify-between'}`}>
        <div className={`flex items-center gap-2 ${isMobile ? 'overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden' : 'flex-wrap'}`}>
          {toolbarButtons.map((button, index) => (
            <button
              key={index}
              type="button"
              onClick={button.action}
              className={`${isMobile ? 'min-h-9 min-w-9 px-2.5' : 'p-2'} rounded transition-colors hover:bg-opacity-80`}
              style={{ 
                backgroundColor: theme.colors.surface,
                color: theme.colors.textSecondary 
              }}
              title={button.title}
            >
              <span className="inline-flex min-w-[1.2rem] justify-center text-xs font-semibold">{button.label}</span>
            </button>
          ))}
        </div>

        {/* 模式切换 */}
        <div className={`flex items-center gap-1 rounded-lg p-1 ${isMobile ? 'self-end' : ''}`} style={{ backgroundColor: theme.colors.surface }}>
          <button
            type="button"
            onClick={(e) => handleModeChange(e, 'edit')}
            className={`rounded px-3 py-1 text-sm transition-colors ${
              mode === 'edit' ? 'font-medium' : ''
            }`}
            style={{
              backgroundColor: mode === 'edit' ? theme.colors.primary : 'transparent',
              color: mode === 'edit' ? 'white' : theme.colors.textSecondary,
            }}
          >
            编辑
          </button>
          <button
            type="button"
            onClick={(e) => handleModeChange(e, 'preview')}
            className={`rounded px-3 py-1 text-sm transition-colors ${
              mode === 'preview' ? 'font-medium' : ''
            }`}
            style={{
              backgroundColor: mode === 'preview' ? theme.colors.primary : 'transparent',
              color: mode === 'preview' ? 'white' : theme.colors.textSecondary,
            }}
          >
            预览
          </button>
          {!isMobile && (
            <button
              type="button"
              onClick={(e) => handleModeChange(e, 'split')}
              className={`rounded px-3 py-1 text-sm transition-colors ${
                mode === 'split' ? 'font-medium' : ''
              }`}
              style={{
                backgroundColor: mode === 'split' ? theme.colors.primary : 'transparent',
                color: mode === 'split' ? 'white' : theme.colors.textSecondary,
              }}
            >
              分屏
            </button>
          )}
        </div>
      </div>

      {/* 编辑器内容 */}
      <div className={`grid gap-4 ${isSplitMode ? 'grid-cols-2' : 'grid-cols-1'}`}>
        {/* 编辑区域 */}
        {(mode === 'edit' || isSplitMode) && (
          <div>
            <textarea
              ref={textareaRef}
              data-diary-content-input="true"
              aria-label="日记内容编辑器"
              value={value}
              maxLength={maxLength}
              onChange={(e) => onChange(maxLength === undefined ? e.target.value : e.target.value.slice(0, maxLength))}
              placeholder={placeholder || '开始写作...支持 Markdown 语法'}
              className={`w-full rounded-lg border p-4 ${isMobile ? 'text-base' : ''} resize-none transition-colors focus:outline-none focus:ring-2`}
              style={{
                height: editorHeight,
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border,
                color: theme.colors.text,
                '--tw-ring-color': theme.colors.primary,
              } as React.CSSProperties}
            />
          </div>
        )}

        {/* 预览区域 */}
        {(mode === 'preview' || isSplitMode) && (
          <PreviewArea
            value={value}
            theme={theme}
            height={editorHeight}
          />
        )}
      </div>

      {/* Markdown 语法提示 */}
      <details className="text-sm">
        <summary 
          className="cursor-pointer font-medium mb-2"
          style={{ color: theme.colors.textSecondary }}
        >
          Markdown 语法提示
        </summary>
        <div 
          className={`grid gap-4 rounded-lg p-3 text-xs ${isMobile ? 'grid-cols-1' : 'grid-cols-2'}`}
          style={{ 
            backgroundColor: theme.colors.surface,
            color: theme.colors.textSecondary 
          }}
        >
          <div>
            <p><code># 标题</code> - 一级标题</p>
            <p><code>## 标题</code> - 二级标题</p>
            <p><code>**粗体**</code> - 粗体文字</p>
            <p><code>*斜体*</code> - 斜体文字</p>
          </div>
          <div>
            <p><code>- 列表项</code> - 无序列表</p>
            <p><code>[链接](url)</code> - 链接</p>
            <p><code>![图片](url)</code> - 图片</p>
            <p><code>`代码`</code> - 行内代码</p>
          </div>
        </div>
      </details>
    </div>
  );
}

// 独立的预览区域组件，使用React.memo优化性能
const PreviewArea = React.memo(({ value, theme, height }: { value: string; theme: ThemeConfig; height: string }) => {
  const previewContent = value || '*预览区域*\n\n在左侧编辑器中输入 Markdown 内容，这里会实时显示渲染结果。';

  return (
    <div
      className="overflow-y-auto rounded-lg border p-4"
      style={{
        height,
        backgroundColor: theme.colors.surface,
        borderColor: theme.colors.border,
      }}
    >
      <LazyMarkdownRenderer content={previewContent} />
    </div>
  );
});
