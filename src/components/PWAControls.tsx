import React, { useState } from 'react';
import {
  CheckCircle2,
  Download,
  RefreshCw,
  Share,
  Smartphone,
  WifiOff,
  X,
} from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import type { UpdateCheckStatus } from '../hooks/usePWAUpdate';

interface PWAInstallButtonProps {
  needRefresh: boolean;
  checkStatus: UpdateCheckStatus;
  onApplyUpdate: () => void;
  onCheckForUpdate: () => void;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  needRefresh,
  checkStatus,
  onApplyUpdate,
  onCheckForUpdate,
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  // If a newer PWA version is ready, surface direct one-tap update button in the header too
  if (needRefresh) {
    return (
      <button
        type="button"
        onClick={onApplyUpdate}
        className="flex min-h-[34px] items-center gap-1.5 rounded-lg border border-amber-400/70 bg-amber-500/20 px-2.5 text-xs font-semibold text-amber-200 hover:bg-amber-500/30 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        title="Dostępna nowa wersja aplikacji — kliknij, aby wgrać aktualizację"
      >
        <RefreshCw className="h-3.5 w-3.5 shrink-0" />
        <span className="hidden sm:inline">Aktualizuj</span>
      </button>
    );
  }

  // Already running as an installed standalone PWA -> offer manual update check button
  if (isInstalled) {
    return (
      <button
        type="button"
        onClick={onCheckForUpdate}
        disabled={checkStatus === 'checking'}
        className="flex min-h-[34px] items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 text-xs font-medium text-zinc-200 hover:border-amber-500/60 hover:text-amber-300 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
        title={
          checkStatus === 'up_to_date'
            ? 'Masz najnowszą wersję Stolarz 3D'
            : 'Sprawdź dostępność nowej wersji aplikacji'
        }
      >
        {checkStatus === 'up_to_date' ? (
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
        ) : (
          <RefreshCw
            className={`h-3.5 w-3.5 shrink-0 ${
              checkStatus === 'checking' ? 'animate-spin text-amber-400' : ''
            }`}
          />
        )}
        <span className="hidden lg:inline">
          {checkStatus === 'checking'
            ? 'Sprawdzam...'
            : checkStatus === 'up_to_date'
              ? 'Aktualna'
              : 'Aktualizacje'}
        </span>
      </button>
    );
  }

  // Android / Desktop Chromium native install prompt
  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={() => void install()}
        className="flex min-h-[34px] items-center gap-1.5 rounded-lg border border-amber-500/60 bg-amber-500/15 px-2.5 text-xs font-semibold text-amber-300 hover:bg-amber-500/25 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        title="Zainstaluj Stolarz 3D na ekranie głównym telefonu lub komputera"
      >
        <Download className="h-3.5 w-3.5 shrink-0" />
        <span className="hidden sm:inline">Zainstaluj</span>
      </button>
    );
  }

  // iOS Safari guided installation modal (WebKit does not fire beforeinstallprompt)
  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className="flex min-h-[34px] items-center gap-1.5 rounded-lg border border-amber-500/60 bg-amber-500/15 px-2.5 text-xs font-semibold text-amber-300 hover:bg-amber-500/25 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          title="Instrukcja instalacji aplikacji na iPhone / iPad"
        >
          <Smartphone className="h-3.5 w-3.5 shrink-0" />
          <span className="hidden sm:inline">Zainstaluj</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4">
            <div className="w-full max-w-sm rounded-xl border border-zinc-800 bg-[#141518] p-5 text-zinc-100 shadow-2xl">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <img
                    src="/pwa-192x192.png"
                    alt="Ikona Stolarz 3D"
                    className="h-12 w-12 rounded-xl border border-zinc-700 object-cover shrink-0"
                  />
                  <div>
                    <h3 className="text-sm font-semibold text-white">
                      Zainstaluj na iPhone / iPad
                    </h3>
                    <p className="text-xs text-zinc-400">
                      Aplikacja pełnoekranowa z pracą offline
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-800 hover:text-white cursor-pointer"
                  aria-label="Zamknij instrukcję instalacji"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <ol className="mt-4 space-y-2.5 text-xs leading-relaxed text-zinc-300">
                <li className="flex items-start gap-2.5">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-zinc-800 font-mono-num font-semibold text-amber-400">
                    1
                  </span>
                  <span>
                    Stuknij ikonę{' '}
                    <strong className="inline-flex items-center gap-1 text-white">
                      <Share className="h-3.5 w-3.5 text-sky-400" />
                      Udostępnij
                    </strong>{' '}
                    na dolnym pasku Safari.
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-zinc-800 font-mono-num font-semibold text-amber-400">
                    2
                  </span>
                  <span>
                    Przewiń listę w dół i wybierz{' '}
                    <strong className="text-white">Do ekranu początkowego</strong>.
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-zinc-800 font-mono-num font-semibold text-amber-400">
                    3
                  </span>
                  <span>
                    Stuknij <strong className="text-white">Dodaj</strong> — aplikacja
                    pojawi się z własną ikoną i będzie automatycznie wykrywać aktualizacje.
                  </span>
                </li>
              </ol>

              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="mt-5 w-full rounded-lg bg-amber-500 py-2 text-xs font-semibold text-zinc-950 hover:bg-amber-400 transition-colors cursor-pointer"
              >
                Rozumiem
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};

