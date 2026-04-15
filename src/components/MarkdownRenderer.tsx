import type { CSSProperties, HTMLAttributes } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useThemeContext } from './ThemeProvider';

interface MarkdownRendererProps {
  content: string;
  className?: string;
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
    backgroundColor: theme.mode === 'dark' ? 'rgba(148, 163, 184, 0.12)' : theme.colors.surface,
    border: `1px solid ${theme.colors.border}`,
    borderRadius: '18px',
  };

  return (
    <div className={`markdown-prose ${className}`} style={proseStyle}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
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
            <ul style={{ margin: '0 0 1.15rem', paddingLeft: '1.35rem' }} {...props} />
          ),
          ol: ({ ...props }) => (
            <ol style={{ margin: '0 0 1.15rem', paddingLeft: '1.35rem' }} {...props} />
          ),
          li: ({ ...props }) => (
            <li style={{ marginBottom: '0.45rem', paddingLeft: '0.1rem' }} {...props} />
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
          a: ({ ...props }) => (
            <a
              style={{
                color: theme.colors.primary,
                textDecoration: 'underline',
                textUnderlineOffset: '0.18em',
              }}
              target="_blank"
              rel="noreferrer"
              {...props}
            />
          ),
          img: ({ ...props }) => (
            <img
              loading="lazy"
              decoding="async"
              style={{
                width: '100%',
                borderRadius: '18px',
                margin: '1.15rem 0',
                border: `1px solid ${theme.colors.border}`,
              }}
              {...props}
            />
          ),
          code: ({ inline, className: codeClassName, children, ...props }: HTMLAttributes<HTMLElement> & { inline?: boolean }) => {
            if (inline) {
              return (
                <code
                  className={codeClassName}
                  style={{
                    fontSize: '0.9em',
                    padding: '0.18rem 0.42rem',
                    borderRadius: '8px',
                    backgroundColor: theme.mode === 'dark' ? 'rgba(148, 163, 184, 0.16)' : `${theme.colors.primary}14`,
                    color: theme.colors.primary,
                  }}
                  {...props}
                >
                  {children}
                </code>
              );
            }

            return (
              <code className={codeClassName} {...props}>
                {children}
              </code>
            );
          },
          pre: ({ ...props }) => (
            <pre
              style={{
                overflowX: 'auto',
                margin: '1.2rem 0',
                padding: '1.05rem 1.15rem',
                ...mutedBlockStyle,
              }}
              {...props}
            />
          ),
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
