import type { PublicSettingsResponse } from './apiTypes.ts';

export const publicBooleanSettingDefaults = {
  app_password_enabled: false,
  quick_filters_enabled: true,
  export_enabled: true,
  archive_view_enabled: true,
  welcome_page_enabled: true,
  recommendations_enabled: true,
  browse_status_enabled: true,
  device_status_enabled: true,
} as const;

export type PublicBooleanSettingKey = keyof typeof publicBooleanSettingDefaults;
type PublicBooleanSettingValues = Partial<Record<PublicBooleanSettingKey, string | boolean | null | undefined>>;

export const publicBooleanSettingKeys = Object.keys(publicBooleanSettingDefaults) as PublicBooleanSettingKey[];

export const publicBooleanSettingStorageDefaults: Record<PublicBooleanSettingKey, string> = Object.fromEntries(
  publicBooleanSettingKeys.map((key) => [key, publicBooleanSettingDefaults[key] ? 'true' : 'false'])
) as Record<PublicBooleanSettingKey, string>;

const publicSettingResponseFields: Record<PublicBooleanSettingKey, keyof PublicSettingsResponse> = {
  app_password_enabled: 'passwordProtectionEnabled',
  quick_filters_enabled: 'quickFiltersEnabled',
  export_enabled: 'exportEnabled',
  archive_view_enabled: 'archiveViewEnabled',
  welcome_page_enabled: 'welcomePageEnabled',
  recommendations_enabled: 'recommendationsEnabled',
  browse_status_enabled: 'browseStatusEnabled',
  device_status_enabled: 'deviceStatusEnabled',
};

export function isPublicBooleanSettingKey(key: string): key is PublicBooleanSettingKey {
  return key in publicBooleanSettingDefaults;
}

export function isStoredBooleanString(value: string | null | undefined): value is 'true' | 'false' {
  return value === 'true' || value === 'false';
}

export function normalizePublicBooleanSettingValue(
  value: string | boolean | null | undefined,
  fallback: boolean
): boolean {
  if (typeof value === 'boolean') {
    return value;
  }

  if (value === 'true') {
    return true;
  }

  if (value === 'false') {
    return false;
  }

  return fallback;
}

export function createPublicSettingsResponse(
  settings: PublicBooleanSettingValues
): PublicSettingsResponse {
  const response = {} as PublicSettingsResponse;

  for (const key of publicBooleanSettingKeys) {
    response[publicSettingResponseFields[key]] = normalizePublicBooleanSettingValue(
      settings[key],
      publicBooleanSettingDefaults[key]
    );
  }

  return response;
}

export function getPublicBooleanSettingStoredValue(
  settings: Partial<Record<PublicBooleanSettingKey, string | null | undefined>>,
  key: PublicBooleanSettingKey
): string {
  const value = settings[key];
  if (isStoredBooleanString(value)) {
    return value;
  }

  return publicBooleanSettingDefaults[key] ? 'true' : 'false';
}

export function applyPublicSettingsMutation(
  previousSettings: PublicSettingsResponse,
  key: string,
  value: string
): PublicSettingsResponse {
  if (!isPublicBooleanSettingKey(key)) {
    return previousSettings;
  }

  return {
    ...previousSettings,
    [publicSettingResponseFields[key]]: value === 'true',
  } as PublicSettingsResponse;
}
