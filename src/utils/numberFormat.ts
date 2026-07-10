export function formatMeters(value?: number | null) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? `${value.toFixed(1)}米` : '未知';
}

export function formatPositiveIntegerCount(value?: number | null, unit = '') {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? `${value}${unit}` : '未知';
}
