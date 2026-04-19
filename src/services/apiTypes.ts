export interface SessionState {
  isAuthenticated: boolean;
  isAdminAuthenticated: boolean;
}

export interface AdminAccessProfile {
  mode: 'local' | 'remote';
  requiresPassword: boolean;
  remoteBound: boolean;
  remoteSyncConfigured: boolean;
  remoteSyncBaseUrl: string;
}

export interface RemoteBindingInput {
  baseUrl: string;
  syncToken: string;
  adminPassword: string;
  syncLocalEntries: boolean;
}

export interface PublicSettingsResponse {
  passwordProtectionEnabled: boolean;
  readingDeskEnabled: boolean;
  quickFiltersEnabled: boolean;
  exportEnabled: boolean;
  archiveViewEnabled: boolean;
  welcomePageEnabled: boolean;
  recommendationsEnabled: boolean;
  browseStatusEnabled: boolean;
  deviceStatusEnabled: boolean;
}

export interface AdminSettingsResponse extends PublicSettingsResponse {
  adminPasswordConfigured: boolean;
  appPasswordConfigured: boolean;
  syncAccessTokenConfigured: boolean;
}
