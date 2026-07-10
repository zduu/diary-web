import type { ReactNode } from 'react';
import { sanitizeEntryContent } from './entryTextValidation.ts';

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function highlightText(text: unknown, query: string, highlightClassName = 'search-highlight'): ReactNode {
  const safeText = typeof text === 'string' ? text : '';
  const normalizedQuery = query.trim();

  if (!normalizedQuery) {
    return safeText;
  }

  if (!safeText) {
    return '';
  }

  const regex = new RegExp(`(${escapeRegExp(normalizedQuery)})`, 'ig');
  const parts = safeText.split(regex);

  return parts.map((part, index) =>
    regex.test(part) ? (
      <mark key={`${part}-${index}`} className={highlightClassName}>
        {part}
      </mark>
    ) : (
      part
    )
  );
}

export function buildHighlightedExcerpt(content: unknown, query: string, radius = 52) {
  const safeContent = sanitizeEntryContent(content);
  const normalizedQuery = query.trim().toLowerCase();
  const normalizedContent = safeContent.toLowerCase();

  if (!normalizedQuery) {
    return null;
  }

  const matchIndex = normalizedContent.indexOf(normalizedQuery);

  if (matchIndex === -1) {
    return null;
  }

  const start = Math.max(0, matchIndex - radius);
  const end = Math.min(safeContent.length, matchIndex + normalizedQuery.length + radius);
  const prefix = start > 0 ? '...' : '';
  const suffix = end < safeContent.length ? '...' : '';

  return `${prefix}${safeContent.slice(start, end).trim()}${suffix}`;
}
