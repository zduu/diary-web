import { describe, expect, it } from 'vitest';
import { getArchiveTimeLabel } from './archiveGroupingLabels';

describe('archiveGroupingLabels', () => {
  it('falls back to the entry date when natural year keys are invalid', () => {
    const date = new Date('2026-04-14T09:00:00.000Z');

    expect(getArchiveTimeLabel(date, 'year', 'NaN', true)).toBe('2026年');
  });

  it('falls back to the entry date when natural month keys are invalid', () => {
    const date = new Date('2026-04-14T09:00:00.000Z');

    expect(getArchiveTimeLabel(date, 'month', '2026-NaN', true)).toBe('2026年4月');
    expect(getArchiveTimeLabel(date, 'month', '2026-13', true)).toBe('2026年4月');
  });
});
