import { useDeferredValue, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { Calendar, Filter, Search, Tag, X } from 'lucide-react';
import { useThemeContext } from './ThemeProvider';
import type { DiaryEntry } from '../types/index.ts';
import { sanitizeFilterMetaControls } from './filters/filterEntryMeta';
import { normalizeTimeString } from '../utils/timeUtils.ts';
import { useIsMobile } from '../hooks/useIsMobile';

interface SearchBarProps {
  entries: DiaryEntry[];
  isAdminAuthenticated: boolean;
  availableTags: string[];
  availableYears: string[];
  availableMonthsByYear: Record<string, string[]>;
  untaggedEntryCount: number;
  onSearchResults: (results: DiaryEntry[]) => void;
  onClearSearch: () => void;
  onSearchPendingChange?: (pending: boolean) => void;
  onSearchQueryChange?: (query: string) => void;
  onSearchSummaryChange?: (items: Array<{ id: string; label: string }>) => void;
  clearRequest?: { targetId: string; nonce: number } | null;
  resetSignal?: number;
}

interface SearchFilters {
  searchInTitle: boolean;
  searchInContent: boolean;
  searchInTags: boolean;
  mood: string;
  weather: string;
  dateRange: string;
  selectedTag: string;
  selectedYear: string;
  selectedMonth: string;
}

const initialFilters: SearchFilters = {
  searchInTitle: true,
  searchInContent: true,
  searchInTags: true,
  mood: '',
  weather: '',
  dateRange: '',
  selectedTag: '',
  selectedYear: '',
  selectedMonth: '',
};

const RECENT_SEARCHES_KEY = 'diary_recent_searches';
const MAX_RECENT_SEARCHES = 6;
const MAX_SEARCH_SUGGESTIONS = 8;
const SEARCH_SCOPE_OPTIONS = [
  { key: 'searchInTitle', label: '标题' },
  { key: 'searchInContent', label: '正文' },
  { key: 'searchInTags', label: '标签' },
] as const;
const MOOD_LABELS: Record<string, string> = {
  happy: '开心',
  sad: '难过',
  neutral: '平静',
  excited: '兴奋',
  anxious: '焦虑',
  peaceful: '平和',
};
const WEATHER_LABELS: Record<string, string> = {
  sunny: '晴天',
  cloudy: '多云',
  rainy: '雨天',
  snowy: '雪天',
};
const DATE_RANGE_LABELS: Record<string, string> = {
  today: '今天',
  week: '最近一周',
  month: '最近一个月',
};

type SearchSuggestionItem = {
  value: string;
  type: 'tag' | 'title';
  matchCount: number;
};

type SearchKeyboardOption = {
  id: string;
  label: string;
  value: string;
  type: 'recent' | 'tag' | 'title';
};

type FilterSelectOption = {
  value: string;
  label: string;
};

type SearchStatusPillProps = {
  controlStyle: CSSProperties;
  color: string;
  children: ReactNode;
};

type SearchSuggestionChipProps = {
  optionId: string;
  selected: boolean;
  onClick: () => void;
  controlStyle: CSSProperties;
  inactiveColor: string;
  activeBackground: string;
  children: ReactNode;
};

type SearchFilterCardProps = {
  controlStyle: CSSProperties;
  title: string;
  icon?: ReactNode;
  isMobile?: boolean;
  children: ReactNode;
};

type SearchFilterSelectProps = Omit<SearchFilterCardProps, 'children'> & {
  value: string;
  options: FilterSelectOption[];
  onChange: (value: string) => void;
};

function createFilterSelectOptions(defaultLabel: string, labels: Record<string, string>): FilterSelectOption[] {
  return [{ value: '', label: defaultLabel }, ...Object.entries(labels).map(([value, label]) => ({ value, label }))];
}

const moodOptions = createFilterSelectOptions('所有心情', MOOD_LABELS);
const weatherOptions = createFilterSelectOptions('所有天气', WEATHER_LABELS);
const dateRangeOptions = createFilterSelectOptions('所有时间', DATE_RANGE_LABELS);

function normalizeSuggestionValue(value: string) {
  return value.trim().toLowerCase();
}

function collectTitleSuggestions(entries: DiaryEntry[]) {
  const titleSet = new Set<string>();

  entries.forEach((entry) => {
    const title = entry.title?.trim();

    if (!title || title === '无标题' || title.length < 2) {
      return;
    }

    titleSet.add(title);
  });

  return Array.from(titleSet);
}

function countSuggestionMatches(entries: DiaryEntry[], value: string, type: 'tag' | 'title') {
  if (type === 'tag') {
    return entries.filter((entry) => entry.tags?.includes(value)).length;
  }

  return entries.filter((entry) => entry.title?.trim() === value).length;
}

function sortSuggestions(
  suggestions: SearchSuggestionItem[],
  query: string,
  recentSearches: string[]
) {
  const normalizedQuery = normalizeSuggestionValue(query);
  const recentIndex = new Map(recentSearches.map((item, index) => [normalizeSuggestionValue(item), index]));

  return [...suggestions].sort((left, right) => {
    const leftNormalized = normalizeSuggestionValue(left.value);
    const rightNormalized = normalizeSuggestionValue(right.value);
    const leftStartsWithQuery = normalizedQuery ? leftNormalized.startsWith(normalizedQuery) : false;
    const rightStartsWithQuery = normalizedQuery ? rightNormalized.startsWith(normalizedQuery) : false;

    if (leftStartsWithQuery !== rightStartsWithQuery) {
      return leftStartsWithQuery ? -1 : 1;
    }

    const leftRecentIndex = recentIndex.get(leftNormalized) ?? Number.POSITIVE_INFINITY;
    const rightRecentIndex = recentIndex.get(rightNormalized) ?? Number.POSITIVE_INFINITY;

    if (leftRecentIndex !== rightRecentIndex) {
      return leftRecentIndex - rightRecentIndex;
    }

    if (left.matchCount !== right.matchCount) {
      return right.matchCount - left.matchCount;
    }

    if (left.value.length !== right.value.length) {
      return left.value.length - right.value.length;
    }

    return left.value.localeCompare(right.value, 'zh-CN');
  });
}

function hasActiveFilters(filters: SearchFilters) {
  return Object.entries(filters).some(([key, value]) => {
    if (key.startsWith('searchIn')) {
      return value === false;
    }

    return value !== '';
  });
}

function SearchStatusPill({ controlStyle, color, children }: SearchStatusPillProps) {
  return (
    <span className="status-pill" style={{ ...controlStyle, color }}>
      {children}
    </span>
  );
}

function SearchSuggestionChip({
  optionId,
  selected,
  onClick,
  controlStyle,
  inactiveColor,
  activeBackground,
  children,
}: SearchSuggestionChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      role="option"
      aria-selected={selected}
      id={`search-option-${optionId}`}
      className="status-pill transition-transform duration-200 hover:-translate-y-0.5"
      style={{
        ...controlStyle,
        color: selected ? '#ffffff' : inactiveColor,
        background: selected ? activeBackground : controlStyle.backgroundColor,
      }}
    >
      {children}
    </button>
  );
}

