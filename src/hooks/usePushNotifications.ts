import { useState, useCallback, useEffect } from 'react';

export function usePushNotifications() {
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [supported, setSupported] = useState(false);

  useEffect(() => {
    const isSupported = 'Notification' in window && 'serviceWorker' in navigator;
    setSupported(isSupported);
    if (isSupported) {
      setPermission(Notification.permission);
    }
  }, []);

  const requestPermission = useCallback(async () => {
    if (!supported) return false;
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      return result === 'granted';
    } catch {
      return false;
    }
  }, [supported]);

  const sendNotification = useCallback((title: string, options?: NotificationOptions) => {
    if (!supported || permission !== 'granted') return;
    try {
      new Notification(title, {
        icon: '/pwa-icon-192.png',
        badge: '/pwa-icon-192.png',
        ...options,
      });
    } catch {
      // Silent fail
    }
  }, [supported, permission]);

  return { supported, permission, requestPermission, sendNotification };
}
