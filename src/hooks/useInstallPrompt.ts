import { useEffect, useRef, useState } from 'react';

type InstallPromptOutcome = 'accepted' | 'dismissed' | 'unavailable';

type InstallDeviceInfo = {
  maxTouchPoints: number;
  platform: string;
  userAgent: string;
};

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

function readInstallDeviceInfo(): InstallDeviceInfo {
  if (typeof navigator === 'undefined') {
    return {
      maxTouchPoints: 0,
      platform: '',
      userAgent: '',
    };
  }

  return {
    maxTouchPoints: navigator.maxTouchPoints ?? 0,
    platform: navigator.platform ?? '',
    userAgent: navigator.userAgent ?? '',
  };
}

export function getManualInstallHint(deviceInfo: InstallDeviceInfo, isStandalone: boolean) {
  if (isStandalone) {
    return null;
  }

  const userAgent = deviceInfo.userAgent.toLowerCase();
  const isIos = /iphone|ipad|ipod/.test(userAgent) || (deviceInfo.platform === 'MacIntel' && deviceInfo.maxTouchPoints > 1);

  if (isIos) {
    return '在 Safari 里点“分享”，再选“添加到主屏幕”。';
  }

  if (userAgent.includes('android')) {
    return '在浏览器菜单中选择“安装应用”或“添加到主屏幕”。';
  }

  return '可在浏览器菜单中安装此 Web App，保留更接近本地应用的入口。';
}

export function useInstallPrompt(isStandalone: boolean) {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [lastOutcome, setLastOutcome] = useState<'accepted' | 'dismissed' | null>(null);
  const promptInProgressRef = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
      setLastOutcome(null);
    };

    const handleInstalled = () => {
      setInstallEvent(null);
      setLastOutcome('accepted');
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt as EventListener);
    window.addEventListener('appinstalled', handleInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt as EventListener);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, []);

  useEffect(() => {
    if (isStandalone) {
      setInstallEvent(null);
    }
  }, [isStandalone]);

  const promptInstall = async (): Promise<InstallPromptOutcome> => {
    if (!installEvent || isStandalone || promptInProgressRef.current) {
      return 'unavailable';
    }

    promptInProgressRef.current = true;
    setInstallEvent(null);

    try {
      await installEvent.prompt();
      const { outcome } = await installEvent.userChoice;
      setLastOutcome(outcome);
      return outcome;
    } catch {
      return 'unavailable';
    } finally {
      promptInProgressRef.current = false;
    }
  };

  return {
    canPromptInstall: !isStandalone && installEvent !== null,
    lastOutcome,
    manualInstallHint: getManualInstallHint(readInstallDeviceInfo(), isStandalone),
    promptInstall,
  };
}
