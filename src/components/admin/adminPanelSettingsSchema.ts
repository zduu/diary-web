import type { AdminInterfaceSettings, InterfaceFeatureKey } from './adminPanelTypes';

type InterfaceFeatureSettingKey =
  | 'quick_filters_enabled'
  | 'export_enabled'
  | 'archive_view_enabled'
  | 'recommendations_enabled'
  | 'browse_status_enabled'
  | 'device_status_enabled';

type InterfaceFeatureSchema = {
  apiKey: InterfaceFeatureSettingKey;
  title: string;
  successLabel: string;
  enabledDescription: string;
  disabledDescription: string;
};

export const interfaceFeatureSchema: Record<InterfaceFeatureKey, InterfaceFeatureSchema> = {
  quickFilters: {
    apiKey: 'quick_filters_enabled',
    title: '快速筛选',
    successLabel: '快速筛选功能',
    enabledDescription: '隐藏快速筛选功能',
    disabledDescription: '显示快速筛选功能',
  },
  export: {
    apiKey: 'export_enabled',
    title: '导出功能',
    successLabel: '导出功能',
    enabledDescription: '隐藏导出功能按钮',
    disabledDescription: '显示导出功能按钮',
  },
  archiveView: {
    apiKey: 'archive_view_enabled',
    title: '归纳视图',
    successLabel: '归纳视图',
    enabledDescription: '隐藏归纳显示模式',
    disabledDescription: '显示归纳显示模式',
  },
  recommendations: {
    apiKey: 'recommendations_enabled',
    title: '推荐入口',
    successLabel: '推荐入口',
    enabledDescription: '隐藏 RECOMMENDATIONS 推荐区',
    disabledDescription: '显示 RECOMMENDATIONS 推荐区',
  },
  browseStatus: {
    apiKey: 'browse_status_enabled',
    title: '当前浏览状态',
    successLabel: '当前浏览状态',
    enabledDescription: '隐藏当前浏览状态卡片',
    disabledDescription: '显示当前浏览状态卡片',
  },
  deviceStatus: {
    apiKey: 'device_status_enabled',
    title: '设备与离线',
    successLabel: '设备与离线',
    enabledDescription: '隐藏设备与离线卡片',
    disabledDescription: '显示设备与离线卡片',
  },
};

export function createDefaultInterfaceSettings(): AdminInterfaceSettings {
  return {
    quickFilters: { enabled: true },
    export: { enabled: true },
    archiveView: { enabled: true },
    recommendations: { enabled: true },
    browseStatus: { enabled: true },
    deviceStatus: { enabled: true },
  };
}
