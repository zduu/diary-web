import type { ChangeEvent, FormEvent } from 'react';
import type { ThemeConfig } from '../../hooks/useTheme';
import type { DiaryEntry } from '../../types/index.ts';

export interface AdminPanelProps {
  isOpen: boolean;
  onClose: () => void;
  entries: DiaryEntry[];
  onEntriesUpdate: () => void;
  onSessionChange?: (session: { isAuthenticated: boolean; isAdminAuthenticated: boolean }) => void;
  onInterfaceSettingsChange?: () => void | Promise<void>;
  onDeleteEntry?: (entryId: number) => Promise<void>;
  onEdit?: (entry: DiaryEntry) => void;
}

export interface AdminSettings {
  passwordProtection: boolean;
  adminPasswordConfigured: boolean;
  showHiddenEntries: boolean;
  welcomePageEnabled: boolean;
}

export interface ToggleSetting {
  enabled: boolean;
}

export interface PasswordSettings extends ToggleSetting {
  configured: boolean;
}

export type InterfaceFeatureKey =
  | 'quickFilters'
  | 'export'
  | 'archiveView'
  | 'recommendations'
  | 'browseStatus'
  | 'deviceStatus';

export type AdminInterfaceSettings = Record<InterfaceFeatureKey, ToggleSetting>;

export type OperationState = 'idle' | 'hiding' | 'showing' | 'deleting';
export type AdminEntryOperationStateGetter = (entryId: number) => OperationState;

export type ConfirmState =
  | { type: 'logout' }
  | { type: 'delete'; entryId: number; entryTitle: string };

export interface NotificationState {
  message: string;
  type: 'success' | 'error';
  visible: boolean;
}

export type AdminTextColorGetter = (type?: 'primary' | 'secondary') => string;

export interface AdminLoginViewProps {
  passwordInput: string;
  onPasswordInputChange: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
  theme: ThemeConfig;
  getTextColor: AdminTextColorGetter;
}

export interface AdminEntriesSectionProps {
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  filteredEntries: DiaryEntry[];
  entryTimestampLabels: Record<number, string>;
  theme: ThemeConfig;
  getTextColor: AdminTextColorGetter;
  getOperationState: AdminEntryOperationStateGetter;
  onEditEntry?: (entry: DiaryEntry) => void;
  onToggleVisibility: (entryId: number) => void;
  onDeleteEntry: (entryId: number) => void;
}

export interface AdminPanelHeaderActionsProps {
  isAuthenticated: boolean;
  onLogout: () => void;
}

export interface AdminAuthenticatedSettingsState {
  settings: AdminSettings;
  showPasswordSettings: boolean;
  passwordSettings: PasswordSettings;
  showAppPasswordSettings: boolean;
  newAppPassword: string;
  newPassword: string;
  interfaceSettings: AdminInterfaceSettings;
}

export interface AdminAuthenticatedEntriesState {
  searchQuery: string;
  filteredEntries: DiaryEntry[];
  entryTimestampLabels: Record<number, string>;
}

export interface AdminAuthenticatedActions {
  onExportEntries: () => void;
  onImportEntries: (event: ChangeEvent<HTMLInputElement>) => void;
  onTogglePasswordSettings: () => void;
  onToggleHiddenEntries: () => void;
  onToggleWelcomePage: () => void;
  onToggleAppPasswordProtection: () => void;
  onToggleAppPasswordSettings: () => void;
  onNewAppPasswordChange: (value: string) => void;
  onAppPasswordChange: () => void;
  onToggleInterfaceSetting: (key: InterfaceFeatureKey) => void;
  onNewPasswordChange: (value: string) => void;
  onPasswordChange: () => void;
  onSearchQueryChange: (value: string) => void;
  onEditEntry?: (entry: DiaryEntry) => void;
  onToggleVisibility: (entryId: number) => void;
  onDeleteEntry: (entryId: number) => void;
}

export interface AdminAuthenticatedViewProps {
  theme: ThemeConfig;
  getTextColor: AdminTextColorGetter;
  getOperationState: AdminEntryOperationStateGetter;
  settingsState: AdminAuthenticatedSettingsState;
  entriesState: AdminAuthenticatedEntriesState;
  actions: AdminAuthenticatedActions;
}
