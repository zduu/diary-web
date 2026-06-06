import { useThemeContext } from '../ThemeProvider';
import { ModalShell } from '../ModalShell';

interface MapPickerConfigNoticeProps {
  isOpen: boolean;
  onClose: () => void;
}

export function MapPickerConfigNotice({ isOpen, onClose }: MapPickerConfigNoticeProps) {
  const { theme } = useThemeContext();

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      zIndex={50}
      backdropStyle={{
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        overflow: 'hidden',
      }}
      panelClassName="w-full max-w-md rounded-lg bg-white p-6 shadow-xl"
      panelStyle={{ backgroundColor: theme.colors.background }}
    >
      <div className="text-center">
        <div className="mb-4 text-4xl">🗺️</div>
        <h3 className="mb-2 text-lg font-semibold" style={{ color: theme.colors.text }}>
          地图功能需要配置
        </h3>
        <p className="mb-4 text-sm" style={{ color: theme.colors.textSecondary }}>
          地图选择功能需要配置高德地图的JavaScript API密钥。
          <br />
          请查看配置指南：docs/deployment.md
        </p>
        <div className="flex justify-center gap-2">
          <button
            onClick={onClose}
            className="rounded-md px-4 py-2 font-medium text-white"
            style={{ backgroundColor: theme.colors.primary }}
          >
            知道了
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
