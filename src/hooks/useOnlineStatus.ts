import { useEffect, useState } from 'react';

function detectOnlineStatus() {
  if (typeof navigator === 'undefined') {
    return true;
  }

  return navigator.onLine !== false;
}

export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(detectOnlineStatus);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}