interface PWAStatusOverlaysProps {
  needRefresh: boolean;
  offlineReady: boolean;
  isUpdating: boolean;
  isOnline: boolean;
  onApplyUpdate: () => void;
  onDismissUpdate: () => void;
  onDismissOfflineReady: () => void;
}

export const PWAStatusOverlays: React.FC<PWAStatusOverlaysProps> = ({
  needRefresh,
  offlineReady,
  isUpdating,
  isOnline,
  onApplyUpdate,
  onDismissUpdate,
  onDismissOfflineReady,
}) => {
  return (
    <>
      {/* New App Version Detected & One-Tap Update Banner */}
      {needRefresh && (
        <div
          role="alert"
          className="fixed top-14 right-3.5 sm:right-5 z-40 w-[min(360px,calc(100vw-28px))] rounded-xl border border-amber-500/60 bg-[#141518] p-3.5 text-zinc-100 shadow-2xl"
        >
          <div className="flex items-start gap-3">
            <img
              src="/pwa-192x192.png"
              alt="Stolarz 3D"
              className="h-10 w-10 rounded-lg border border-zinc-700 object-cover shrink-0"
            />
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold text-white">
                Dostępna aktualizacja Stolarz 3D
              </div>
              <p className="mt-0.5 text-[11px] leading-snug text-zinc-300">
                Nowa wersja jest gotowa do wgrania. Twoje projekty pozostaną bezpiecznie
                zapisane.
              </p>
              <div className="mt-2.5 flex items-center gap-2">
                <button
                  type="button"
                  disabled={isUpdating}
                  onClick={onApplyUpdate}
                  className="flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-zinc-950 hover:bg-amber-400 transition-colors cursor-pointer disabled:opacity-60"
                >
                  <RefreshCw
                    className={`h-3.5 w-3.5 ${isUpdating ? 'animate-spin' : ''}`}
                  />
                  <span>{isUpdating ? 'Aktualizuję...' : 'Wgraj aktualizację'}</span>
                </button>
                <button
                  type="button"
                  onClick={onDismissUpdate}
                  className="rounded-lg border border-zinc-700 px-2.5 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors cursor-pointer"
                >
                  Później
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Offline Mode Indicator (non-intrusive, static icon) */}
      {!isOnline && (
        <div className="fixed top-14 left-1/2 z-30 -translate-x-1/2 flex items-center gap-2 rounded-lg border border-amber-500/50 bg-[#141518] px-3 py-1.5 text-xs font-medium text-amber-200 shadow-lg">
          <WifiOff className="h-3.5 w-3.5 text-amber-400 shrink-0" />
          <span className="whitespace-nowrap">
            Tryb offline — pracujesz lokalnie
          </span>
        </div>
      )}

      {/* One-time Offline Ready Confirmation */}
      {offlineReady && !needRefresh && isOnline && (
        <div className="fixed top-14 right-3.5 sm:right-5 z-30 flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-[#141518] px-3 py-2 text-xs text-zinc-100 shadow-xl">
          <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
          <span>Aplikacja zapisana do pracy offline</span>
          <button
            type="button"
            onClick={onDismissOfflineReady}
            className="ml-1 text-zinc-400 hover:text-white cursor-pointer"
            aria-label="Zamknij powiadomienie"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </>
  );
};
