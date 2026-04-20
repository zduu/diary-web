import type { ThemeConfig } from '../../hooks/useTheme';
import type { DiaryEntry } from '../../types/index.ts';
import type {
  AdminTextColorGetter,
  OperationState,
} from './adminPanelTypes';

interface PanelSurfaceProps {
  theme: ThemeConfig;
  children: React.ReactNode;
}

interface InlineActionInputProps {
  theme: ThemeConfig;
  value: string;
  type?: string;
  placeholder: string;
  buttonLabel: string;
  onValueChange: (value: string) => void;
  onSubmit: () => void;
}

interface IconTextInputProps {
  icon: React.ReactNode;
  theme: ThemeConfig;
  value: string;
  type?: string;
  autoComplete?: string;
  enterKeyHint?: React.HTMLAttributes<HTMLInputElement>['enterKeyHint'];
  placeholder: string;
  fullWidth?: boolean;
  onValueChange: (value: string) => void;
  required?: boolean;
}

interface AdminEntryListItemProps {
  entry: DiaryEntry;
  theme: ThemeConfig;
  getTextColor: AdminTextColorGetter;
  operationState: OperationState;
  timestampLabel: string;
  onEdit?: () => void;
  onToggleVisibility: () => void;
  onDelete: () => void;
}

interface EntryActionButtonsProps {
  entry: DiaryEntry;
  operationState: OperationState;
  onEdit?: () => void;
  onToggleVisibility: () => void;
  onDelete: () => void;
  theme: ThemeConfig;
}

interface ActionButtonProps {
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  icon: React.ReactNode;
  title: string;
  variant: 'primary' | 'secondary' | 'danger';
  theme: ThemeConfig;
}

interface EntryActionConfig {
  key: 'edit' | 'visibility' | 'delete';
  onClick: () => void;
  disabled: boolean;
  loading: boolean;
  icon: React.ReactNode;
  title: string;
  variant: ActionButtonProps['variant'];
}

function getAdminInputStyle(theme: ThemeConfig) {
  return {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    color: theme.colors.text,
  };
}

function getActionButtonStyle(variant: ActionButtonProps['variant'], theme: ThemeConfig, disabled: boolean) {
  const baseStyles = {
    opacity: disabled ? 0.5 : 1,
    cursor: disabled ? 'not-allowed' : 'pointer',
  };

  switch (variant) {
    case 'primary':
      return {
        ...baseStyles,
        backgroundColor: theme.mode === 'dark' ? '#374151' : `${theme.colors.primary}20`,
        color: theme.mode === 'dark' ? '#f9fafb' : theme.colors.primary,
      };
    case 'danger':
      return {
        ...baseStyles,
        backgroundColor: theme.mode === 'dark' ? 'rgba(239, 68, 68, 0.12)' : 'rgba(239, 68, 68, 0.1)',
        color: '#ef4444',
      };
    case 'secondary':
    default:
      return {
        ...baseStyles,
        backgroundColor: theme.colors.border,
        color: theme.colors.text,
      };
  }
}

export function PanelSurface({ theme, children }: PanelSurfaceProps) {
  return (
    <div
      className="rounded-lg border p-4"
      style={{
        backgroundColor: theme.colors.surface,
        borderColor: theme.colors.border,
      }}
    >
      {children}
    </div>
  );
}

export function InlineActionInput({
  theme,
  value,
  type = 'text',
  placeholder,
  buttonLabel,
  onValueChange,
  onSubmit,
}: InlineActionInputProps) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <input
        type={type}
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        placeholder={placeholder}
        className="min-w-0 flex-1 rounded border px-3 py-2"
        style={getAdminInputStyle(theme)}
      />
      <button
        type="button"
        onClick={onSubmit}
        className="w-full rounded px-4 py-2 font-medium sm:w-auto"
        style={{
          backgroundColor: theme.colors.primary,
          color: 'white',
        }}
      >
        {buttonLabel}
      </button>
    </div>
  );
}

