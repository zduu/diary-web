import { useEffect, useState } from 'react';
import { apiService } from '../services/api';
import type { PublicSettingsResponse } from '../services/apiTypes.ts';
import { createPublicSettingsResponse } from '../services/publicSettingsSchema.ts';
import { debugError } from '../utils/logger.ts';

interface ToggleSetting {
  enabled: boolean;
}

interface InterfaceSettings {
  quickFilters: ToggleSetting;
  export: ToggleSetting;
  archiveView: ToggleSetting;
  welcomePage: ToggleSetting;
  passwordProtection: ToggleSetting;
  recommendations: ToggleSetting;
  browseStatus: ToggleSetting;
  deviceStatus: ToggleSetting;
}

function createToggleSetting(enabled: boolean): ToggleSetting {
  return { enabled };
}

function createInterfaceSettings(publicSettings: PublicSettingsResponse): InterfaceSettings {
  return {
    quickFilters: createToggleSetting(publicSettings.quickFiltersEnabled),
    export: createToggleSetting(publicSettings.exportEnabled),
    archiveView: createToggleSetting(publicSettings.archiveViewEnabled),
    welcomePage: createToggleSetting(publicSettings.welcomePageEnabled),
    passwordProtection: createToggleSetting(publicSettings.passwordProtectionEnabled),
    recommendations: createToggleSetting(publicSettings.recommendationsEnabled),
    browseStatus: createToggleSetting(publicSettings.browseStatusEnabled),
    deviceStatus: createToggleSetting(publicSettings.deviceStatusEnabled),
  };
}

const defaultSettings = createInterfaceSettings(createPublicSettingsResponse({}));

export function useInterfaceSettings() {
  const [settings, setSettings] = useState<InterfaceSettings>(defaultSettings);
  const [loading, setLoading] = useState(true);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const publicSettings = await apiService.getPublicSettings();
      setSettings(createInterfaceSettings(publicSettings));
    } catch (error) {
      debugError('获取界面设置失败:', error);
      setSettings(defaultSettings);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  return {
    settings,
    loading,
    refreshSettings: loadSettings,
  };
}
