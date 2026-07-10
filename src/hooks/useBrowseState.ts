import { startTransition, useCallback, useEffect, useMemo, useState } from 'react';
import type { DiaryEntry } from '../types/index.ts';
import { sanitizeEntryHidden } from '../utils/entryTextValidation.ts';

export type BrowseMode = 'search' | 'quick-filter';
export type BrowseSummaryItem = { id: string; label: string };

export type BrowseDescriptor = {
  mode: BrowseMode | null;
  label: string | null;
  count: number;
  summaryItems: BrowseSummaryItem[];
  emptyHint: string;
  announcement: string;
  exportType: string;
  statusText: string;
  resultTitle: string;
};

export type ClearRequest = { targetId: string; nonce: number } | null;

function createBrowseDescriptor({
  searchResults,
  quickFilterResults,
  searchSummaryItems,
  quickFilterSummaryItems,
  displayEntriesLength,
}: {
  searchResults: DiaryEntry[] | null;
  quickFilterResults: DiaryEntry[] | null;
  searchSummaryItems: BrowseSummaryItem[];
  quickFilterSummaryItems: BrowseSummaryItem[];
  displayEntriesLength: number;
}): BrowseDescriptor {
  if (searchResults) {
    return {
      mode: 'search',
      label: '关键词检索',
      count: displayEntriesLength,
      summaryItems: searchSummaryItems,
      emptyHint: '可以先清空关键词，或减少筛选条件后再试。',
      announcement:
        displayEntriesLength > 0
          ? `关键词检索当前命中 ${displayEntriesLength} 条内容。`
          : '关键词检索当前没有匹配内容。',
      exportType: '搜索结果',
      statusText:
        displayEntriesLength > 0
          ? `当前关键词检索命中 ${displayEntriesLength} 篇日记。`
          : '当前关键词检索没有命中内容。',
      resultTitle:
        displayEntriesLength > 0
          ? `关键词检索得到 ${displayEntriesLength} 条匹配内容`
          : '关键词检索没有找到匹配内容',
    };
  }

  if (quickFilterResults) {
    return {
      mode: 'quick-filter',
      label: '快速筛选',
      count: displayEntriesLength,
      summaryItems: quickFilterSummaryItems,
      emptyHint: '可以移除部分标签、年份或月份限制后再试。',
      announcement:
        displayEntriesLength > 0
          ? `快速筛选当前命中 ${displayEntriesLength} 条内容。`
          : '快速筛选当前没有匹配内容。',
      exportType: '快速筛选结果',
      statusText:
        displayEntriesLength > 0
          ? `当前快速筛选命中 ${displayEntriesLength} 篇日记。`
          : '当前快速筛选没有命中内容。',
      resultTitle:
        displayEntriesLength > 0
          ? `快速筛选得到 ${displayEntriesLength} 条匹配内容`
          : '快速筛选没有找到匹配内容',
    };
  }

  return {
    mode: null,
    label: null,
    count: 0,
    summaryItems: [],
    emptyHint: '',
    announcement: `当前默认展示 ${displayEntriesLength} 篇内容。`,
    exportType: '全部日记',
    statusText: '默认按时间顺序展示全部可见日记。',
    resultTitle: '',
  };
}

