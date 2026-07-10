import type { ReactNode } from 'react';
import { Search, Loader } from 'lucide-react';
import { useThemeContext } from '../ThemeProvider';
import type { AMapPoi } from './amapTypes';

interface MapPickerSearchPanelProps {
  isMobile: boolean;
  searchQuery: string;
  isMapLoaded: boolean;
  isSearching: boolean;
  searchResults: AMapPoi[];
  onSearchQueryChange: (value: string) => void;
  onSearch: () => void;
  onSearchFocus: () => void;
  onSearchBlur: () => void;
  onSelectSearchResult: (poi: AMapPoi) => void;
  debugActions?: ReactNode;
}

export function MapPickerSearchPanel({
  isMobile,
  searchQuery,
  isMapLoaded,
  isSearching,
  searchResults,
  onSearchQueryChange,
  onSearch,
  onSearchFocus,
  onSearchBlur,
  onSelectSearchResult,
  debugActions,
}: MapPickerSearchPanelProps) {
  const { theme } = useThemeContext();

  return (
    <div className={`${isMobile ? 'p-3' : 'p-4'} border-b`} style={{ borderColor: theme.colors.border }}>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            type="text"
            value={searchQuery}
            onChange={(event) => onSearchQueryChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                onSearch();
              }
            }}
            onFocus={onSearchFocus}
            onBlur={onSearchBlur}
            placeholder={isMobile ? '搜索地址...' : '搜索地址、建筑物或地标...'}
            className={`w-full rounded-md border pr-10 ${isMobile ? 'px-3 py-2 text-sm' : 'px-3 py-2 text-sm'}`}
            style={{
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
              color: theme.colors.text,
            }}
            disabled={!isMapLoaded}
          />
          <Search className="absolute right-3 top-2.5 h-4 w-4" style={{ color: theme.colors.textSecondary }} />
        </div>

        <button
          onClick={onSearch}
          disabled={!searchQuery.trim() || isSearching || !isMapLoaded}
          className={`rounded-md font-medium transition-colors disabled:opacity-50 ${
            isMobile ? 'px-3 py-2 text-xs' : 'px-4 py-2 text-sm'
          }`}
          style={{
            backgroundColor: theme.colors.primary,
            color: 'white',
          }}
        >
          {isSearching ? <Loader className="h-4 w-4 animate-spin" /> : '搜索'}
        </button>

        {debugActions}
      </div>

      {searchResults.length > 0 && (
        <div className={`mt-2 overflow-y-auto ${isMobile ? 'max-h-32' : 'max-h-40'}`}>
          {searchResults.map((poi, index) => (
            <div
              key={`${poi.name || 'poi'}-${index}`}
              onClick={() => onSelectSearchResult(poi)}
              className={`${isMobile ? 'p-1.5 text-xs' : 'p-2 text-sm'} cursor-pointer rounded border-b hover:bg-gray-50 last:border-b-0`}
              style={{ borderColor: theme.colors.border }}
            >
              <div className="truncate font-medium" style={{ color: theme.colors.text }}>
                {poi.name}
              </div>
              <div className="truncate text-xs" style={{ color: theme.colors.textSecondary }}>
                {poi.address}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
