import type { CSSProperties, MouseEvent, ReactNode } from 'react';
import type { ThemeConfig } from '../../hooks/useTheme';

interface EntryMetaPillProps {
  theme: ThemeConfig;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  interactive?: boolean;
  title?: string;
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
}

interface EntryTitleBlockProps {
  theme: ThemeConfig;
  title: ReactNode;
  subtitle?: ReactNode;
  hiddenLabel?: string | null;
  isMobile?: boolean;
  timeline?: boolean;
  size?: 'default' | 'timeline' | 'archive' | 'compact';
  clampClassName?: string;
}

interface EntryExcerptBlockProps {
  theme: ThemeConfig;
  children: ReactNode;
  isMobile?: boolean;
  className?: string;
}

interface EntryImageGridProps {
  theme: ThemeConfig;
  images: string[];
  isMobile?: boolean;
  onImageClick: (index: number) => void;
  imageAltPrefix?: string;
  previewLabel?: string;
}

interface EntryTagListProps {
  theme: ThemeConfig;
  tags: string[];
  isMobile?: boolean;
  extraCount?: number;
  extraLabelPrefix?: string;
}

interface EntrySummaryTextProps {
  theme: ThemeConfig;
  children: ReactNode;
  isMobile?: boolean;
  lines?: 1 | 2 | 3;
  className?: string;
}

export function getEntryMetaPillStyle(theme: ThemeConfig): CSSProperties {
  return {
    backgroundColor: theme.mode === 'dark' ? '#374151' : '#f3f4f6',
    border: `1px solid ${theme.colors.border}`,
    color: theme.colors.textSecondary,
  };
}

export function getEntryExcerptStyle(theme: ThemeConfig): CSSProperties {
  return {
    backgroundColor: theme.mode === 'dark' ? '#111827' : '#f9fafb',
    border: `1px solid ${theme.colors.border}`,
    color: theme.colors.textSecondary,
  };
}

export function getEntryTagStyle(theme: ThemeConfig): CSSProperties {
  return {
    backgroundColor: theme.mode === 'dark' ? '#374151' : '#eff6ff',
    color: theme.mode === 'dark' ? '#f9fafb' : '#3b82f6',
    border: `1px solid ${theme.mode === 'dark' ? '#4b5563' : '#bfdbfe'}`,
  };
}

export function EntryTitleBlock({
  theme,
  title,
  subtitle,
  hiddenLabel = null,
  isMobile = false,
  timeline = false,
  size,
  clampClassName = '',
}: EntryTitleBlockProps) {
  const variant = size ?? (timeline ? 'timeline' : 'default');
  const titleClassName = (() => {
    switch (variant) {
      case 'timeline':
        return isMobile ? 'mb-2 text-lg' : 'mb-2 text-2xl';
      case 'archive':
        return isMobile ? 'mb-1 text-sm' : 'mb-1 text-base';
      case 'compact':
        return isMobile ? 'mb-0 text-xs' : 'mb-0 text-sm';
      default:
        return isMobile ? 'text-xl' : 'text-xl md:text-2xl';
    }
  })();

  return (
    <div>
      <h3
        className={`font-semibold tracking-[-0.03em] ${titleClassName} ${variant === 'timeline' ? '' : 'leading-tight'} ${clampClassName}`.trim()}
        style={{ color: theme.colors.text }}
      >
        {title}
        {hiddenLabel && (
          <span className="ml-2 rounded bg-red-500 px-2 py-1 text-xs text-white">
            {hiddenLabel}
          </span>
        )}
      </h3>

      {subtitle && (
        <div
          className={`${timeline ? '' : 'mt-2'} text-sm leading-6`}
          style={{ color: theme.colors.textSecondary }}
        >
          {subtitle}
        </div>
      )}
    </div>
  );
}

export function EntryExcerptBlock({
  theme,
  children,
  isMobile = false,
  className = '',
}: EntryExcerptBlockProps) {
  return (
    <div
      className={`${isMobile ? 'rounded-2xl px-3 py-2 text-sm leading-6' : 'rounded-2xl px-3 py-2 text-sm leading-6'} ${className}`.trim()}
      style={getEntryExcerptStyle(theme)}
    >
      {children}
    </div>
  );
}

export function EntrySummaryText({
  theme,
  children,
  isMobile = false,
  lines = 2,
  className = '',
}: EntrySummaryTextProps) {
  const clampClassName = lines === 1 ? 'line-clamp-1' : lines === 3 ? 'line-clamp-3' : 'line-clamp-2';

  return (
    <p
      className={`${clampClassName} ${isMobile ? 'text-xs' : 'text-sm'} ${className}`.trim()}
      style={{ color: theme.colors.textSecondary }}
    >
      {children}
    </p>
  );
}

export function EntryImageGrid({
  theme,
  images,
  isMobile = false,
  onImageClick,
  imageAltPrefix = '图片',
  previewLabel = '查看原图',
}: EntryImageGridProps) {
  return (
    <div className={`grid ${isMobile ? 'grid-cols-2 gap-2.5' : 'grid-cols-3 gap-3'}`}>
      {images.map((imageUrl, index) => (
        <button
          key={`${imageUrl}-${index}`}
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onImageClick(index);
          }}
          className="group relative overflow-hidden rounded-2xl text-left"
          style={{ border: `1px solid ${theme.colors.border}` }}
        >
          <img
            src={imageUrl}
            alt={`${imageAltPrefix} ${index + 1}`}
            className="aspect-[4/3] w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            loading="lazy"
            decoding="async"
          />
          <div className="absolute inset-0 flex items-end justify-between bg-black/25 p-3 text-white opacity-0 transition-opacity duration-200 group-hover:opacity-100">
            <span className="text-xs font-medium">{previewLabel}</span>
          </div>
        </button>
      ))}
    </div>
  );
}

export function EntryTagList({
  theme,
  tags,
  isMobile = false,
  extraCount = 0,
  extraLabelPrefix = '+',
}: EntryTagListProps) {
  return (
    <div className={`flex flex-wrap ${isMobile ? 'gap-1.5' : 'gap-2'}`}>
      {tags.map((tag) => (
        <span
          key={tag}
          className={`rounded-full ${isMobile ? 'px-2 py-1 text-xs' : 'px-3 py-1 text-xs md:text-sm'}`}
          style={getEntryTagStyle(theme)}
        >
          #{tag}
        </span>
      ))}
      {extraCount > 0 && (
        <span
          className={`rounded-full ${isMobile ? 'px-2 py-1 text-xs' : 'px-3 py-1 text-xs md:text-sm'}`}
          style={getEntryMetaPillStyle(theme)}
        >
          {extraLabelPrefix}{extraCount}
        </span>
      )}
    </div>
  );
}

export function EntryMetaPill({
  theme,
  children,
  className = '',
  style,
  interactive = false,
  title,
  onClick,
}: EntryMetaPillProps) {
  const pillClassName = `status-pill ${interactive ? 'transition-opacity duration-200 hover:opacity-80' : ''} ${className}`.trim();
  const pillStyle = { ...getEntryMetaPillStyle(theme), ...style };

  if (interactive && onClick) {
    return (
      <button
        type="button"
        className={pillClassName}
        style={pillStyle}
        title={title}
        onClick={onClick}
      >
        {children}
      </button>
    );
  }

  return (
    <span className={pillClassName} style={pillStyle}>
      {children}
    </span>
  );
}
