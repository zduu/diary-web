import { createPortal } from 'react-dom';
import { MapPin, X } from 'lucide-react';
import type { LocationInfo } from '../types/index.ts';
import { useThemeContext } from './ThemeProvider';

interface LocationDetailModalProps {
  isOpen: boolean;
  location: LocationInfo | null;
  onClose: () => void;
}

export function LocationDetailModal({
  isOpen,
  location,
  onClose,
}: LocationDetailModalProps) {
  const { theme } = useThemeContext();

  if (!isOpen || !location) {
    return null;
  }

  const panelStyle = {
    backgroundColor: theme.mode === 'dark' ? 'rgba(10, 18, 28, 0.78)' : theme.colors.surface,
    border: `1px solid ${theme.colors.border}`,
    boxShadow:
      theme.mode === 'dark'
        ? '0 24px 60px rgba(7, 12, 20, 0.35)'
        : '0 20px 48px rgba(15, 23, 42, 0.14)',
  };

  const fieldStyle = {
    backgroundColor: theme.mode === 'dark' ? 'rgba(148, 163, 184, 0.08)' : 'rgba(255, 255, 255, 0.62)',
    border: `1px solid ${theme.colors.border}`,
    color: theme.colors.text,
  };

  return createPortal(
    <div
      className="location-detail-modal fixed inset-0 flex items-center justify-center bg-black/50 p-4"
      style={{ zIndex: 10000 }}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className="mx-4 max-h-[90vh] w-full max-w-md overflow-y-auto rounded-[1.5rem] p-5 md:p-6"
        style={panelStyle}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MapPin className="h-5 w-5" style={{ color: theme.colors.primary }} />
            <h3 className="text-lg font-semibold" style={{ color: theme.colors.text }}>
              位置详情
            </h3>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl p-2 transition-opacity hover:opacity-80"
            style={fieldStyle}
          >
            <X className="h-4 w-4" style={{ color: theme.colors.textSecondary }} />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <div className="mb-1 text-sm" style={{ color: theme.colors.textSecondary }}>
              位置名称
            </div>
            <div className="rounded-2xl p-3 text-sm" style={fieldStyle}>
              {location.name || '未知位置'}
            </div>
          </div>

          {location.address && (
            <div>
              <div className="mb-1 text-sm" style={{ color: theme.colors.textSecondary }}>
                详细地址
              </div>
              <div className="rounded-2xl p-3 text-sm leading-6" style={fieldStyle}>
                {location.address}
              </div>
            </div>
          )}

          {(location.latitude !== undefined || location.longitude !== undefined) && (
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl p-3 text-sm" style={fieldStyle}>
                纬度: {location.latitude !== undefined ? location.latitude.toFixed(6) : '-'}
              </div>
              <div className="rounded-2xl p-3 text-sm" style={fieldStyle}>
                经度: {location.longitude !== undefined ? location.longitude.toFixed(6) : '-'}
              </div>
            </div>
          )}

          {location.details && (
            <div>
              <div className="mb-1 text-sm" style={{ color: theme.colors.textSecondary }}>
                位置详情
              </div>
              <div className="space-y-1 rounded-2xl p-3 text-sm" style={fieldStyle}>
                {location.details.country && <div>国家: {location.details.country}</div>}
                {location.details.state && <div>省份: {location.details.state}</div>}
                {location.details.city && <div>城市: {location.details.city}</div>}
                {location.details.suburb && <div>区域: {location.details.suburb}</div>}
                {location.details.road && <div>道路: {location.details.road}</div>}
                {location.details.building && <div>建筑: {location.details.building}</div>}
              </div>
            </div>
          )}
        </div>

        <div className="mt-6 flex justify-end">
          <button
            onClick={onClose}
            className="rounded-xl px-4 py-2 text-sm font-medium text-white"
            style={{ backgroundColor: theme.colors.primary }}
          >
            关闭
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