function SearchFilterCard({ controlStyle, title, icon, isMobile = false, children }: SearchFilterCardProps) {
  return (
    <div className={`space-y-2 rounded-2xl ${isMobile ? 'p-3' : 'p-4'}`} style={controlStyle}>
      <div className={`inline-flex items-center gap-2 font-medium ${isMobile ? 'text-xs' : 'text-sm'}`} style={{ color: controlStyle.color }}>
        {icon}
        {title}
      </div>
      {children}
    </div>
  );
}

function SearchFilterSelect({ controlStyle, title, icon, isMobile = false, value, options, onChange }: SearchFilterSelectProps) {
  return (
    <SearchFilterCard controlStyle={controlStyle} title={title} icon={icon} isMobile={isMobile}>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label={title}
        className={`w-full rounded-xl border outline-none ${isMobile ? 'px-3 py-2 text-sm' : 'px-3 py-2 text-sm'}`}
        style={controlStyle}
      >
        {options.map((option) => (
          <option key={option.value || '__all__'} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </SearchFilterCard>
  );
}

function getSearchSummaryItems(query: string, filters: SearchFilters) {
  const items: Array<{ id: string; label: string }> = [];
  const trimmedQuery = query.trim();

  if (trimmedQuery) {
    items.push({ id: 'query', label: `关键词：${trimmedQuery}` });
  }

  const enabledScopes = [
    filters.searchInTitle ? '标题' : null,
    filters.searchInContent ? '正文' : null,
    filters.searchInTags ? '标签' : null,
  ].filter(Boolean) as string[];

  if (enabledScopes.length !== 3) {
    items.push({ id: 'scope', label: `范围：${enabledScopes.length > 0 ? enabledScopes.join(' / ') : '未选择'}` });
  }

  if (filters.mood) {
    items.push({ id: 'mood', label: `心情：${MOOD_LABELS[filters.mood] || filters.mood}` });
  }

  if (filters.weather) {
    items.push({ id: 'weather', label: `天气：${WEATHER_LABELS[filters.weather] || filters.weather}` });
  }

  if (filters.dateRange) {
    items.push({ id: 'dateRange', label: `时间：${DATE_RANGE_LABELS[filters.dateRange] || filters.dateRange}` });
  }

  if (filters.selectedTag) {
    items.push({
      id: 'selectedTag',
      label: filters.selectedTag === '__no_tags__' ? '标签：无标签' : `标签：#${filters.selectedTag}`,
    });
  }

  if (filters.selectedYear) {
    items.push({ id: 'selectedYear', label: `年份：${filters.selectedYear}年` });
  }

  if (filters.selectedMonth) {
    items.push({ id: 'selectedMonth', label: `月份：${parseInt(filters.selectedMonth, 10)}月` });
  }

  return items;
}

export function SearchBar({
  entries,
  isAdminAuthenticated,
  availableTags,
  availableYears,
  availableMonthsByYear,
  untaggedEntryCount,
  onSearchResults,
  onClearSearch,
  onSearchPendingChange,
  onSearchQueryChange,
  onSearchSummaryChange,
  clearRequest = null,
  resetSignal = 0,
}: SearchBarProps) {
  const { theme } = useThemeContext();
  const isMobile = useIsMobile();
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [searchFilters, setSearchFilters] = useState<SearchFilters>(initialFilters);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [isSearchInputFocused, setIsSearchInputFocused] = useState(false);
  const [highlightedOptionIndex, setHighlightedOptionIndex] = useState(-1);
  const deferredEntries = useDeferredValue(entries);
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const deferredSearchFilters = useDeferredValue(searchFilters);
  const effectiveFilterMeta = useMemo(
    () =>
      sanitizeFilterMetaControls(
        {
          availableTags,
          untaggedEntryCount,
          availableYears,
          availableMonthsByYear,
        },
        entries,
        isAdminAuthenticated
      ),
    [availableMonthsByYear, availableTags, availableYears, entries, isAdminAuthenticated, untaggedEntryCount]
  );

  const inputShellStyle: CSSProperties = {
    backgroundColor: theme.mode === 'dark' ? 'rgba(148, 163, 184, 0.08)' : 'rgba(255, 255, 255, 0.68)',
    border: `1px solid ${theme.colors.border}`,
    boxShadow:
      theme.mode === 'dark'
        ? '0 18px 36px rgba(4, 10, 18, 0.18)'
        : '0 10px 24px rgba(15, 23, 42, 0.06)',
  };

  const controlStyle: CSSProperties = {
    backgroundColor: theme.mode === 'dark' ? 'rgba(10, 18, 28, 0.52)' : theme.colors.surface,
    border: `1px solid ${theme.colors.border}`,
    color: theme.colors.text,
  };

  const activeFilterCount = useMemo(() => {
    let count = 0;

    if (!searchFilters.searchInTitle || !searchFilters.searchInContent || !searchFilters.searchInTags) {
      count += 1;
    }
    if (searchFilters.mood) count += 1;
    if (searchFilters.weather) count += 1;
    if (searchFilters.dateRange) count += 1;
    if (searchFilters.selectedTag) count += 1;
    if (searchFilters.selectedYear) count += 1;
    if (searchFilters.selectedMonth) count += 1;

    return count;
  }, [searchFilters]);

  const searchSuggestions = useMemo(() => {
    const query = normalizeSuggestionValue(deferredSearchQuery);
    const tagSuggestions: SearchSuggestionItem[] = [];
    const titleSuggestions: SearchSuggestionItem[] = [];
    const seen = new Set<string>();
    const visibleEntries = deferredEntries.filter((entry) => isAdminAuthenticated || !entry.hidden);

    if (deferredSearchFilters.searchInTags) {
      effectiveFilterMeta.availableTags.forEach((tag) => {
        const value = tag.trim();
        if (!value) {
          return;
        }

        const normalizedValue = normalizeSuggestionValue(value);
        if ((query && !normalizedValue.includes(query)) || seen.has(normalizedValue)) {
          return;
        }

        seen.add(normalizedValue);
        tagSuggestions.push({
          value,
          type: 'tag',
          matchCount: countSuggestionMatches(visibleEntries, value, 'tag'),
        });
      });
    }

    if (deferredSearchFilters.searchInTitle) {
      collectTitleSuggestions(visibleEntries).forEach((title) => {
        const normalizedValue = normalizeSuggestionValue(title);
        if ((query && !normalizedValue.includes(query)) || seen.has(normalizedValue)) {
          return;
        }

        seen.add(normalizedValue);
        titleSuggestions.push({
          value: title,
          type: 'title',
          matchCount: countSuggestionMatches(visibleEntries, title, 'title'),
        });
      });
    }

    return {
      tags: sortSuggestions(tagSuggestions, searchQuery, recentSearches).slice(0, Math.ceil(MAX_SEARCH_SUGGESTIONS / 2)),
      titles: sortSuggestions(titleSuggestions, searchQuery, recentSearches).slice(0, Math.floor(MAX_SEARCH_SUGGESTIONS / 2)),
    };
  }, [
    deferredEntries,
    deferredSearchFilters.searchInTags,
    deferredSearchFilters.searchInTitle,
    deferredSearchQuery,
    effectiveFilterMeta.availableTags,
    isAdminAuthenticated,
    recentSearches,
    searchQuery,
  ]);

  const suggestionsDisabledByScope = !searchFilters.searchInTags && !searchFilters.searchInTitle;
  const keyboardOptions = useMemo<SearchKeyboardOption[]>(() => {
    const options: SearchKeyboardOption[] = [];

    if (recentSearches.length > 0 && (!searchQuery || isSearchInputFocused)) {
      recentSearches.forEach((item) => {
        options.push({
          id: `recent-${item}`,
          label: item,
          value: item,
          type: 'recent',
        });
      });
    }

    if (!suggestionsDisabledByScope && isSearchInputFocused) {
      searchSuggestions.tags.forEach((item) => {
        options.push({
          id: `tag-${item.value}`,
          label: `#${item.value}`,
          value: item.value,
          type: 'tag',
        });
      });

      searchSuggestions.titles.forEach((item) => {
        options.push({
          id: `title-${item.value}`,
          label: item.value,
          value: item.value,
          type: 'title',
        });
      });
    }

    return options;
  }, [isSearchInputFocused, recentSearches, searchQuery, searchSuggestions.tags, searchSuggestions.titles, suggestionsDisabledByScope]);
  const activeOptionId = highlightedOptionIndex >= 0 ? keyboardOptions[highlightedOptionIndex]?.id : undefined;
  const hasSearchQuery = Boolean(searchQuery.trim());
  const visibleRecentSearches = isMobile ? recentSearches.slice(0, 4) : recentSearches;
  const shouldShowRecentSearches = visibleRecentSearches.length > 0 && isSearchInputFocused && !hasSearchQuery;
  const shouldShowSuggestions =
    isSearchInputFocused &&
    hasSearchQuery &&
    (suggestionsDisabledByScope || searchSuggestions.tags.length > 0 || searchSuggestions.titles.length > 0);
  const shouldShowListbox = shouldShowRecentSearches || shouldShowSuggestions;
  const candidateAnnouncement = shouldShowListbox
    ? `当前有 ${keyboardOptions.length} 个候选项，可使用上下方向键切换，回车确认。`
    : '当前没有可用候选项。';
  const activeSuggestionBackground = `linear-gradient(135deg, ${theme.colors.primary}, ${theme.colors.accent})`;
  const suggestionScopeText = searchFilters.searchInTitle && searchFilters.searchInTags
    ? '跟随标题与标签范围'
    : searchFilters.searchInTitle
      ? '仅跟随标题范围'
      : searchFilters.searchInTags
        ? '仅跟随标签范围'
        : '建议已关闭';

  const saveRecentSearches = (items: string[]) => {
    setRecentSearches(items);
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(items));
  };

  const pushRecentSearch = (value: string) => {
    const trimmedValue = value.trim();

    if (trimmedValue.length < 2) {
      return;
    }

    const nextItems = [trimmedValue, ...recentSearches.filter((item) => item !== trimmedValue)].slice(0, MAX_RECENT_SEARCHES);
    saveRecentSearches(nextItems);
  };

  const clearRecentSearches = () => {
    saveRecentSearches([]);
  };

  useEffect(() => {
    try {
      const saved = localStorage.getItem(RECENT_SEARCHES_KEY);
      if (!saved) {
        return;
      }

      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        setRecentSearches(parsed.filter((item): item is string => typeof item === 'string').slice(0, MAX_RECENT_SEARCHES));
      }
    } catch {
      setRecentSearches([]);
    }
  }, []);

  useEffect(() => {
    onSearchQueryChange?.(searchQuery.trim());
  }, [onSearchQueryChange, searchQuery]);

  useEffect(() => {
    onSearchSummaryChange?.(getSearchSummaryItems(searchQuery, searchFilters));
  }, [onSearchSummaryChange, searchFilters, searchQuery]);

  useEffect(() => {
    if (!clearRequest) {
      return;
    }

    switch (clearRequest.targetId) {
      case 'query':
        setSearchQuery('');
        break;
      case 'scope':
        setSearchFilters((prev) => ({
          ...prev,
          searchInTitle: true,
          searchInContent: true,
          searchInTags: true,
        }));
        break;
      case 'mood':
      case 'weather':
      case 'dateRange':
      case 'selectedTag':
      case 'selectedMonth':
        setSearchFilters((prev) => ({ ...prev, [clearRequest.targetId]: '' }));
        break;
      case 'selectedYear':
        setSearchFilters((prev) => ({ ...prev, selectedYear: '', selectedMonth: '' }));
        break;
      default:
        break;
    }
  }, [clearRequest]);

  useEffect(() => {
    setSearchQuery('');
    setShowFilters(false);
    setSearchFilters(initialFilters);
    setHighlightedOptionIndex(-1);
  }, [resetSignal]);

  useEffect(() => {
    if (keyboardOptions.length === 0) {
      setHighlightedOptionIndex(-1);
      return;
    }

    setHighlightedOptionIndex((previous) => previous >= keyboardOptions.length ? -1 : previous);
  }, [keyboardOptions]);

  useEffect(() => {
    if (!isSearchInputFocused) {
      pushRecentSearch(searchQuery);
    }
  }, [isSearchInputFocused, searchQuery]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      const query = deferredSearchQuery.trim().toLowerCase();
      const activeFilters = hasActiveFilters(deferredSearchFilters);

      if (!query && !activeFilters) {
        onSearchPendingChange?.(false);
        onClearSearch();
        return;
      }

      const results = deferredEntries.filter((entry) => {
        if (!isAdminAuthenticated && entry.hidden) {
          return false;
        }

        let matchesText = !query;

        if (query) {
          if (deferredSearchFilters.searchInTitle && entry.title?.toLowerCase().includes(query)) {
            matchesText = true;
          }
          if (deferredSearchFilters.searchInContent && entry.content.toLowerCase().includes(query)) {
            matchesText = true;
          }
          if (deferredSearchFilters.searchInTags && entry.tags?.some((tag) => tag.toLowerCase().includes(query))) {
            matchesText = true;
          }
        }

        if (!matchesText) return false;
        if (deferredSearchFilters.mood && entry.mood !== deferredSearchFilters.mood) return false;
        if (deferredSearchFilters.weather && entry.weather !== deferredSearchFilters.weather) return false;

        if (deferredSearchFilters.selectedTag) {
          if (deferredSearchFilters.selectedTag === '__no_tags__') {
            if (entry.tags && entry.tags.length > 0) return false;
          } else if (!entry.tags || !entry.tags.includes(deferredSearchFilters.selectedTag)) {
            return false;
          }
        }

        const entryDate = new Date(normalizeTimeString(entry.created_at!));

        if (deferredSearchFilters.selectedYear && entryDate.getFullYear().toString() !== deferredSearchFilters.selectedYear) {
          return false;
        }

        if (deferredSearchFilters.selectedMonth) {
          const entryMonth = (entryDate.getMonth() + 1).toString().padStart(2, '0');
          if (entryMonth !== deferredSearchFilters.selectedMonth) {
            return false;
          }
        }

        if (deferredSearchFilters.dateRange) {
          const now = new Date();

          switch (deferredSearchFilters.dateRange) {
            case 'today':
              if (entryDate.toDateString() !== now.toDateString()) return false;
              break;
            case 'week': {
              const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
              if (entryDate < weekAgo) return false;
              break;
            }
            case 'month': {
              const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
              if (entryDate < monthAgo) return false;
              break;
            }
          }
        }

        return true;
      });

      onSearchPendingChange?.(false);
      onSearchResults(results);
    }, 220);

    const hasPendingSearch = Boolean(searchQuery.trim()) || hasActiveFilters(searchFilters);
    onSearchPendingChange?.(hasPendingSearch);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [
    deferredEntries,
    deferredSearchFilters,
    deferredSearchQuery,
    isAdminAuthenticated,
    onClearSearch,
    onSearchPendingChange,
    onSearchResults,
    searchFilters,
    searchQuery,
  ]);

  const shouldShowExtendedFilters =
    effectiveFilterMeta.availableTags.length > 0 ||
    effectiveFilterMeta.untaggedEntryCount > 0 ||
    effectiveFilterMeta.availableYears.length > 0;
  const availableMonthsForYear = searchFilters.selectedYear
    ? effectiveFilterMeta.availableMonthsByYear[searchFilters.selectedYear] || []
    : [];

  const resetSearch = () => {
    setSearchQuery('');
    setSearchFilters(initialFilters);
    onClearSearch();
  };

  const handleSearchInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      if (keyboardOptions.length === 0) {
        return;
      }

      event.preventDefault();
      setHighlightedOptionIndex((previous) => (previous + 1) % keyboardOptions.length);
      return;
    }

    if (event.key === 'ArrowUp') {
      if (keyboardOptions.length === 0) {
        return;
      }

      event.preventDefault();
      setHighlightedOptionIndex((previous) => (previous <= 0 ? keyboardOptions.length - 1 : previous - 1));
      return;
    }

    if (event.key === 'Enter') {
      if (highlightedOptionIndex >= 0 && keyboardOptions[highlightedOptionIndex]) {
        event.preventDefault();
        handleSelectQueryValue(keyboardOptions[highlightedOptionIndex].value);
        return;
      }

      pushRecentSearch(searchQuery);
      return;
    }

    if (event.key === 'Escape') {
      setHighlightedOptionIndex(-1);
      setIsSearchInputFocused(false);
    }
  };

  const handleSelectQueryValue = (value: string) => {
    setSearchQuery(value);
    setShowFilters(false);
    setHighlightedOptionIndex(-1);
    pushRecentSearch(value);
  };

  return (
    <div className="space-y-2.5">
      <div className={`rounded-[1.4rem] ${isMobile ? 'p-2.5' : 'p-4'}`} style={inputShellStyle}>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2"
              style={{ color: theme.colors.textSecondary }}
            />
            <input
              type="text"
              value={searchQuery}
              autoComplete="off"
              enterKeyHint="search"
              spellCheck={false}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => setIsSearchInputFocused(true)}
              onBlur={() => window.setTimeout(() => setIsSearchInputFocused(false), 120)}
              onKeyDown={handleSearchInputKeyDown}
              role="combobox"
              aria-expanded={shouldShowListbox}
              aria-controls="searchbar-suggestions"
              aria-describedby="searchbar-candidate-status"
              aria-autocomplete="list"
              aria-activedescendant={activeOptionId ? `search-option-${activeOptionId}` : undefined}
              placeholder="搜索标题、正文、标签，或直接按条件筛选"
              className={`w-full rounded-2xl border px-11 text-sm outline-none transition-colors md:text-[15px] ${isMobile ? 'py-2.5' : 'py-3'}`}
              style={controlStyle}
            />
            <div id="searchbar-candidate-status" className="sr-only" aria-live="polite">
              {candidateAnnouncement}
            </div>
          </div>

          <div className={`grid gap-2 ${isMobile ? 'grid-cols-2' : 'grid-cols-[auto_auto]'}`}>
            <button
              type="button"
              onClick={() => setShowFilters((value) => !value)}
              className={`inline-flex items-center justify-center gap-2 rounded-2xl text-sm font-medium transition-transform duration-200 hover:-translate-y-0.5 ${isMobile ? 'px-3 py-2.5' : 'px-4 py-3'}`}
              style={{
                ...(showFilters
                  ? {
                      background: `linear-gradient(135deg, ${theme.colors.primary}, ${theme.colors.accent})`,
                      color: '#ffffff',
                      border: '1px solid transparent',
                    }
                  : controlStyle),
              }}
            >
              <Filter className="h-4 w-4" />
              筛选
              {activeFilterCount > 0 ? ` ${activeFilterCount}` : ''}
            </button>

            {(searchQuery || activeFilterCount > 0) && (
              <button
                type="button"
                onClick={resetSearch}
                className={`inline-flex items-center justify-center gap-2 rounded-2xl text-sm transition-transform duration-200 hover:-translate-y-0.5 ${isMobile ? 'px-3 py-2.5' : 'px-4 py-3'}`}
                style={controlStyle}
              >
                <X className="h-4 w-4" />
                清空
              </button>
            )}
          </div>
        </div>

        {(searchQuery || activeFilterCount > 0) && (
          <div className="mt-2.5 flex flex-wrap gap-2">
            {searchQuery && (
              <SearchStatusPill controlStyle={controlStyle} color={theme.colors.textSecondary}>
                关键词: {searchQuery}
              </SearchStatusPill>
            )}
            {activeFilterCount > 0 && (
              <SearchStatusPill controlStyle={controlStyle} color={theme.colors.primary}>
                已启用 {activeFilterCount} 项筛选
              </SearchStatusPill>
            )}
          </div>
        )}

        {(shouldShowRecentSearches || shouldShowSuggestions) && (
          <div
            className={`mt-2.5 flex flex-col rounded-2xl ${isMobile ? 'gap-2 p-2.5' : 'gap-3 p-3'}`}
            style={controlStyle}
            role="listbox"
            id="searchbar-suggestions"
            aria-label="搜索候选项"
          >
            {shouldShowRecentSearches && (
              <>
            <div className="flex items-center justify-between gap-3">
              <div className="text-xs font-medium uppercase tracking-[0.16em]" style={{ color: theme.colors.textSecondary }}>
                最近搜索
              </div>
              <button
                type="button"
                onClick={clearRecentSearches}
                className="text-xs transition-opacity hover:opacity-80"
                style={{ color: theme.colors.textSecondary }}
              >
                清空历史
              </button>
            </div>

            <div className="flex flex-wrap gap-2">
              {visibleRecentSearches.map((item) => (
                <SearchSuggestionChip
                  key={item}
                  optionId={`recent-${item}`}
                  selected={highlightedOptionIndex >= 0 && keyboardOptions[highlightedOptionIndex]?.id === `recent-${item}`}
                  onClick={() => handleSelectQueryValue(item)}
                  controlStyle={controlStyle}
                  inactiveColor={theme.colors.textSecondary}
                  activeBackground={activeSuggestionBackground}
                >
                  <Search className="h-3.5 w-3.5" />
                  {item}
                </SearchSuggestionChip>
              ))}
            </div>
              </>
            )}

            {shouldShowSuggestions && (
              <>
            <div className="flex items-center justify-between gap-3">
              <div className="text-xs font-medium uppercase tracking-[0.16em]" style={{ color: theme.colors.textSecondary }}>
                搜索建议
              </div>
              <div className="text-xs" style={{ color: theme.colors.textSecondary }}>
                {suggestionScopeText}
              </div>
            </div>

            {suggestionsDisabledByScope && (
              <div className="text-sm" style={{ color: theme.colors.textSecondary }}>
                当前已关闭标题和标签搜索范围，建议区暂时隐藏。重新勾选任一范围后会恢复建议。
              </div>
            )}

            {searchSuggestions.tags.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-medium" style={{ color: theme.colors.textSecondary }}>
                  标签建议
                </div>
                <div className="flex flex-wrap gap-2">
                  {searchSuggestions.tags.map((item) => (
                    <SearchSuggestionChip
                      key={`${item.type}-${item.value}`}
                      optionId={`tag-${item.value}`}
                      selected={highlightedOptionIndex >= 0 && keyboardOptions[highlightedOptionIndex]?.id === `tag-${item.value}`}
                      onClick={() => handleSelectQueryValue(item.value)}
                      controlStyle={controlStyle}
                      inactiveColor={theme.colors.primary}
                      activeBackground={activeSuggestionBackground}
                    >
                      <Tag className="h-3.5 w-3.5" />
                      #{item.value}
                      <span className="opacity-70">{item.matchCount}</span>
                    </SearchSuggestionChip>
                  ))}
                </div>
              </div>
            )}

            {searchSuggestions.titles.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-medium" style={{ color: theme.colors.textSecondary }}>
                  标题建议
                </div>
                <div className="flex flex-wrap gap-2">
                  {searchSuggestions.titles.map((item) => (
                    <SearchSuggestionChip
                      key={`${item.type}-${item.value}`}
                      optionId={`title-${item.value}`}
                      selected={highlightedOptionIndex >= 0 && keyboardOptions[highlightedOptionIndex]?.id === `title-${item.value}`}
                      onClick={() => handleSelectQueryValue(item.value)}
                      controlStyle={controlStyle}
                      inactiveColor={theme.colors.textSecondary}
                      activeBackground={activeSuggestionBackground}
                    >
                      <Search className="h-3.5 w-3.5" />
                      {item.value}
                      <span className="opacity-70">{item.matchCount}</span>
                    </SearchSuggestionChip>
                  ))}
                </div>
              </div>
            )}
              </>
            )}
          </div>
        )}
      </div>

      {showFilters && (
        <div className={`rounded-[1.4rem] ${isMobile ? 'p-3' : 'p-5'}`} style={inputShellStyle}>
          <div className={`flex items-center justify-between gap-3 ${isMobile ? 'mb-3' : 'mb-4'}`}>
            <div>
              <div className="text-sm font-semibold" style={{ color: theme.colors.text }}>
                检索条件
              </div>
              <div className="mt-1 text-xs md:text-sm" style={{ color: theme.colors.textSecondary }}>
                {isMobile ? '把文字、时间和状态条件收进一个面板。' : '把文字搜索和标签、时间、状态过滤放在一个面板里。'}
              </div>
            </div>
          </div>

          <div className={`grid ${isMobile ? 'gap-3' : 'gap-4 md:grid-cols-2 xl:grid-cols-3'}`}>
            <SearchFilterCard controlStyle={controlStyle} title="搜索范围" isMobile={isMobile}>
              <div className="flex flex-wrap gap-3 text-sm" style={{ color: theme.colors.textSecondary }}>
                {SEARCH_SCOPE_OPTIONS.map(({ key, label }) => (
                  <label key={key} className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={searchFilters[key]}
                      onChange={(e) =>
                        setSearchFilters((prev) => ({
                          ...prev,
                          [key]: e.target.checked,
                        }))
                      }
                      style={{ accentColor: theme.colors.primary }}
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
            </SearchFilterCard>

            <SearchFilterSelect
              controlStyle={controlStyle}
              title="心情"
              isMobile={isMobile}
              value={searchFilters.mood}
              options={moodOptions}
              onChange={(value) => setSearchFilters((prev) => ({ ...prev, mood: value }))}
            />

            <SearchFilterSelect
              controlStyle={controlStyle}
              title="天气"
              isMobile={isMobile}
              value={searchFilters.weather}
              options={weatherOptions}
              onChange={(value) => setSearchFilters((prev) => ({ ...prev, weather: value }))}
            />

            <SearchFilterSelect
              controlStyle={controlStyle}
              title="时间范围"
              isMobile={isMobile}
              value={searchFilters.dateRange}
              options={dateRangeOptions}
              onChange={(value) => setSearchFilters((prev) => ({ ...prev, dateRange: value }))}
            />

            {shouldShowExtendedFilters && (
              <>
                <SearchFilterSelect
                  controlStyle={controlStyle}
                  title="标签"
                  icon={<Tag className="h-4 w-4" />}
                  isMobile={isMobile}
                  value={searchFilters.selectedTag}
                    options={[
                      { value: '', label: '所有标签' },
                      { value: '__no_tags__', label: `无标签 (${effectiveFilterMeta.untaggedEntryCount})` },
                      ...effectiveFilterMeta.availableTags.map((tag) => ({ value: tag, label: `#${tag}` })),
                    ]}
                    onChange={(value) => setSearchFilters((prev) => ({ ...prev, selectedTag: value }))}
                  />

                <SearchFilterSelect
                  controlStyle={controlStyle}
                  title="年份"
                  icon={<Calendar className="h-4 w-4" />}
                  isMobile={isMobile}
                  value={searchFilters.selectedYear}
                  options={[
                    { value: '', label: '所有年份' },
                    ...effectiveFilterMeta.availableYears.map((year) => ({ value: year, label: `${year}年` })),
                  ]}
                  onChange={(value) =>
                    setSearchFilters((prev) => ({
                      ...prev,
                      selectedYear: value,
                      selectedMonth: '',
                    }))
                  }
                />

                {searchFilters.selectedYear && (
                  <SearchFilterSelect
                    controlStyle={controlStyle}
                    title="月份"
                    icon={<Calendar className="h-4 w-4" />}
                    isMobile={isMobile}
                    value={searchFilters.selectedMonth}
                    options={[
                      { value: '', label: '所有月份' },
                      ...availableMonthsForYear.map((month) => ({ value: month, label: `${parseInt(month, 10)}月` })),
                    ]}
                    onChange={(value) => setSearchFilters((prev) => ({ ...prev, selectedMonth: value }))}
                  />
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
