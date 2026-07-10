export interface POI {
  name: string;
  type: string;
  distance: number;
}

export interface LocationDetails {
  building?: string;
  house_number?: string;
  road?: string;
  neighbourhood?: string;
  suburb?: string;
  city?: string;
  state?: string;
  country?: string;
}

export interface LocationCoordinate {
  latitude: number;
  longitude: number;
}

export interface LocationCoordinateOffset extends LocationCoordinate {
  distance: number;
}

export interface LocationHighAccuracyMeta {
  accuracy?: number;
  confidence: 'high' | 'medium' | 'low';
  attempts: number;
  coordinateOffset?: LocationCoordinateOffset;
}

export interface LocationInfo {
  name?: string;
  latitude?: number;
  longitude?: number;
  address?: string;
  nearbyPOIs?: POI[];
  details?: LocationDetails;
  originalGPS?: LocationCoordinate;
  coordinateOffset?: LocationCoordinateOffset;
  highAccuracy?: LocationHighAccuracyMeta;
}

export type EntrySyncState =
  | 'synced'
  | 'pending_create'
  | 'pending_update'
  | 'pending_delete'
  | 'conflict';

export interface DiaryEntry {
  id?: number;
  entry_uuid?: string;
  title: string;
  content: string;
  content_type?: 'markdown' | 'plain';
  mood?: string;
  weather?: string;
  images?: string[];
  location?: LocationInfo | null;
  created_at?: string;
  updated_at?: string;
  last_synced_at?: string | null;
  deleted_at?: string | null;
  sync_state?: EntrySyncState;
  tags?: string[];
  hidden?: boolean;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export type MoodType = 'happy' | 'sad' | 'neutral' | 'excited' | 'anxious' | 'peaceful' | 'calm' | 'angry' | 'grateful' | 'loved';
export type WeatherType = 'sunny' | 'cloudy' | 'rainy' | 'snowy' | 'unknown';

export interface DiaryStats {
  consecutive_days: number;        // 连续日记多少天
  total_days_with_entries: number; // 一共日记多少天
  total_entries: number;          // 多少篇日记
  latest_entry_date: string | null; // 最近日记时间
  first_entry_date: string | null;  // 第一篇日记时间
  current_streak_start: string | null; // 当前连续记录开始时间
}