export function useBrowseState(entries: DiaryEntry[], isAdminAuthenticated: boolean) {
  const [searchResults, setSearchResults] = useState<DiaryEntry[] | null>(null);
  const [quickFilterResults, setQuickFilterResults] = useState<DiaryEntry[] | null>(null);
  const [activeSearchQuery, setActiveSearchQuery] = useState('');
  const [searchSummaryItems, setSearchSummaryItems] = useState<BrowseSummaryItem[]>([]);
  const [quickFilterSummaryItems, setQuickFilterSummaryItems] = useState<BrowseSummaryItem[]>([]);
  const [isSearchPending, setIsSearchPending] = useState(false);
  const [searchResetSignal, setSearchResetSignal] = useState(0);
  const [quickFilterResetSignal, setQuickFilterResetSignal] = useState(0);
  const [searchClearRequest, setSearchClearRequest] = useState<ClearRequest>(null);
  const [quickFilterClearRequest, setQuickFilterClearRequest] = useState<ClearRequest>(null);

  const resetSearchBrowsing = useCallback(({
    clearResults = true,
    clearQuery = true,
    clearSummary = true,
    bumpResetSignal = false,
    clearPending = true,
  }: {
    clearResults?: boolean;
    clearQuery?: boolean;
    clearSummary?: boolean;
    bumpResetSignal?: boolean;
    clearPending?: boolean;
  } = {}) => {
    if (clearResults) {
      setSearchResults(null);
    }
    if (clearQuery) {
      setActiveSearchQuery('');
    }
    if (clearSummary) {
      setSearchSummaryItems([]);
    }
    if (bumpResetSignal) {
      setSearchResetSignal((value) => value + 1);
    }
    if (clearPending) {
      setIsSearchPending(false);
    }
  }, []);

  const resetQuickFilterBrowsing = useCallback(({
    clearResults = true,
    clearSummary = true,
    bumpResetSignal = false,
  }: {
    clearResults?: boolean;
    clearSummary?: boolean;
    bumpResetSignal?: boolean;
  } = {}) => {
    if (clearResults) {
      setQuickFilterResults(null);
    }
    if (clearSummary) {
      setQuickFilterSummaryItems([]);
    }
    if (bumpResetSignal) {
      setQuickFilterResetSignal((value) => value + 1);
    }
  }, []);

  useEffect(() => {
    if (isAdminAuthenticated) {
      return;
    }

    startTransition(() => {
      resetSearchBrowsing({ bumpResetSignal: true });
      resetQuickFilterBrowsing({ bumpResetSignal: true });
    });
  }, [isAdminAuthenticated, resetQuickFilterBrowsing, resetSearchBrowsing]);

  const accessibleEntries = useMemo(
    () => entries.filter((entry) => isAdminAuthenticated || !sanitizeEntryHidden(entry.hidden)),
    [entries, isAdminAuthenticated]
  );

  const displayEntries = useMemo(
    () => (searchResults || quickFilterResults || accessibleEntries)
      .filter((entry) => isAdminAuthenticated || !sanitizeEntryHidden(entry.hidden)),
    [accessibleEntries, isAdminAuthenticated, quickFilterResults, searchResults]
  );

  const activeBrowse = useMemo(
    () => createBrowseDescriptor({
      searchResults,
      quickFilterResults,
      searchSummaryItems,
      quickFilterSummaryItems,
      displayEntriesLength: displayEntries.length,
    }),
    [displayEntries.length, quickFilterResults, quickFilterSummaryItems, searchResults, searchSummaryItems]
  );

  const handleSearchResults = (results: DiaryEntry[]) => {
    startTransition(() => {
      resetQuickFilterBrowsing({ bumpResetSignal: true });
      setSearchResults(results);
    });
  };

  const handleClearSearch = () => {
    startTransition(() => {
      resetSearchBrowsing();
    });
  };

  const handleQuickFilterResults = (results: DiaryEntry[]) => {
    startTransition(() => {
      resetSearchBrowsing({ bumpResetSignal: true });
      setQuickFilterResults(results);
    });
  };

  const handleClearQuickFilters = () => {
    startTransition(() => {
      resetQuickFilterBrowsing();
    });
  };

  const handleClearActiveBrowsing = () => {
    startTransition(() => {
      resetSearchBrowsing({ bumpResetSignal: true });
      resetQuickFilterBrowsing({ bumpResetSignal: true });
    });
  };

  const handleClearBrowseChip = (targetId: string) => {
    if (activeBrowse.mode === 'search') {
      setSearchClearRequest({ targetId, nonce: Date.now() });
      return;
    }

    if (activeBrowse.mode === 'quick-filter') {
      setQuickFilterClearRequest({ targetId, nonce: Date.now() });
    }
  };

  return {
    accessibleEntries,
    activeBrowse,
    activeSearchQuery,
    displayEntries,
    handleClearActiveBrowsing,
    handleClearBrowseChip,
    handleClearQuickFilters,
    handleClearSearch,
    handleQuickFilterResults,
    handleSearchResults,
    isSearchPending,
    onQuickFilterSummaryChange: setQuickFilterSummaryItems,
    onSearchPendingChange: setIsSearchPending,
    onSearchQueryChange: setActiveSearchQuery,
    onSearchSummaryChange: setSearchSummaryItems,
    quickFilterClearRequest,
    quickFilterResetSignal,
    searchClearRequest,
    searchResetSignal,
  };
}