export function IconTextInput({
  icon,
  theme,
  value,
  type = 'text',
  autoComplete,
  enterKeyHint,
  placeholder,
  fullWidth = false,
  onValueChange,
  required = false,
}: IconTextInputProps) {
  return (
    <div className="flex items-center gap-3">
      {icon}
      <input
        type={type}
        value={value}
        autoComplete={autoComplete}
        enterKeyHint={enterKeyHint}
        onChange={(event) => onValueChange(event.target.value)}
        placeholder={placeholder}
        className={`${fullWidth ? 'w-full' : 'flex-1'} rounded-lg border px-4 py-2`}
        style={getAdminInputStyle(theme)}
        required={required}
      />
    </div>
  );
}

export function AdminEntryListItem({
  entry,
  theme,
  getTextColor,
  operationState,
  timestampLabel,
  onEdit,
  onToggleVisibility,
  onDelete,
}: AdminEntryListItemProps) {
  return (
    <div
      className="admin-entry-shell flex items-center justify-between rounded-lg border p-3"
      style={{
        backgroundColor: entry.hidden 
          ? (theme.mode === 'dark' ? 'rgba(239, 68, 68, 0.12)' : 'rgba(255, 0, 0, 0.1)')
          : theme.colors.surface,
        borderColor: theme.colors.border,
      }}
    >
      <div className="min-w-0 flex-1">
        <div className="font-medium" style={{ color: getTextColor('primary') }}>
          {entry.title || '无标题'}
          {entry.hidden && (
            <span className="ml-2 rounded bg-red-500 px-2 py-1 text-xs text-white">
              隐藏
            </span>
          )}
        </div>
        <div className="truncate text-sm" style={{ color: getTextColor('secondary') }}>
          {entry.content.substring(0, 50)}
          {entry.content.length > 50 && '...'}
        </div>
        <div className="mt-1 text-xs" style={{ color: getTextColor('secondary') }}>
          {timestampLabel}
        </div>
      </div>

      <EntryActionButtons
        entry={entry}
        operationState={operationState}
        onEdit={onEdit}
        onToggleVisibility={onToggleVisibility}
        onDelete={onDelete}
        theme={theme}
      />
    </div>
  );
}

function EntryActionButtons({
  entry,
  operationState,
  onEdit,
  onToggleVisibility,
  onDelete,
  theme,
}: EntryActionButtonsProps) {
  const isOperating = operationState !== 'idle';
  const actions: EntryActionConfig[] = [];

  if (onEdit) {
    actions.push({
      key: 'edit',
      onClick: onEdit,
      disabled: isOperating,
      loading: false,
      icon: <span className="text-xs font-medium">改</span>,
      title: '编辑日记',
      variant: 'primary',
    });
  }

  actions.push(
    {
      key: 'visibility',
      onClick: onToggleVisibility,
      disabled: isOperating,
      loading: operationState === 'hiding' || operationState === 'showing',
      icon: <span className="text-xs font-medium">{entry.hidden ? '显' : '隐'}</span>,
      title: entry.hidden ? '显示日记' : '隐藏日记',
      variant: 'secondary',
    },
    {
      key: 'delete',
      onClick: onDelete,
      disabled: isOperating,
      loading: operationState === 'deleting',
      icon: <span className="text-xs font-medium">删</span>,
      title: '删除日记',
      variant: 'danger',
    },
  );

  return (
    <div className="flex items-center gap-2 ml-3">
      {actions.map((action) => (
        <ActionButton
          key={action.key}
          onClick={action.onClick}
          disabled={action.disabled}
          loading={action.loading}
          icon={action.icon}
          title={action.title}
          variant={action.variant}
          theme={theme}
        />
      ))}
    </div>
  );
}

function ActionButton({
  onClick,
  disabled = false,
  loading = false,
  icon,
  title,
  variant,
  theme,
}: ActionButtonProps) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className="p-2 rounded hover:bg-opacity-80 transition-colors relative"
      style={getActionButtonStyle(variant, theme, disabled)}
      title={disabled ? '操作进行中...' : title}
    >
      {loading ? (
        <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
      ) : (
        icon
      )}
    </button>
  );
}
