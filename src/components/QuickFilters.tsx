import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { Tag, Calendar, X } from 'lucide-react';
import { useThemeContext } from './ThemeProvider';
import { useIsMobile } from '../hooks/useIsMobile';
import type { DiaryEntry } from '../types/index.ts';
import { ActiveFilterChip, QuickFilterDropdown } from './filters/QuickFilterControls';
import { sanitizeFilterMetaControls } from './filters/filterEntryMeta';
import { normalizeTimeString } from '../utils/timeUtils.ts';

interface QuickFiltersProps {
  entries: DiaryEntry[];
  enabled?: boolean;
  isAdminAuthenticated: boolean;
  availableTags: string[];
  availableYears: string[];
  availableMonths: string[];
  availableMonthsByYear: Record<string, string[]>;
  untaggedEntryCount: number;
  onFilterResults: (results: DiaryEntry[]) => void;
  onClearFilter: () => void;
  onFilterSummaryChange?: (items: Array<{ id: string; label: string }>) => void;
  clearRequest?: { targetId: string; nonce: number } | null;
  resetSignal?: number;
}

export function QuickFilters({
  entries,
  enabled = true,
  isAdminAuthenticated,
  availableTags,
  availableYears,
  availableMonths,
  availableMonthsByYear,
  untaggedEntryCount,
  onFilterResults,
  onClearFilter,
  onFilterSummaryChange,
  clearRequest = null,
  resetSignal = 0,
}: QuickFiltersProps) {
  const { theme } = useThemeContext();
  const isMobile = useIsMobile();
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedYear, setSelectedYear] = useState('');
  const [selectedMonth, setSelectedMonth] = useState('');
  const [isTagDropdownOpen, setIsTagDropdownOpen] = useState(false);
  const [isYearDropdownOpen, setIsYearDropdownOpen] = useState(false);
  const [isMonthDropdownOpen, setIsMonthDropdownOpen] = useState(false);
  const deferredEntries = useDeferredValue(entries);
  const tagDropdownRef = useRef<HTMLDivElement>(null);
  const yearDropdownRef = useRef<HTMLDivElement>(null);
  const monthDropdownRef = useRef<HTMLDivElement>(null);
  const effectiveFilterMeta = useMemo(
    () =>
      sanitizeFilterMetaControls(
        {
          availableTags,
          untaggedEntryCount,
          availableYears,
          availableMonths,
          availableMonthsByYear,
        },
        entries,
        isAdminAuthenticated
      ),
    [
      availableMonths,
      availableMonthsByYear,
      availableTags,
      availableYears,
      entries,
      isAdminAuthenticated,
      untaggedEntryCount,
    ]
  );

  // 点击外部关闭下拉框
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const targetNode = event.target as Node;
      if (tagDropdownRef.current && !tagDropdownRef.current.contains(targetNode)) setIsTagDropdownOpen(false);
      if (yearDropdownRef.current && !yearDropdownRef.current.contains(targetNode)) setIsYearDropdownOpen(false);
      if (monthDropdownRef.current && !monthDropdownRef.current.contains(targetNode)) setIsMonthDropdownOpen(false);
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 执行过滤
  const performFilter = (tags: string[], year: string, month: string) => {
    if (tags.length === 0 && !year && !month) {
      onClearFilter();
      return;
    }

    const results = deferredEntries.filter(entry => {
      if (!isAdminAuthenticated && entry.hidden) {
        return false;
      }

      // 标签过滤（多标签支持）
      if (tags.length > 0) {
        let tagMatched = false;

        for (const tag of tags) {
          if (tag === '__no_tags__') {
            // 筛选无标签的日记
            if (!entry.tags || entry.tags.length === 0) {
              tagMatched = true;
              break;
            }
          } else {
            // 筛选有特定标签的日记
            if (entry.tags && entry.tags.includes(tag)) {
              tagMatched = true;
              break;
            }
          }
        }

        if (!tagMatched) {
          return false;
        }
      }

      // 年份过滤
      if (year) {
        const entryDate = new Date(normalizeTimeString(entry.created_at!));
        if (entryDate.getFullYear().toString() !== year) {
          return false;
        }
      }

      // 月份过滤
      if (month) {
        const entryDate = new Date(normalizeTimeString(entry.created_at!));
        const entryMonth = (entryDate.getMonth() + 1).toString().padStart(2, '0');
        if (entryMonth !== month) {
          return false;
        }
      }

      return true;
    });

    onFilterResults(results);
  };

  // 监听过滤条件变化
  useEffect(() => {
    performFilter(selectedTags, selectedYear, selectedMonth);
  }, [deferredEntries, isAdminAuthenticated, selectedMonth, selectedTags, selectedYear]);

  useEffect(() => {
    const items = [
      ...selectedTags.map((tag) => ({
        id: `tag:${tag}`,
        label: tag === '__no_tags__' ? '标签：无标签' : `标签：#${tag}`,
      })),
      ...(selectedYear ? [{ id: 'year', label: `年份：${selectedYear}年` }] : []),
      ...(selectedMonth ? [{ id: 'month', label: `月份：${parseInt(selectedMonth, 10)}月` }] : []),
    ];

    onFilterSummaryChange?.(items);
  }, [onFilterSummaryChange, selectedMonth, selectedTags, selectedYear]);

  useEffect(() => {
    if (!clearRequest) {
      return;
    }

    if (clearRequest.targetId.startsWith('tag:')) {
      const tag = clearRequest.targetId.slice(4);
      setSelectedTags((prev) => prev.filter((item) => item !== tag));
      return;
    }

    if (clearRequest.targetId === 'year') {
      setSelectedYear('');
      setSelectedMonth('');
      return;
    }

    if (clearRequest.targetId === 'month') {
      setSelectedMonth('');
    }
  }, [clearRequest]);

  useEffect(() => {
    setSelectedTags([]);
    setSelectedYear('');
    setSelectedMonth('');
    setIsTagDropdownOpen(false);
    setIsYearDropdownOpen(false);
    setIsMonthDropdownOpen(false);
  }, [resetSignal]);

  // 清除所有过滤
  const handleClearAll = () => {
    setSelectedTags([]);
    setSelectedYear('');
    setSelectedMonth('');
    onClearFilter();
  };

  // 切换标签选择状态
  const toggleTag = (tag: string) => {
    setSelectedTags(prev => {
      if (prev.includes(tag)) {
        // 如果已选中，则取消选中
        return prev.filter(t => t !== tag);
      } else {
        // 如果未选中，则添加到选中列表
        return [...prev, tag];
      }
    });
  };

  // 只有管理员认证后且设置启用时才显示
  if (!enabled) {
    return null;
  }

  const hasActiveFilters = selectedTags.length > 0 || selectedYear || selectedMonth;
  const tagOptions = [
    {
      key: '__no_tags__',
      label: `📝 无标签 (${effectiveFilterMeta.untaggedEntryCount})`,
      selected: selectedTags.includes('__no_tags__'),
      onSelect: () => toggleTag('__no_tags__'),
    },
    ...effectiveFilterMeta.availableTags.map((tag) => ({
      key: tag,
      label: `#${tag}`,
      selected: selectedTags.includes(tag),
      onSelect: () => toggleTag(tag),
    })),
  ];
  const yearOptions = [
    {
      key: '__all_years__',
      label: '所有年份',
      selected: !selectedYear,
      onSelect: () => {
        setSelectedYear('');
        setIsYearDropdownOpen(false);
      },
    },
    ...effectiveFilterMeta.availableYears.map((year) => ({
      key: year,
      label: `${year}年`,
      selected: selectedYear === year,
      onSelect: () => {
        setSelectedYear(year);
        setIsYearDropdownOpen(false);
      },
    })),
  ];
  const monthOptions = [
    {
      key: '__all_months__',
      label: '所有月份',
      selected: !selectedMonth,
      onSelect: () => {
        setSelectedMonth('');
        setIsMonthDropdownOpen(false);
      },
    },
    ...(selectedYear
      ? effectiveFilterMeta.availableMonthsByYear[selectedYear] || []
      : effectiveFilterMeta.availableMonths || []).map((month) => ({
      key: month,
      label: `${parseInt(month, 10)}月`,
      selected: selectedMonth === month,
      onSelect: () => {
        setSelectedMonth(month);
        setIsMonthDropdownOpen(false);
      },
    })),
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className={`${isMobile ? 'text-sm' : 'text-base'} font-medium`} style={{ color: theme.colors.text }}>
            快速筛选
          </h3>
          <span
            className="rounded-full px-2 py-1 text-[11px]"
            style={{
              backgroundColor: theme.mode === 'dark' ? '#374151' : '#f3f4f6',
              color: theme.colors.textSecondary,
              border: `1px solid ${theme.colors.border}`,
            }}
          >
            {hasActiveFilters ? '按标签和时间收窄结果' : '轻量浏览'}
          </span>
        </div>
        {hasActiveFilters && (
          <button
            type="button"
            onClick={handleClearAll}
            className={`flex items-center gap-1 rounded-full transition-colors ${isMobile ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-sm'}`}
            style={{
              backgroundColor: theme.mode === 'dark'
                ? '#374151'
                : '#eff6ff',
              color: theme.mode === 'dark'
                ? '#f9fafb'
                : '#3b82f6',
              border: `1px solid ${theme.mode === 'dark' ? '#4b5563' : '#bfdbfe'}`,
            }}
          >
            <X className="w-3 h-3" />
            清除筛选
          </button>
        )}
      </div>

      <div className={`grid gap-3 ${isMobile ? 'grid-cols-2' : 'grid-cols-3 gap-4'}`}>
        <div className={isMobile ? 'col-span-2' : undefined}>
          <QuickFilterDropdown
            label={
              <>
                <Tag className="w-4 h-4" />
                标签 {selectedTags.length > 0 && `(${selectedTags.length})`}
              </>
            }
            triggerLabel={
              selectedTags.length === 0
                ? '选择标签...'
                : selectedTags.length === 1
                  ? (selectedTags[0] === '__no_tags__' ? '📝 无标签' : `#${selectedTags[0]}`)
                  : `已选择 ${selectedTags.length} 个标签`
            }
            isOpen={isTagDropdownOpen}
            isMobile={isMobile}
            theme={theme}
            dropdownRef={tagDropdownRef}
            onToggle={() => setIsTagDropdownOpen(!isTagDropdownOpen)}
            options={tagOptions}
            emptyState={effectiveFilterMeta.availableTags.length === 0 && effectiveFilterMeta.untaggedEntryCount === 0 ? (
              <div
                className="px-3 py-2 text-center text-sm opacity-60"
                style={{ color: theme.colors.textSecondary }}
              >
                暂无可用标签
              </div>
            ) : undefined}
          />
        </div>

        <QuickFilterDropdown
          label={
            <>
              <Calendar className="w-4 h-4" />
              年份
            </>
          }
          triggerLabel={selectedYear ? `${selectedYear}年` : '所有年份'}
          isOpen={isYearDropdownOpen}
          isMobile={isMobile}
          theme={theme}
          dropdownRef={yearDropdownRef}
          onToggle={() => {
            setIsYearDropdownOpen(!isYearDropdownOpen);
            setIsTagDropdownOpen(false);
            setIsMonthDropdownOpen(false);
          }}
          options={yearOptions}
        />

        <QuickFilterDropdown
          label={
            <>
              <Calendar className="w-4 h-4" />
              月份
            </>
          }
          triggerLabel={selectedMonth ? `${parseInt(selectedMonth, 10)}月` : '所有月份'}
          isOpen={isMonthDropdownOpen}
          isMobile={isMobile}
          theme={theme}
          dropdownRef={monthDropdownRef}
          onToggle={() => {
            setIsMonthDropdownOpen(!isMonthDropdownOpen);
            setIsTagDropdownOpen(false);
            setIsYearDropdownOpen(false);
          }}
          options={monthOptions}
        />
      </div>

      {hasActiveFilters && (
        <div className="flex flex-wrap gap-2">
          {selectedTags.map((tag) => (
            <ActiveFilterChip
              key={tag}
              icon={<Tag className="w-3 h-3" />}
              label={tag === '__no_tags__' ? '📝 无标签' : `#${tag}`}
              isMobile={isMobile}
              theme={theme}
              onRemove={() => toggleTag(tag)}
            />
          ))}
          {selectedYear && (
            <ActiveFilterChip
              icon={<Calendar className="w-3 h-3" />}
              label={`${selectedYear}年`}
              isMobile={isMobile}
              theme={theme}
              onRemove={() => setSelectedYear('')}
            />
          )}
          {selectedMonth && (
            <ActiveFilterChip
              icon={<Calendar className="w-3 h-3" />}
              label={`${parseInt(selectedMonth, 10)}月`}
              isMobile={isMobile}
              theme={theme}
              onRemove={() => setSelectedMonth('')}
            />
          )}
        </div>
      )}
    </div>
  );
}
