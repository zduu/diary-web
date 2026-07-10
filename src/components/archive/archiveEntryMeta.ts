import { parseTimeString } from '../../utils/timeUtils.ts';
import { sanitizeEntryMood, sanitizeEntryWeather } from '../../utils/entryTextValidation.ts';

const archiveMoodEmojis: Record<string, string> = {
  happy: '😊',
  sad: '😢',
  neutral: '😐',
  excited: '🤩',
  anxious: '😰',
  peaceful: '😌',
};

const archiveWeatherEmojis: Record<string, string> = {
  sunny: '☀️',
  cloudy: '☁️',
  rainy: '🌧️',
  snowy: '❄️',
};

function formatArchiveEntryDate(dateString?: string | null) {
  const date = parseTimeString(dateString);
  if (!date) {
    return '日期未知';
  }

  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

function formatArchiveEntryTime(dateString?: string | null) {
  const date = parseTimeString(dateString);
  if (!date) {
    return '--:--';
  }

  return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
}

function getArchiveMoodDisplay(mood: string) {
  return archiveMoodEmojis[mood] || '😐';
}

function getArchiveWeatherDisplay(weather: string) {
  return archiveWeatherEmojis[weather] || '';
}

export function getArchiveEntryTimestamp(dateString?: string | null) {
  return {
    dateLabel: formatArchiveEntryDate(dateString),
    timeLabel: formatArchiveEntryTime(dateString),
  };
}

export function getArchiveEntryIndicators(mood?: unknown, weather?: unknown) {
  const safeMood = sanitizeEntryMood(mood);
  const safeWeather = sanitizeEntryWeather(weather);

  return {
    moodDisplay: safeMood !== 'neutral' ? getArchiveMoodDisplay(safeMood) : null,
    weatherDisplay: safeWeather !== 'unknown' ? getArchiveWeatherDisplay(safeWeather) : null,
  };
}
