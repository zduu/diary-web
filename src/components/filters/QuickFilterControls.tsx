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
    backgroundColor: theme.mode === 'dark' ? 'rgba(10, 18, 28, 0.56)' : theme.colors.surface,
    borderColor: theme.colors.border,
    color: theme.colors.text,
    textShadow: 'none',
    backdropFilter: theme.mode === 'dark' ? 'blur(12px)' : 'none',
    '--tw-ring-color': theme.colors.primary,
  } as CSSProperties;
}

function getMenuStyle(theme: ThemeConfig): CSSProperties {
  return {
    backgroundColor: theme.mode === 'dark' ? 'rgba(10, 18, 28, 0.82)' : theme.colors.surface,
    borderColor: theme.colors.border,
    backdropFilter: theme.mode === 'dark' ? 'blur(20px)' : 'none',
    boxShadow: theme.mode === 'dark' ? '0 18px 40px rgba(4, 10, 18, 0.22)' : '0 14px 32px rgba(15, 23, 42, 0.08)',
  };
}

function getOptionStyle(theme: ThemeConfig, selected: boolean): CSSProperties {
  return {
    backgroundColor: selected
      ? (theme.mode === 'dark' ? 'rgba(148, 163, 184, 0.18)' : `${theme.colors.primary}20`)
      : 'transparent',
    color: theme.colors.text,
    textShadow: 'none',
  };
}

function getChipStyle(theme: ThemeConfig): CSSProperties {
  return {
    backgroundColor: theme.mode === 'dark' ? 'rgba(148, 163, 184, 0.16)' : `${theme.colors.primary}16`,
    color: theme.mode === 'dark' ? theme.colors.text : theme.colors.primary,
    border: `1px solid ${theme.mode === 'dark' ? theme.colors.border : `${theme.colors.primary}30`}`,
    textShadow: 'none',
    backdropFilter: theme.mode === 'dark' ? 'blur(10px)' : 'none',
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
