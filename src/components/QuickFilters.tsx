import { useState, useEffect, useRef } from 'react';
import { Tag, Calendar, X, ChevronDown } from 'lucide-react';
import { useThemeContext } from './ThemeProvider';
import { useAdminAuth } from './AdminPanel';
import { useQuickFiltersSettings } from '../hooks/useQuickFiltersSettings';
import { DiaryEntry } from '../types';
import { normalizeTimeString } from '../utils/timeUtils';

interface QuickFiltersProps {
  entries: DiaryEntry[];
  onFilterResults: (results: DiaryEntry[]) => void;
  onClearFilter: () => void;
}

export function QuickFilters({ entries, onFilterResults, onClearFilter }: QuickFiltersProps) {
  const { theme } = useThemeContext();
  const { isAdminAuthenticated } = useAdminAuth();
  const { settings: quickFiltersSettings, loading: settingsLoading } = useQuickFiltersSettings();
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedYear, setSelectedYear] = useState('');
  const [selectedMonth, setSelectedMonth] = useState('');
  const [isMobile, setIsMobile] = useState(false);
  const [isTagDropdownOpen, setIsTagDropdownOpen] = useState(false);
  const [isYearDropdownOpen, setIsYearDropdownOpen] = useState(false);
  const [isMonthDropdownOpen, setIsMonthDropdownOpen] = useState(false);
  const tagDropdownRef = useRef<HTMLDivElement>(null);
  const yearDropdownRef = useRef<HTMLDivElement>(null);
  const monthDropdownRef = useRef<HTMLDivElement>(null);

  // 检测是否为移动设备
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

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

  // 获取所有可用的标签
  const getAllTags = () => {
    const tagSet = new Set<string>();
    entries.forEach(entry => {
      if (!entry.hidden && entry.tags) {
        entry.tags.forEach(tag => tagSet.add(tag));
      }
    });
    return Array.from(tagSet).sort();
  };

  // 获取无标签日记的数量
  const getNoTagsCount = () => {
    return entries.filter(entry => !entry.hidden && (!entry.tags || entry.tags.length === 0)).length;
  };

  // 获取所有可用的年份
  const getAllYears = () => {
    const yearSet = new Set<string>();
    entries.forEach(entry => {
      if (!entry.hidden && entry.created_at) {
        const year = new Date(normalizeTimeString(entry.created_at)).getFullYear().toString();
        yearSet.add(year);
      }
    });
    return Array.from(yearSet).sort((a, b) => parseInt(b) - parseInt(a));
  };

  // 获取所有可用的月份（不依赖年份）
  const getAllMonths = () => {
    const monthSet = new Set<string>();
    entries.forEach(entry => {
      if (!entry.hidden && entry.created_at) {
        const entryDate = new Date(normalizeTimeString(entry.created_at));
        const month = (entryDate.getMonth() + 1).toString().padStart(2, '0');
        monthSet.add(month);
      }
    });
    return Array.from(monthSet).sort((a, b) => parseInt(b) - parseInt(a));
  };

  // 过去：按年份筛选月份的辅助函数已移除，月份列表不再依赖年份

  // 执行过滤
  const performFilter = (tags: string[], year: string, month: string) => {
    if (tags.length === 0 && !year && !month) {
      onClearFilter();
      return;
    }

    const results = entries.filter(entry => {
      // 跳过隐藏的日记
      if (entry.hidden) return false;

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
  }, [selectedTags, selectedYear, selectedMonth, entries]);

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
  if (!isAdminAuthenticated || settingsLoading || !quickFiltersSettings.enabled) {
    return null;
  }

  const hasActiveFilters = selectedTags.length > 0 || selectedYear || selectedMonth;

  return (
    <div className="space-y-4">
      {/* 快速过滤标题 */}
      <div className="flex items-center justify-between">
        <h3 className={`${isMobile ? 'text-sm' : 'text-base'} font-medium`} style={{ color: theme.colors.text }}>
          快速筛选
        </h3>
        {hasActiveFilters && (
          <button
            onClick={handleClearAll}
            className={`flex items-center gap-1 ${isMobile ? 'text-xs px-2 py-1' : 'text-sm px-3 py-1'} rounded-full transition-colors`}
            style={{
              backgroundColor: theme.mode === 'glass'
                ? 'rgba(239, 68, 68, 0.4)'
                : `${theme.colors.accent}20`,
              color: theme.mode === 'glass'
                ? '#ffffff'
                : theme.colors.accent,
              border: theme.mode === 'glass'
                ? '1px solid rgba(239, 68, 68, 0.6)'
                : `1px solid ${theme.colors.accent}40`,
              textShadow: theme.mode === 'glass' ? '0 1px 2px rgba(0, 0, 0, 0.6)' : 'none',
              backdropFilter: theme.mode === 'glass' ? 'blur(10px)' : 'none'
            }}
          >
            <X className="w-3 h-3" />
            清除筛选
          </button>
        )}
      </div>

      {/* 过滤选项 */}
      <div className={`grid ${isMobile ? 'grid-cols-1 gap-3' : 'grid-cols-3 gap-4'}`}>
        {/* 标签过滤 */}
        <div className="space-y-2" ref={tagDropdownRef}>
          <label className={`${isMobile ? 'text-xs' : 'text-sm'} font-medium flex items-center gap-2`} style={{ color: theme.colors.text }}>
            <Tag className="w-4 h-4" />
            标签 {selectedTags.length > 0 && `(${selectedTags.length})`}
          </label>
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsTagDropdownOpen(!isTagDropdownOpen)}
              className={`w-full ${isMobile ? 'px-2 py-1.5 text-sm' : 'px-3 py-2'} rounded border focus:outline-none focus:ring-2 transition-all text-left flex items-center justify-between`}
              style={{
                backgroundColor: theme.mode === 'glass'
                  ? 'rgba(71, 85, 105, 0.7)'
                  : theme.colors.surface,
                borderColor: theme.mode === 'glass'
                  ? 'rgba(99, 102, 241, 0.4)'
                  : theme.colors.border,
                color: theme.mode === 'glass' ? 'white' : theme.colors.text,
                textShadow: theme.mode === 'glass' ? '0 1px 2px rgba(0, 0, 0, 0.5)' : 'none',
                backdropFilter: theme.mode === 'glass' ? 'blur(10px)' : 'none',
                '--tw-ring-color': theme.colors.primary,
              } as React.CSSProperties}
            >
              <span className="truncate">
                {selectedTags.length === 0
                  ? '选择标签...'
                  : selectedTags.length === 1
                    ? selectedTags[0] === '__no_tags__' ? '📝 无标签' : `#${selectedTags[0]}`
                    : `已选择 ${selectedTags.length} 个标签`
                }
              </span>
              <ChevronDown className={`w-4 h-4 transition-transform ${isTagDropdownOpen ? 'rotate-180' : ''}`} />
            </button>

            {isTagDropdownOpen && (
              <div
                className="absolute z-50 w-full mt-1 rounded border shadow-lg max-h-60 overflow-y-auto"
                style={{
                  backgroundColor: theme.mode === 'glass'
                    ? 'rgba(99, 102, 241, 0.25)'
                    : theme.colors.surface,
                  borderColor: theme.mode === 'glass'
                    ? 'rgba(99, 102, 241, 0.5)'
                    : theme.colors.border,
                  backdropFilter: theme.mode === 'glass' ? 'blur(20px)' : 'none',
                  boxShadow: theme.mode === 'glass' ? '0 8px 32px rgba(0, 0, 0, 0.3), 0 0 15px rgba(99, 102, 241, 0.3)' : 'none',
                }}
              >
                {/* 无标签选项 */}
                <button
                  type="button"
                  onClick={() => toggleTag('__no_tags__')}
                  className={`w-full px-3 py-2 text-left hover:bg-opacity-80 transition-colors flex items-center justify-between ${isMobile ? 'text-sm' : ''}`}
                  style={{
                    backgroundColor: selectedTags.includes('__no_tags__')
                      ? (theme.mode === 'glass' ? 'rgba(255, 255, 255, 0.2)' : `${theme.colors.primary}20`)
                      : 'transparent',
                    color: theme.mode === 'glass' ? '#ffffff' : theme.colors.text,
                    textShadow: theme.mode === 'glass' ? '0 1px 2px rgba(0, 0, 0, 0.5)' : 'none',
                  }}
                >
                  <span>📝 无标签 ({getNoTagsCount()})</span>
                  {selectedTags.includes('__no_tags__') && (
                    <div
                      className="w-4 h-4 rounded-full flex items-center justify-center text-xs font-bold text-white"
                      style={{ backgroundColor: theme.colors.primary }}
                    >
                      ✓
                    </div>
                  )}
                </button>

                {/* 标签选项 */}
                {getAllTags().map(tag => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleTag(tag)}
                    className={`w-full px-3 py-2 text-left hover:bg-opacity-80 transition-colors flex items-center justify-between ${isMobile ? 'text-sm' : ''}`}
                    style={{
                      backgroundColor: selectedTags.includes(tag)
                        ? (theme.mode === 'glass' ? 'rgba(255, 255, 255, 0.2)' : `${theme.colors.primary}20`)
                        : 'transparent',
                      color: theme.mode === 'glass' ? '#ffffff' : theme.colors.text,
                      textShadow: theme.mode === 'glass' ? '0 1px 2px rgba(0, 0, 0, 0.5)' : 'none',
                    }}
                  >
                    <span>#{tag}</span>
                    {selectedTags.includes(tag) && (
                      <div
                        className="w-4 h-4 rounded-full flex items-center justify-center text-xs font-bold text-white"
                        style={{ backgroundColor: theme.colors.primary }}
                      >
                        ✓
                      </div>
                    )}
                  </button>
                ))}

                {getAllTags().length === 0 && getNoTagsCount() === 0 && (
                  <div
                    className="px-3 py-2 text-center text-sm opacity-60"
                    style={{ color: theme.mode === 'glass' ? '#6b7280' : theme.colors.textSecondary }}
                  >
                    暂无可用标签
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* 年份过滤 */}
        <div className="space-y-2" ref={yearDropdownRef}>
          <label className={`${isMobile ? 'text-xs' : 'text-sm'} font-medium flex items-center gap-2`} style={{ color: theme.colors.text }}>
            <Calendar className="w-4 h-4" />
            年份
          </label>
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setIsYearDropdownOpen(!isYearDropdownOpen);
                setIsTagDropdownOpen(false);
                setIsMonthDropdownOpen(false);
              }}
              className={`w-full ${isMobile ? 'px-2 py-1.5 text-sm' : 'px-3 py-2'} rounded border focus:outline-none focus:ring-2 transition-all text-left flex items-center justify-between`}
              style={{
                backgroundColor: theme.mode === 'glass'
                  ? 'rgba(71, 85, 105, 0.7)'
                  : theme.colors.surface,
                borderColor: theme.mode === 'glass'
                  ? 'rgba(99, 102, 241, 0.4)'
                  : theme.colors.border,
                color: theme.mode === 'glass' ? 'white' : theme.colors.text,
                textShadow: theme.mode === 'glass' ? '0 1px 2px rgba(0, 0, 0, 0.5)' : 'none',
                backdropFilter: theme.mode === 'glass' ? 'blur(10px)' : 'none',
                '--tw-ring-color': theme.colors.primary,
              } as React.CSSProperties}
            >
              <span className="truncate">
                {selectedYear ? `${selectedYear}年` : '所有年份'}
              </span>
              <ChevronDown className={`w-4 h-4 transition-transform ${isYearDropdownOpen ? 'rotate-180' : ''}`} />
            </button>

            {isYearDropdownOpen && (
              <div
                className="absolute z-50 w-full mt-1 rounded border shadow-lg max-h-60 overflow-y-auto"
                style={{
                  backgroundColor: theme.mode === 'glass'
                    ? 'rgba(99, 102, 241, 0.25)'
                    : theme.colors.surface,
                  borderColor: theme.mode === 'glass'
                    ? 'rgba(99, 102, 241, 0.5)'
                    : theme.colors.border,
                  backdropFilter: theme.mode === 'glass' ? 'blur(20px)' : 'none',
                  boxShadow: theme.mode === 'glass' ? '0 8px 32px rgba(0, 0, 0, 0.3), 0 0 15px rgba(99, 102, 241, 0.3)' : 'none',
                }}
              >
                {/* 清除年份 */}
                <button
                  type="button"
                  onClick={() => {
                    setSelectedYear('');
                    setIsYearDropdownOpen(false);
                  }}
                  className={`w-full px-3 py-2 text-left hover:bg-opacity-80 transition-colors flex items-center justify-between ${isMobile ? 'text-sm' : ''}`}
                  style={{
                    backgroundColor: !selectedYear
                      ? (theme.mode === 'glass' ? 'rgba(255, 255, 255, 0.2)' : `${theme.colors.primary}20`)
                      : 'transparent',
                    color: theme.mode === 'glass' ? '#ffffff' : theme.colors.text,
                    textShadow: theme.mode === 'glass' ? '0 1px 2px rgba(0, 0, 0, 0.5)' : 'none',
                  }}
                >
                  <span>所有年份</span>
                  {!selectedYear && (
                    <div
                      className="w-4 h-4 rounded-full flex items-center justify-center text-xs font-bold text-white"
                      style={{ backgroundColor: theme.colors.primary }}
                    >
                      ✓
                    </div>
                  )}
                </button>

                {/* 年份选项 */}
                {getAllYears().map(year => (
                  <button
                    key={year}
                    type="button"
                    onClick={() => {
                      setSelectedYear(year);
                      setIsYearDropdownOpen(false);
                    }}
                    className={`w-full px-3 py-2 text-left hover:bg-opacity-80 transition-colors flex items-center justify-between ${isMobile ? 'text-sm' : ''}`}
                    style={{
                      backgroundColor: selectedYear === year
                        ? (theme.mode === 'glass' ? 'rgba(255, 255, 255, 0.2)' : `${theme.colors.primary}20`)
                        : 'transparent',
                      color: theme.mode === 'glass' ? '#ffffff' : theme.colors.text,
                      textShadow: theme.mode === 'glass' ? '0 1px 2px rgba(0, 0, 0, 0.5)' : 'none',
                    }}
                  >
                    <span>{year}年</span>
                    {selectedYear === year && (
                      <div
                        className="w-4 h-4 rounded-full flex items-center justify-center text-xs font-bold text-white"
                        style={{ backgroundColor: theme.colors.primary }}
                      >
                        ✓
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 月份过滤 */}
        <div className="space-y-2" ref={monthDropdownRef}>
          <label className={`${isMobile ? 'text-xs' : 'text-sm'} font-medium flex items-center gap-2`} style={{ color: theme.colors.text }}>
            <Calendar className="w-4 h-4" />
            月份
          </label>
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setIsMonthDropdownOpen(!isMonthDropdownOpen);
                setIsTagDropdownOpen(false);
                setIsYearDropdownOpen(false);
              }}
              className={`w-full ${isMobile ? 'px-2 py-1.5 text-sm' : 'px-3 py-2'} rounded border focus:outline-none focus:ring-2 transition-all text-left flex items-center justify-between`}
              style={{
                backgroundColor: theme.mode === 'glass'
                  ? 'rgba(71, 85, 105, 0.7)'
                  : theme.colors.surface,
                borderColor: theme.mode === 'glass'
                  ? 'rgba(99, 102, 241, 0.4)'
                  : theme.colors.border,
                color: theme.mode === 'glass' ? 'white' : theme.colors.text,
                textShadow: theme.mode === 'glass' ? '0 1px 2px rgba(0, 0, 0, 0.5)' : 'none',
                backdropFilter: theme.mode === 'glass' ? 'blur(10px)' : 'none',
                '--tw-ring-color': theme.colors.primary,
              } as React.CSSProperties}
            >
              <span className="truncate">
                {selectedMonth ? `${parseInt(selectedMonth)}月` : '所有月份'}
              </span>
              <ChevronDown className={`w-4 h-4 transition-transform ${isMonthDropdownOpen ? 'rotate-180' : ''}`} />
            </button>

            {isMonthDropdownOpen && (
              <div
                className="absolute z-50 w-full mt-1 rounded border shadow-lg max-h-60 overflow-y-auto"
                style={{
                  backgroundColor: theme.mode === 'glass'
                    ? 'rgba(99, 102, 241, 0.25)'
                    : theme.colors.surface,
                  borderColor: theme.mode === 'glass'
                    ? 'rgba(99, 102, 241, 0.5)'
                    : theme.colors.border,
                  backdropFilter: theme.mode === 'glass' ? 'blur(20px)' : 'none',
                  boxShadow: theme.mode === 'glass' ? '0 8px 32px rgba(0, 0, 0, 0.3), 0 0 15px rgba(99, 102, 241, 0.3)' : 'none',
                }}
              >
                {/* 清除月份 */}
                <button
                  type="button"
                  onClick={() => {
                    setSelectedMonth('');
                    setIsMonthDropdownOpen(false);
                  }}
                  className={`w-full px-3 py-2 text-left hover:bg-opacity-80 transition-colors flex items-center justify-between ${isMobile ? 'text-sm' : ''}`}
                  style={{
                    backgroundColor: !selectedMonth
                      ? (theme.mode === 'glass' ? 'rgba(255, 255, 255, 0.2)' : `${theme.colors.primary}20`)
                      : 'transparent',
                    color: theme.mode === 'glass' ? '#ffffff' : theme.colors.text,
                    textShadow: theme.mode === 'glass' ? '0 1px 2px rgba(0, 0, 0, 0.5)' : 'none',
                  }}
                >
                  <span>所有月份</span>
                  {!selectedMonth && (
                    <div
                      className="w-4 h-4 rounded-full flex items-center justify-center text-xs font-bold text-white"
                      style={{ backgroundColor: theme.colors.primary }}
                    >
                      ✓
                    </div>
                  )}
                </button>

                {/* 月份选项 */}
                {getAllMonths().map(month => (
                  <button
                    key={month}
                    type="button"
                    onClick={() => {
                      setSelectedMonth(month);
                      setIsMonthDropdownOpen(false);
                    }}
                    className={`w-full px-3 py-2 text-left hover:bg-opacity-80 transition-colors flex items-center justify-between ${isMobile ? 'text-sm' : ''}`}
                    style={{
                      backgroundColor: selectedMonth === month
                        ? (theme.mode === 'glass' ? 'rgba(255, 255, 255, 0.2)' : `${theme.colors.primary}20`)
                        : 'transparent',
                      color: theme.mode === 'glass' ? '#ffffff' : theme.colors.text,
                      textShadow: theme.mode === 'glass' ? '0 1px 2px rgba(0, 0, 0, 0.5)' : 'none',
                    }}
                  >
                    <span>{parseInt(month)}月</span>
                    {selectedMonth === month && (
                      <div
                        className="w-4 h-4 rounded-full flex items-center justify-center text-xs font-bold text-white"
                        style={{ backgroundColor: theme.colors.primary }}
                      >
                        ✓
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 活跃过滤器显示 */}
      {hasActiveFilters && (
        <div className="flex flex-wrap gap-2">
          {selectedTags.map(tag => (
            <span
              key={tag}
              className={`flex items-center gap-1 ${isMobile ? 'text-xs px-2 py-1' : 'text-sm px-3 py-1'} rounded-full`}
              style={{
                backgroundColor: theme.mode === 'glass'
                  ? 'rgba(99, 102, 241, 0.4)'
                  : `${theme.colors.primary}20`,
                color: theme.mode === 'glass'
                  ? '#ffffff'
                  : theme.colors.primary,
                border: theme.mode === 'glass'
                  ? '1px solid rgba(99, 102, 241, 0.6)'
                  : `1px solid ${theme.colors.primary}40`,
                textShadow: theme.mode === 'glass' ? '0 1px 2px rgba(0, 0, 0, 0.6)' : 'none',
                backdropFilter: theme.mode === 'glass' ? 'blur(10px)' : 'none'
              }}
            >
              <Tag className="w-3 h-3" />
              {tag === '__no_tags__' ? '📝 无标签' : `#${tag}`}
              <button
                onClick={() => toggleTag(tag)}
                className="hover:opacity-80 transition-opacity"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
          {selectedYear && (
            <span
              className={`flex items-center gap-1 ${isMobile ? 'text-xs px-2 py-1' : 'text-sm px-3 py-1'} rounded-full`}
              style={{
                backgroundColor: theme.mode === 'glass'
                  ? 'rgba(99, 102, 241, 0.4)'
                  : `${theme.colors.primary}20`,
                color: theme.mode === 'glass'
                  ? '#ffffff'
                  : theme.colors.primary,
                border: theme.mode === 'glass'
                  ? '1px solid rgba(99, 102, 241, 0.6)'
                  : `1px solid ${theme.colors.primary}40`,
                textShadow: theme.mode === 'glass' ? '0 1px 2px rgba(0, 0, 0, 0.6)' : 'none',
                backdropFilter: theme.mode === 'glass' ? 'blur(10px)' : 'none'
              }}
            >
              <Calendar className="w-3 h-3" />
              {selectedYear}年
              <button
                onClick={() => setSelectedYear('')}
                className="hover:opacity-80 transition-opacity"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}
          {selectedMonth && (
            <span
              className={`flex items-center gap-1 ${isMobile ? 'text-xs px-2 py-1' : 'text-sm px-3 py-1'} rounded-full`}
              style={{
                backgroundColor: theme.mode === 'glass'
                  ? 'rgba(99, 102, 241, 0.4)'
                  : `${theme.colors.primary}20`,
                color: theme.mode === 'glass'
                  ? '#ffffff'
                  : theme.colors.primary,
                border: theme.mode === 'glass'
                  ? '1px solid rgba(99, 102, 241, 0.6)'
                  : `1px solid ${theme.colors.primary}40`,
                textShadow: theme.mode === 'glass' ? '0 1px 2px rgba(0, 0, 0, 0.6)' : 'none',
                backdropFilter: theme.mode === 'glass' ? 'blur(10px)' : 'none'
              }}
            >
              <Calendar className="w-3 h-3" />
              {parseInt(selectedMonth)}月
              <button
                onClick={() => setSelectedMonth('')}
                className="hover:opacity-80 transition-opacity"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}
        </div>
      )}
    </div>
  );
}
