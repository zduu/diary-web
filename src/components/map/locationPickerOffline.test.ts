import { describe, expect, it } from 'vitest';
import { createSmartOfflineLocation } from './locationPickerOffline';

describe('locationPickerOffline', () => {
  it('returns an unknown location without formatting invalid coordinates', () => {
    const location = createSmartOfflineLocation(Number.NaN, 181);

    expect(location).toEqual({
      name: '未知位置',
      address: '未知地址',
    });
    expect(JSON.stringify(location)).not.toMatch(/NaN|181\.0000/);
  });
});
