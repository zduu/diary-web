export interface SessionState {
  isAuthenticated: boolean;
  isAdminAuthenticated: boolean;
}

export interface PublicSettingsResponse {
  passwordProtectionEnabled: boolean;
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
}
