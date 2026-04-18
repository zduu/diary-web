import React, { useState, useRef, useCallback } from 'react';
import { Upload, X, Loader2 } from 'lucide-react';
import { useThemeContext } from './ThemeProvider';
import { NotificationToast } from './NotificationToast';
import { apiService } from '../services/api';
import { useNotificationState } from '../hooks/useNotificationState';
import { useIsMobile } from '../hooks/useIsMobile';
import { debugError } from '../utils/logger.ts';

interface ImageUploadProps {
  images: string[];
  onImagesChange: (images: string[]) => void;
  maxImages?: number;
}

export function ImageUpload({ images, onImagesChange, maxImages = 5 }: ImageUploadProps) {
  const { theme } = useThemeContext();
  const isMobile = useIsMobile();
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const { hideNotification, notification, showNotification } = useNotificationState();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isEmbeddedImageUrl = (value: string) => value.startsWith('data:image/');

  const handleFileSelect = useCallback(async (files: FileList) => {
    if (images.length >= maxImages) {
      showNotification(`最多只能上传 ${maxImages} 张图片`, 'error');
      return;
    }

    const validFiles = Array.from(files).filter(file => {
      if (!file.type.startsWith('image/')) {
        showNotification(`${file.name} 不是有效的图片文件`, 'error');
        return false;
      }
      if (file.size > 5 * 1024 * 1024) {
        showNotification(`${file.name} 文件大小超过 5MB`, 'error');
        return false;
      }
      return true;
    });

    if (validFiles.length === 0) return;

    const remainingSlots = maxImages - images.length;
    const filesToUpload = validFiles.slice(0, remainingSlots);

    setUploading(true);
    setUploadProgress({ current: 0, total: filesToUpload.length });
    try {
      const uploadedUrls: string[] = [];

      for (let index = 0; index < filesToUpload.length; index += 1) {
        const file = filesToUpload[index];
        setUploadProgress({ current: index + 1, total: filesToUpload.length });
        const uploadedUrl = await apiService.uploadImage(file);
        uploadedUrls.push(uploadedUrl);
      }

      onImagesChange([...images, ...uploadedUrls]);
      if (uploadedUrls.some(isEmbeddedImageUrl)) {
        showNotification(`已保存 ${uploadedUrls.length} 张图片到当前日记，未同步到 R2`, 'success');
      } else {
        showNotification(`成功上传 ${uploadedUrls.length} 张图片`, 'success');
      }
    } catch (error) {
      debugError('上传失败:', error);
      showNotification(error instanceof Error ? error.message : '图片上传失败，请重试', 'error');
    } finally {
      setUploading(false);
      setUploadProgress(null);
    }
  }, [images, maxImages, onImagesChange]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    handleFileSelect(e.dataTransfer.files);
  }, [handleFileSelect]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  }, []);

  const removeImage = (index: number) => {
    const newImages = images.filter((_, i) => i !== index);
    onImagesChange(newImages);
  };

  const openFileDialog = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className={isMobile ? 'space-y-3' : 'space-y-4'}>
      {/* 上传区域 */}
      <div
        className={`relative border-2 border-dashed text-center transition-all duration-200 cursor-pointer ${
          isMobile ? 'rounded-2xl p-4' : 'rounded-lg p-6'
        } ${
          dragOver ? 'border-blue-400 bg-blue-50' : ''
        }`}
        style={{
          borderColor: dragOver ? theme.colors.primary : theme.colors.border,
          backgroundColor: dragOver ? `${theme.colors.primary}10` : theme.colors.surface,
        }}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={openFileDialog}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*"
          className="hidden"
          onChange={(e) => e.target.files && handleFileSelect(e.target.files)}
        />

        {uploading ? (
          <div className="flex flex-col items-center">
            <Loader2 className="w-8 h-8 animate-spin mb-2" style={{ color: theme.colors.primary }} />
            <p style={{ color: theme.colors.text }}>
              {uploadProgress ? `上传中... ${uploadProgress.current}/${uploadProgress.total}` : '上传中...'}
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center">
            <Upload className="w-8 h-8 mb-2" style={{ color: theme.colors.primary }} />
            <p className={isMobile ? 'text-sm' : undefined} style={{ color: theme.colors.text }}>
              拖拽图片到这里，或点击选择文件
            </p>
            <p className={`${isMobile ? 'text-xs' : 'text-sm'} mt-1`} style={{ color: theme.colors.textSecondary }}>
              支持 JPG、PNG、GIF 格式，单个文件不超过 5MB
            </p>
            <p className="text-xs mt-1" style={{ color: theme.colors.textSecondary }}>
              已上传 {images.length}/{maxImages} 张
            </p>
          </div>
        )}
      </div>

      {/* 图片预览 */}
      {images.length > 0 && (
        <div className={`grid ${isMobile ? 'grid-cols-2 gap-3' : 'grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4'}`}>
          {images.map((imageUrl, index) => (
            <div key={index} className="relative group">
              <div 
                className="aspect-square rounded-lg overflow-hidden border"
                style={{ borderColor: theme.colors.border }}
              >
                <img
                  src={imageUrl}
                  alt={`上传的图片 ${index + 1}`}
                  className="w-full h-full object-cover"
                  loading="lazy"
                  decoding="async"
                />
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  removeImage(index);
                }}
                className={`absolute -top-2 -right-2 bg-red-500 text-white rounded-full flex items-center justify-center transition-opacity duration-200 hover:bg-red-600 ${
                  isMobile ? 'h-7 w-7 opacity-100' : 'h-6 w-6 opacity-0 group-hover:opacity-100'
                }`}
                aria-label={`删除第 ${index + 1} 张图片`}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {notification.visible && (
        <NotificationToast
          message={notification.message}
          type={notification.type}
          onClose={hideNotification}
        />
      )}
    </div>
  );
}
