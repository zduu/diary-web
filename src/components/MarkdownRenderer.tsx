import { isValidElement, useEffect, useRef, useState, type CSSProperties, type HTMLAttributes, type ImgHTMLAttributes, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useThemeContext } from './ThemeProvider';
import type { ThemeConfig } from '../hooks/useTheme';
import { isValidImageSource } from '../utils/imageSourceValidation';

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

const imageDimensionsCache = new Map<string, { width: number; height: number }>();
const loadedMarkdownImageCache = new Set<string>();
const MARKDOWN_IMAGE_CACHE_LIMIT = 64;
const MARKDOWN_URL_BASE = 'https://diary.local';
const safeLinkProtocols = new Set(['http:', 'https:', 'mailto:']);

function touchCachedValue<T>(cache: Map<string, T>, key: string) {
  const value = cache.get(key);
  if (!value) {
    return null;
  }

  cache.delete(key);
  cache.set(key, value);
  return value;
}

function touchCachedSetValue(cache: Set<string>, key: string) {
  if (!cache.has(key)) {
    return false;
  }

  cache.delete(key);
  cache.add(key);
  return true;
}

function trimOldestCacheEntries(cache: Map<string, unknown> | Set<string>) {
  while (cache.size > MARKDOWN_IMAGE_CACHE_LIMIT) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey === undefined) {
      return;
    }

    cache.delete(oldestKey);
  }
}

function rememberImageDimensions(src: string, dimensions: { width: number; height: number }) {
  imageDimensionsCache.delete(src);
  imageDimensionsCache.set(src, dimensions);
  trimOldestCacheEntries(imageDimensionsCache);
}

function rememberLoadedImage(src: string) {
  loadedMarkdownImageCache.delete(src);
  loadedMarkdownImageCache.add(src);
  trimOldestCacheEntries(loadedMarkdownImageCache);
}

function normalizeMarkdownUrl(value: string | undefined) {
  const trimmedValue = value?.trim() ?? '';
  if (
    !trimmedValue
    || Array.from(trimmedValue).some((character) => {
      const charCode = character.charCodeAt(0);
      return charCode <= 31 || charCode === 127;
    })
  ) {
    return null;
  }

  try {
    return new URL(trimmedValue, MARKDOWN_URL_BASE);
  } catch {
    return null;
  }
}

function getSafeMarkdownLinkHref(href: string | undefined) {
  const parsedUrl = normalizeMarkdownUrl(href);
  if (!parsedUrl || !safeLinkProtocols.has(parsedUrl.protocol)) {
    return null;
  }

  return href?.trim() ?? null;
}

function getSafeMarkdownImageSrc(src: string | undefined) {
  const trimmedSrc = src?.trim() ?? '';
  return isValidImageSource(trimmedSrc) ? trimmedSrc : null;
}

function copyWithTextareaFallback(text: string) {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', 'true');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();

  try {
    const copied = document.execCommand('copy');
    if (!copied) {
      throw new Error('copy failed');
    }
  } finally {
    document.body.removeChild(textarea);
  }
}

async function copyToClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Fall back to the textarea copy path when async clipboard access is blocked.
    }
  }

  copyWithTextareaFallback(text);
}

function getNodeTextContent(node: ReactNode): string {
  if (node == null || typeof node === 'boolean') {
    return '';
  }

  if (typeof node === 'string' || typeof node === 'number') {
    return String(node);
  }

  if (Array.isArray(node)) {
    return node.map(getNodeTextContent).join('');
  }

  if (isValidElement(node)) {
    return getNodeTextContent(node.props.children);
  }

  return '';
}

function getCodeLanguage(className?: string) {
  const match = className?.match(/language-([a-z0-9_-]+)/i);
  return match?.[1] ?? null;
}

interface MarkdownCodeBlockProps {
  children: ReactNode;
  className?: string;
  theme: ThemeConfig;
  blockStyle: CSSProperties;
}

