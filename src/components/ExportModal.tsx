import { useRef, useState } from 'react';
import { Download } from 'lucide-react';
import { useThemeContext } from './ThemeProvider';
import type { DiaryEntry } from '../types/index.ts';
import { ModalHeader } from './ModalHeader';
import { ModalShell } from './ModalShell';
import { NotificationToast } from './NotificationToast';
import { useNotificationState } from '../hooks/useNotificationState';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import {
  buildDiaryExportFileName,
  createDiaryExportPayload,
  createDiaryTextExport,
  DiaryExportFormat,
  downloadBlobFile,
  exportFormatOptions,
  packageDiaryEntryImagesForExport,
} from '../utils/exportUtils';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  entries: DiaryEntry[];
  exportType: string; // '搜索结果' | '筛选结果' | '全部日记'
}

export function ExportModal({ isOpen, onClose, entries, exportType }: ExportModalProps) {
  const { theme } = useThemeContext();
  const exportButtonRef = useRef<HTMLButtonElement>(null);
  const [exportFormat, setExportFormat] = useState<DiaryExportFormat>('json');
  const [includeHidden, setIncludeHidden] = useState(false);
  const [packageImages, setPackageImages] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const { hideNotification, notification, showNotification } = useNotificationState();
  useBodyScrollLock(isOpen);

  if (!isOpen) return null;

  const visibleEntries = includeHidden ? entries : entries.filter(entry => !entry.hidden);

  const handleExport = async () => {
    if (visibleEntries.length === 0) {
      showNotification('没有可导出的日记！', 'error');
      return;
    }

    const fileName = buildDiaryExportFileName(exportType);
    setIsExporting(true);

    try {
      if (exportFormat === 'json') {
        await exportAsJSON(fileName);
      } else {
        exportAsText(fileName);
      }
    } catch (error) {
      showNotification(error instanceof Error ? error.message : '导出失败，请重试', 'error');
    } finally {
      setIsExporting(false);
    }
  };

  const exportAsJSON = async (fileName: string) => {
    const exportEntries = packageImages
      ? await packageDiaryEntryImagesForExport({ entries: visibleEntries })
      : {
          entries: visibleEntries,
          packagedImageCount: 0,
          failedImageCount: 0,
        };
    const blob = new Blob([
      JSON.stringify(createDiaryExportPayload({
        entries: exportEntries.entries,
        exportType,
        includeHidden,
      }), null, 2),
    ], {
      type: 'application/json',
    });

    downloadBlobFile(blob, `${fileName}.json`);

    if (packageImages && exportEntries.failedImageCount > 0) {
      showNotification(
        `已导出 ${visibleEntries.length} 条日记，打包 ${exportEntries.packagedImageCount} 张图片，另有 ${exportEntries.failedImageCount} 张保留原链接`,
        'error'
      );
      return;
    }

    if (packageImages) {
      showNotification(
        `已导出 ${visibleEntries.length} 条日记，并打包 ${exportEntries.packagedImageCount} 张图片`,
        'success'
      );
      return;
    }

    showNotification(`成功导出 ${visibleEntries.length} 条日记（${exportType}）为 JSON 格式！`, 'success');
  };

  const exportAsText = (fileName: string) => {
    const blob = new Blob([
      createDiaryTextExport({
        entries: visibleEntries,
        exportType,
        includeHidden,
      }),
    ], {
      type: 'text/plain;charset=utf-8',
    });

    downloadBlobFile(blob, `${fileName}.txt`);
    showNotification(`成功导出 ${visibleEntries.length} 条日记（${exportType}）为文本格式！`, 'success');
  };

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      ariaLabelledby="export-modal-title"
      initialFocusRef={exportButtonRef}
      zIndex={50}
      backdropStyle={{
        backgroundColor: 'rgba(0, 0, 0, 0.45)',
        overflow: 'hidden',
      }}
      panelClassName="w-full max-w-md rounded-xl shadow-2xl"
      panelStyle={{
        backgroundColor: theme.colors.surface,
        border: `1px solid ${theme.colors.border}`,
      }}
    >
      <ModalHeader titleId="export-modal-title" title={`导出${exportType}`} onClose={onClose} />

      <div className="space-y-6 p-6">
        <div className="rounded-lg p-4" style={{ backgroundColor: `${theme.colors.primary}10` }}>
          <p className="text-sm" style={{ color: theme.colors.text }}>
            将导出 <span className="font-semibold" style={{ color: theme.colors.primary }}>
              {visibleEntries.length}
            </span> 条日记
          </p>
        </div>

        <div className="space-y-3">
          <label className="text-sm font-medium" style={{ color: theme.colors.text }}>
            导出格式
          </label>
          <div className="space-y-2">
            {exportFormatOptions.map((option) => {
              const Icon = option.icon;
              const checked = exportFormat === option.value;

              return (
                <label
                  key={option.value}
                  className="flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-opacity-50"
                  style={{
                    borderColor: checked ? theme.colors.primary : theme.colors.border,
                    backgroundColor: checked ? `${theme.colors.primary}10` : 'transparent',
                  }}
                >
                  <input
                    type="radio"
                    name="format"
                    value={option.value}
                    checked={checked}
                    onChange={(event) => setExportFormat(event.target.value as DiaryExportFormat)}
                    style={{ accentColor: theme.colors.primary }}
                  />
                  <Icon className="w-5 h-5" style={{ color: theme.colors.primary }} />
                  <div>
                    <div className="font-medium" style={{ color: theme.colors.text }}>{option.title}</div>
                    <div className="text-xs" style={{ color: theme.colors.textSecondary }}>
                      {option.description}
                    </div>
                  </div>
                </label>
              );
            })}
          </div>
        </div>

        <div className="space-y-3">
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={includeHidden}
              onChange={(e) => setIncludeHidden(e.target.checked)}
              style={{ accentColor: theme.colors.primary }}
            />
            <span className="text-sm" style={{ color: theme.colors.text }}>
              包含隐藏的日记
            </span>
          </label>

          <label className={`flex items-start gap-3 ${exportFormat === 'json' ? '' : 'opacity-55'}`}>
            <input
              type="checkbox"
              checked={packageImages}
              disabled={exportFormat !== 'json' || isExporting}
              onChange={(event) => setPackageImages(event.target.checked)}
              style={{ accentColor: theme.colors.primary }}
            />
            <span className="text-sm" style={{ color: theme.colors.text }}>
              导出时打包图片
              <span className="mt-1 block text-xs" style={{ color: theme.colors.textSecondary }}>
                将图片转成内嵌数据，导入到别处也能显示，但导出文件会明显变大。
              </span>
            </span>
          </label>
        </div>
      </div>

      <div className="flex gap-3 border-t p-6" style={{ borderColor: theme.colors.border }}>
        <button
          onClick={onClose}
          disabled={isExporting}
          className="flex-1 rounded-lg border px-4 py-2 transition-colors"
          style={{
            borderColor: theme.colors.border,
            color: theme.colors.text,
            backgroundColor: 'transparent'
          }}
        >
          取消
        </button>
        <button
          ref={exportButtonRef}
          onClick={handleExport}
          disabled={isExporting}
          className="flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2 transition-colors"
          style={{
            backgroundColor: theme.colors.primary,
            color: 'white',
            opacity: isExporting ? 0.72 : 1,
          }}
        >
          <Download className="w-4 h-4" />
          {isExporting ? '导出中...' : '导出'}
        </button>
      </div>

      {notification.visible && (
        <NotificationToast
          message={notification.message}
          type={notification.type}
          onClose={hideNotification}
        />
      )}
    </ModalShell>
  );
}
