import { useCallback, useEffect, useRef, useState } from 'react';
import { registerSW } from 'virtual:pwa-register';

export type UpdateCheckStatus = 'idle' | 'checking' | 'up_to_date' | 'available' | 'unsupported';

export function usePWAUpdate() {
  const [needRefresh, setNeedRefresh] = useState(false);
  const [offlineReady, setOfflineReady] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [checkStatus, setCheckStatus] = useState<UpdateCheckStatus>('idle');
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);
  const updateSwRef = useRef<((reloadPage?: boolean) => Promise<void>) | null>(null);
  const checkTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      registrationRef.current?.update().catch(() => {});
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const updateSW = registerSW({
      immediate: true,
      onNeedRefresh() {
        setNeedRefresh(true);
        setCheckStatus('available');
      },
      onOfflineReady() {
        setOfflineReady(true);
      },
      onRegisteredSW(_swUrl, registration) {
        if (!registration) return;
        registrationRef.current = registration;

        // Check once shortly after launch
        registration.update().catch(() => {});

        // Periodic background check every 30 minutes
        window.setInterval(() => {
          if (navigator.onLine) {
            registration.update().catch(() => {});
          }
        }, 30 * 60 * 1000);
      },
    });
    updateSwRef.current = updateSW;

    // Crucial for installed mobile PWAs: check for updates immediately when returning to the app
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) {
        registrationRef.current?.update().catch(() => {});
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (checkTimerRef.current) window.clearTimeout(checkTimerRef.current);
    };
  }, []);

  // Auto-hide offlineReady notice after 5s
  useEffect(() => {
    if (!offlineReady) return;
    const t = window.setTimeout(() => setOfflineReady(false), 5000);
    return () => window.clearTimeout(t);
  }, [offlineReady]);

  const applyUpdate = useCallback(async () => {
    if (!updateSwRef.current) {
      window.location.reload();
      return;
    }
    setIsUpdating(true);
    try {
      await updateSwRef.current(true);
    } catch {
      window.location.reload();
    }
  }, []);

  const dismissUpdate = useCallback(() => {
    setNeedRefresh(false);
  }, []);

  const dismissOfflineReady = useCallback(() => {
    setOfflineReady(false);
  }, []);

  const checkForUpdate = useCallback(async () => {
    if (checkTimerRef.current) window.clearTimeout(checkTimerRef.current);

    if (needRefresh) {
      setCheckStatus('available');
      return;
    }

    const reg =
      registrationRef.current ??
      (typeof navigator !== 'undefined' && 'serviceWorker' in navigator
        ? (await navigator.serviceWorker.getRegistration().catch(() => undefined)) ?? null
        : null);

    if (!reg) {
      setCheckStatus('unsupported');
      checkTimerRef.current = window.setTimeout(() => setCheckStatus('idle'), 3000);
      return;
    }

    registrationRef.current = reg;
    setCheckStatus('checking');
    try {
      await reg.update();
      if (reg.waiting) {
        setNeedRefresh(true);
        setCheckStatus('available');
        return;
      }
      if (reg.installing) {
        // Wait briefly for installing SW to finish downloading
        reg.installing.addEventListener('statechange', () => {
          if (reg.waiting) {
            setNeedRefresh(true);
            setCheckStatus('available');
          }
        });
        return;
      }
      setCheckStatus('up_to_date');
      checkTimerRef.current = window.setTimeout(() => setCheckStatus('idle'), 3000);
    } catch {
      setCheckStatus('up_to_date');
      checkTimerRef.current = window.setTimeout(() => setCheckStatus('idle'), 3000);
    }
  }, [needRefresh]);

  return {
    needRefresh,
    offlineReady,
    isUpdating,
    isOnline,
    checkStatus,
    applyUpdate,
    dismissUpdate,
    dismissOfflineReady,
    checkForUpdate,
  };
}