function MarkdownCodeBlock({ children, className, theme, blockStyle }: MarkdownCodeBlockProps) {
  const [copyState, setCopyState] = useState<'idle' | 'success' | 'error'>('idle');
  const resetTimerRef = useRef<number | null>(null);
  const codeText = getNodeTextContent(children).replace(/\n$/, '');
  const language = getCodeLanguage(className);

  useEffect(() => () => {
    if (resetTimerRef.current !== null) {
      window.clearTimeout(resetTimerRef.current);
    }
  }, []);

  const scheduleReset = () => {
    if (resetTimerRef.current !== null) {
      window.clearTimeout(resetTimerRef.current);
    }

    resetTimerRef.current = window.setTimeout(() => {
      setCopyState('idle');
      resetTimerRef.current = null;
    }, 1600);
  };

  const handleCopy = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();

    try {
      await copyToClipboard(codeText);
      setCopyState('success');
    } catch {
      setCopyState('error');
    }

    scheduleReset();
  };

  return (
    <div
      style={{
        margin: '1.2rem 0',
        overflow: 'hidden',
        ...blockStyle,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '0.8rem',
          padding: '0.8rem 0.95rem 0',
        }}
      >
        <span
          style={{
            color: theme.colors.textSecondary,
            fontSize: '0.72rem',
            fontWeight: 600,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          {language ?? 'code'}
        </span>

        <button
          type="button"
          onClick={handleCopy}
          style={{
            padding: '0.32rem 0.7rem',
            borderRadius: '999px',
            border: `1px solid ${theme.colors.border}`,
            backgroundColor: theme.mode === 'dark' ? '#374151' : '#f3f4f6',
            color: copyState === 'error' ? '#dc2626' : theme.colors.textSecondary,
            fontSize: '0.75rem',
            lineHeight: 1.2,
            cursor: 'pointer',
          }}
          aria-label="复制代码"
          title="复制代码"
        >
          {copyState === 'success' ? '已复制' : copyState === 'error' ? '复制失败' : '复制'}
        </button>
      </div>

      <pre
        style={{
          overflowX: 'auto',
          margin: 0,
          padding: '0.85rem 1.15rem 1.05rem',
        }}
      >
        <code
          className={className}
          style={{
            display: 'block',
            color: theme.colors.text,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, monospace',
            fontSize: '0.92em',
            lineHeight: 1.7,
            whiteSpace: 'pre',
          }}
        >
          {codeText}
        </code>
      </pre>
    </div>
  );
}

interface MarkdownImageProps extends ImgHTMLAttributes<HTMLImageElement> {
  theme: ThemeConfig;
}

function MarkdownImage({ theme, src, alt = '', ...props }: MarkdownImageProps) {
  const cachedDimensions = src ? touchCachedValue(imageDimensionsCache, src) : null;
  const [dimensions, setDimensions] = useState(cachedDimensions);
  const [loaded, setLoaded] = useState(src ? touchCachedSetValue(loadedMarkdownImageCache, src) : false);

  useEffect(() => {
    if (!src) {
      return;
    }

    const existingDimensions = touchCachedValue(imageDimensionsCache, src);
    if (existingDimensions) {
      setDimensions(existingDimensions);
      return;
    }

    let cancelled = false;
    const image = new Image();

    const updateDimensions = () => {
      if (cancelled || !image.naturalWidth || !image.naturalHeight) {
        return;
      }

      const nextDimensions = {
        width: image.naturalWidth,
        height: image.naturalHeight,
      };

      rememberImageDimensions(src, nextDimensions);
      setDimensions(nextDimensions);
    };

    image.onload = updateDimensions;
    image.src = src;

    if (image.complete) {
      updateDimensions();
    }

    return () => {
      cancelled = true;
      image.onload = null;
    };
  }, [src]);

  useEffect(() => {
    if (!src) {
      setLoaded(false);
      return;
    }

    setLoaded(touchCachedSetValue(loadedMarkdownImageCache, src));
  }, [src]);

  if (!src) {
    return null;
  }

  const imageRatio = dimensions && dimensions.width > 0 && dimensions.height > 0
    ? `${dimensions.width} / ${dimensions.height}`
    : undefined;

  return (
    <figure
      style={{
        margin: '1.15rem 0',
        borderRadius: '18px',
        overflow: 'hidden',
        border: `1px solid ${theme.colors.border}`,
        backgroundColor: theme.mode === 'dark' ? '#1f2937' : '#f9fafb',
        aspectRatio: imageRatio,
        minHeight: imageRatio ? undefined : '180px',
      }}
    >
      <img
        src={src}
        alt={alt}
        loading="eager"
        decoding="sync"
        onLoad={() => {
          rememberLoadedImage(src);
          setLoaded(true);
        }}
        style={{
          display: 'block',
          width: '100%',
          height: 'auto',
          opacity: loaded ? 1 : 0,
        }}
        {...props}
      />
    </figure>
  );
}

export function MarkdownRenderer({ content, className = '' }: MarkdownRendererProps) {
  const { theme } = useThemeContext();

  if (!content || typeof content !== 'string' || !content.trim()) {
    return (
      <div className={`markdown-prose ${className}`} style={{ color: theme.colors.textSecondary }}>
        暂无内容
      </div>
    );
  }

  const proseStyle: CSSProperties = {
    color: theme.colors.text,
    lineHeight: 1.92,
    fontSize: '1rem',
    letterSpacing: '0.01em',
  };

  const mutedBlockStyle: CSSProperties = {
    backgroundColor: theme.mode === 'dark' ? '#111827' : theme.colors.surface,
    border: `1px solid ${theme.colors.border}`,
    borderRadius: '18px',
  };

  return (
    <div className={`markdown-prose ${className}`} style={proseStyle}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        urlTransform={(value) => value}
        components={{
          h1: ({ ...props }) => (
            <h1
              style={{
                color: theme.colors.text,
                fontSize: '1.7rem',
                fontWeight: 600,
                lineHeight: 1.15,
                letterSpacing: '-0.03em',
                margin: '0 0 1.2rem',
                paddingBottom: '0.7rem',
                borderBottom: `1px solid ${theme.colors.border}`,
              }}
              {...props}
            />
          ),
          h2: ({ ...props }) => (
            <h2
              style={{
                color: theme.colors.text,
                fontSize: '1.4rem',
                fontWeight: 600,
                lineHeight: 1.2,
                letterSpacing: '-0.025em',
                margin: '1.75rem 0 0.95rem',
              }}
              {...props}
            />
          ),
          h3: ({ ...props }) => (
            <h3
              style={{
                color: theme.colors.text,
                fontSize: '1.18rem',
                fontWeight: 600,
                lineHeight: 1.3,
                letterSpacing: '-0.02em',
                margin: '1.45rem 0 0.7rem',
              }}
              {...props}
            />
          ),
          p: ({ ...props }) => (
            <p style={{ margin: '0 0 1.05rem', color: theme.colors.text }} {...props} />
          ),
          ul: ({ ...props }) => (
            <ul
              style={{
                margin: '0 0 1.15rem',
                paddingLeft: '1.35rem',
                listStyleType: 'disc',
                listStylePosition: 'outside',
              }}
              {...props}
            />
          ),
          ol: ({ ...props }) => (
            <ol
              style={{
                margin: '0 0 1.15rem',
                paddingLeft: '1.35rem',
                listStyleType: 'decimal',
                listStylePosition: 'outside',
              }}
              {...props}
            />
          ),
          li: ({ ...props }) => (
            <li style={{ display: 'list-item', marginBottom: '0.45rem', paddingLeft: '0.1rem' }} {...props} />
          ),
          blockquote: ({ ...props }) => (
            <blockquote
              style={{
                margin: '1.35rem 0',
                padding: '1rem 1.1rem',
                borderLeft: `3px solid ${theme.colors.primary}`,
                color: theme.colors.textSecondary,
                ...mutedBlockStyle,
              }}
              {...props}
            />
          ),
          a: ({ href, children, ...props }) => {
            const safeHref = getSafeMarkdownLinkHref(href);
            if (!safeHref) {
              return <span {...props}>{children}</span>;
            }

            return (
              <a
                {...props}
                href={safeHref}
                style={{
                  color: theme.colors.primary,
                  textDecoration: 'underline',
                  textUnderlineOffset: '0.18em',
                }}
                target="_blank"
                rel="noreferrer noopener"
              >
                {children}
              </a>
            );
          },
          img: ({ src, ...props }) => (
            <MarkdownImage theme={theme} src={getSafeMarkdownImageSrc(src) ?? undefined} {...props} />
          ),
          code: ({ className: codeClassName, children, ...props }: HTMLAttributes<HTMLElement>) => {
            const codeText = getNodeTextContent(children);
            const isBlockCode = Boolean(codeClassName) || codeText.includes('\n');

            if (!isBlockCode) {
              return (
                <span
                  style={{
                    color: theme.colors.text,
                  }}
                  {...props}
                >
                  {children}
                </span>
              );
            }

            return (
              <MarkdownCodeBlock
                className={codeClassName}
                theme={theme}
                blockStyle={mutedBlockStyle}
              >
                {children}
              </MarkdownCodeBlock>
            );
          },
          pre: ({ children }) => <>{children}</>,
          hr: ({ ...props }) => (
            <hr
              style={{
                margin: '1.8rem 0',
                border: 0,
                borderTop: `1px solid ${theme.colors.border}`,
              }}
              {...props}
            />
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
