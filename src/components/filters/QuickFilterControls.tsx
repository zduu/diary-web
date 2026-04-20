import type { CSSProperties, ReactNode, RefObject } from 'react';
import { ChevronDown, X } from 'lucide-react';
import type { ThemeConfig } from '../../hooks/useTheme';

interface QuickFilterDropdownOption {
  key: string;
  label: ReactNode;
  selected: boolean;
  onSelect: () => void;
}

interface QuickFilterDropdownProps {
  label: ReactNode;
  triggerLabel: string;
  isOpen: boolean;
  onToggle: () => void;
  dropdownRef: RefObject<HTMLDivElement>;
  theme: ThemeConfig;
  isMobile: boolean;
  options: QuickFilterDropdownOption[];
  emptyState?: ReactNode;
}

interface ActiveFilterChipProps {
  icon: ReactNode;
  label: ReactNode;
  onRemove: () => void;
  theme: ThemeConfig;
  isMobile: boolean;
}

function getTriggerStyle(theme: ThemeConfig): CSSProperties {
  return {
    backgroundColor: theme.mode === 'dark' ? '#1f2937' : theme.colors.surface,
    borderColor: theme.colors.border,
    color: theme.colors.text,
    textShadow: 'none',
    '--tw-ring-color': theme.colors.primary,
  } as CSSProperties;
}

function getMenuStyle(theme: ThemeConfig): CSSProperties {
  return {
    backgroundColor: theme.mode === 'dark' ? '#1f2937' : theme.colors.surface,
    borderColor: theme.colors.border,
    boxShadow:
      theme.mode === 'dark'
        ? '0 4px 12px rgba(0, 0, 0, 0.4)'
        : '0 4px 12px rgba(0, 0, 0, 0.05)',
  };
}

function getOptionStyle(theme: ThemeConfig, selected: boolean): CSSProperties {
  return {
    backgroundColor: selected
      ? (theme.mode === 'dark' ? '#374151' : '#eff6ff')
      : 'transparent',
    color: selected
      ? (theme.mode === 'dark' ? '#f9fafb' : '#3b82f6')
      : theme.colors.text,
    textShadow: 'none',
  };
}

function getChipStyle(theme: ThemeConfig): CSSProperties {
  const isDark = theme.mode === 'dark';
  return {
    backgroundColor: isDark ? '#374151' : '#eff6ff',
    color: isDark ? '#f9fafb' : '#3b82f6',
    border: `1px solid ${isDark ? '#4b5563' : '#bfdbfe'}`,
    textShadow: 'none',
  };
}

export function QuickFilterDropdown({
  label,
  triggerLabel,
  isOpen,
  onToggle,
  dropdownRef,
  theme,
  isMobile,
  options,
  emptyState,
}: QuickFilterDropdownProps) {
  return (
    <div className="space-y-2" ref={dropdownRef}>
      <label className={`${isMobile ? 'text-xs' : 'text-sm'} flex items-center gap-2 font-medium`} style={{ color: theme.colors.text }}>
        {label}
      </label>
      <div className="relative">
        <button
          type="button"
          onClick={onToggle}
          className={`w-full ${isMobile ? 'px-3 py-2 text-sm' : 'px-3 py-2.5'} flex items-center justify-between rounded-xl border text-left transition-all focus:outline-none focus:ring-2`}
          style={getTriggerStyle(theme)}
        >
          <span className="truncate">{triggerLabel}</span>
          <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>

        {isOpen && (
          <div
            className="absolute z-50 mt-2 max-h-60 w-full overflow-y-auto rounded-xl border shadow-lg"
            style={getMenuStyle(theme)}
          >
            {options.map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={option.onSelect}
                className={`w-full ${isMobile ? 'text-sm' : ''} flex items-center justify-between px-3 py-2 text-left transition-colors hover:bg-opacity-80`}
                style={getOptionStyle(theme, option.selected)}
              >
                <span>{option.label}</span>
                {option.selected && (
                  <div
                    className="flex h-4 w-4 items-center justify-center rounded-full text-xs font-bold text-white"
                    style={{ backgroundColor: theme.colors.primary }}
                  >
                    ✓
                  </div>
                )}
              </button>
            ))}

            {options.length === 0 && emptyState}
          </div>
        )}
      </div>
    </div>
  );
}

export function ActiveFilterChip({ icon, label, onRemove, theme, isMobile }: ActiveFilterChipProps) {
  return (
    <span
      className={`flex items-center gap-1 rounded-full ${isMobile ? 'px-2 py-1 text-xs' : 'px-3 py-1 text-sm'}`}
      style={getChipStyle(theme)}
    >
      {icon}
      {label}
      <button onClick={onRemove} className="transition-opacity hover:opacity-80">
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}
