export function parseStoredScrollY(value: string | null) {
  const normalizedValue = value?.trim();

  if (!normalizedValue) {
    return null;
  }

  const scrollY = Number(normalizedValue);

  return Number.isFinite(scrollY) && scrollY >= 0 ? scrollY : null;
}
