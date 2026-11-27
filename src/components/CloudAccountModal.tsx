import React, { useState } from 'react';
import type { User } from 'firebase/auth';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Cloud,
  CloudOff,
  CloudUpload,
  Copy,
  ExternalLink,
  LogIn,
  LogOut,
  RefreshCw,
  ShieldCheck,
  X,
} from 'lucide-react';
import { FIREBASE_PROJECT_ID } from '../firebase';
import FIRESTORE_RULES_SNIPPET from '../../firestore.rules?raw';

export type CloudSyncStatus = 'signed_out' | 'connecting' | 'syncing' | 'synced' | 'error';

interface CloudAccountModalProps {
  open: boolean;
  user: User | null;
  authReady: boolean;
  syncStatus: CloudSyncStatus;
  syncError: string | null;
  cloudProjectsCount: number;
  cloudTemplatesCount: number;
  localProjectsCount: number;
  customMaterialsCount: number;
  lastSyncedAt: number | null;
  onClose: () => void;
  onSignInGoogle: () => Promise<void>;
  onSignOut: () => Promise<void>;
  onForceUploadAll: () => Promise<void>;
  onRetrySync: () => void;
}

export const CloudAccountModal: React.FC<CloudAccountModalProps> = ({
  open,
  user,
  authReady,
  syncStatus,
  syncError,
  cloudProjectsCount,
  cloudTemplatesCount,
  localProjectsCount,
  customMaterialsCount,
  lastSyncedAt,
  onClose,
  onSignInGoogle,
  onSignOut,
  onForceUploadAll,
  onRetrySync,
}) => {
  const [busy, setBusy] = useState(false);
  const [copiedDomain, setCopiedDomain] = useState(false);
  const [copiedRules, setCopiedRules] = useState(false);
  const [showSetupGuide, setShowSetupGuide] = useState(false);
  const [showRulesCode, setShowRulesCode] = useState(false);

  if (!open) return null;

  const currentHost = typeof window !== 'undefined' ? window.location.hostname : '';
  const hasPermissionError =
    Boolean(syncError) &&
    (syncError!.includes('Missing or insufficient permissions') ||
      syncError!.includes('permission-denied'));
  const isTemplatesRuleError = hasPermissionError && Boolean(syncError?.includes('/templates'));
  const hasSetupError =
    Boolean(syncError) &&
    (syncError!.includes('unauthorized-domain') ||
      syncError!.includes('operation-not-allowed') ||
      hasPermissionError ||
      syncError!.includes('NOT_FOUND'));

  const handleCopy = async (text: string, target: 'domain' | 'rules') => {
    let ok = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        ok = true;
      }
    } catch {
      ok = false;
    }

    if (!ok) {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        ok = document.execCommand('copy');
        document.body.removeChild(ta);
      } catch {
        ok = false;
      }
    }

    if (ok) {
      if (target === 'domain') {
        setCopiedDomain(true);
        setTimeout(() => setCopiedDomain(false), 2000);
      } else {
        setCopiedRules(true);
        setTimeout(() => setCopiedRules(false), 2000);
      }
    } else if (target === 'rules') {
      setShowRulesCode(true);
    }
  };

  const handleSignIn = async () => {
    setBusy(true);
    try {
      await onSignInGoogle();
    } finally {
      setBusy(false);
    }
  };

  const handleUpload = async () => {
    setBusy(true);
    try {
      await onForceUploadAll();
    } finally {
      setBusy(false);
    }
  };

  const handleLogout = async () => {
    setBusy(true);
    try {
      await onSignOut();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/65 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-lg max-h-[92dvh] flex flex-col overflow-hidden rounded-t-2xl sm:rounded-2xl border border-zinc-800 bg-[#141518] text-zinc-100 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-xl ${
                user
                  ? 'bg-emerald-500/15 text-emerald-400'
                  : 'bg-sky-500/15 text-sky-400'
              }`}
            >
              {user ? <Cloud className="h-4 w-4" /> : <CloudOff className="h-4 w-4" />}
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">
                Chmura Firebase ({FIREBASE_PROJECT_ID})
              </h2>
              <p className="text-[11px] text-zinc-400">
                Synchronizacja projektów 3D, pomieszczeń i własnych materiałów
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Zamknij panel chmury"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-800 hover:text-white cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto cad-scroll p-4 space-y-4">
          {!authReady ? (
            <div className="flex items-center justify-center gap-2 py-8 text-xs text-zinc-400">
              <RefreshCw className="h-4 w-4 animate-spin" />
              Łączenie z Firebase...
            </div>
          ) : user ? (
            <>
              {/* Signed-in account card */}
              <div className="flex items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-900/70 p-3">
                <div className="flex items-center gap-3 min-w-0">
                  {user.photoURL ? (
                    <img
                      src={user.photoURL}
                      alt=""
                      referrerPolicy="no-referrer"
                      className="h-10 w-10 rounded-full border border-zinc-700 shrink-0"
                    />
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-500/20 text-sm font-bold text-amber-300 shrink-0">
                      {(user.displayName || user.email || 'U').charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="truncate text-xs font-semibold text-white">
                      {user.displayName || 'Konto Google'}
                    </div>
                    <div className="truncate text-[11px] text-zinc-400">{user.email}</div>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleLogout()}
                  className="flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-950 px-2.5 py-1.5 text-[11px] font-medium text-zinc-300 hover:border-red-500/50 hover:text-red-300 disabled:opacity-40 cursor-pointer shrink-0"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  Wyloguj
                </button>
              </div>

              {/* Sync status summary */}
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-2.5 text-center">
                  <div className="text-base font-bold font-mono-num text-white">
                    {cloudProjectsCount}
                  </div>
                  <div className="text-[10px] text-zinc-400">Projektów w chmurze</div>
                </div>
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-2.5 text-center">
                  <div className="text-base font-bold font-mono-num text-sky-300">
                    {cloudTemplatesCount}
                  </div>
                  <div className="text-[10px] text-zinc-400">Szablonów Firestore</div>
                </div>
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-2.5 text-center">
                  <div className="text-base font-bold font-mono-num text-amber-300">
                    {customMaterialsCount}
                  </div>
                  <div className="text-[10px] text-zinc-400">Własnych materiałów</div>
                </div>
              </div>

              {/* Live sync status banner */}
              <div
                className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-xs ${
                  syncStatus === 'error'
                    ? 'border-red-500/40 bg-red-950/30 text-red-200'
                    : syncStatus === 'syncing'
                      ? 'border-amber-500/40 bg-amber-500/10 text-amber-200'
                      : 'border-emerald-500/35 bg-emerald-500/10 text-emerald-200'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  {syncStatus === 'error' ? (
                    <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
                  ) : syncStatus === 'syncing' ? (
                    <RefreshCw className="h-4 w-4 text-amber-400 animate-spin shrink-0" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                  )}
                  <span className="truncate">
                    {syncStatus === 'error'
                      ? 'Błąd synchronizacji z Firestore'
                      : syncStatus === 'syncing'
                        ? 'Zapisywanie zmian w chmurze...'
                        : lastSyncedAt
                          ? `Zsynchronizowano (${new Date(lastSyncedAt).toLocaleTimeString('pl-PL', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })})`
                          : 'Połączono z chmurą (autozapis aktywny)'}
                  </span>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleUpload()}
                  className="flex items-center gap-1 rounded-lg bg-amber-500 px-2.5 py-1 text-[11px] font-semibold text-zinc-950 hover:bg-amber-400 disabled:opacity-40 cursor-pointer shrink-0"
                >
                  <CloudUpload className="h-3.5 w-3.5" />
                  Wyślij wszystko
                </button>
              </div>
            </>
          ) : (
            <div className="space-y-3">
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3.5 space-y-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-white">
                  <ShieldCheck className="h-4 w-4 text-emerald-400" />
                  Prywatny zapis w Twoim projekcie Firebase ({FIREBASE_PROJECT_ID})
                </div>
                <ul className="space-y-1 text-[11px] text-zinc-300 list-disc pl-4">
                  <li>Wszystkie obecne projekty lokalne ({localProjectsCount}) wyślą się automatycznie po zalogowaniu.</li>
                  <li>Własne materiały (np. kantówki, styropian) i cennik synchronizują się między PC i telefonem.</li>
                  <li>Dostęp ma wyłącznie Twoje konto Google (prywatne reguły bezpieczeństwa Firestore).</li>
                </ul>
              </div>

              <button
                type="button"
                disabled={busy}
                onClick={() => void handleSignIn()}
                className="flex w-full min-h-[44px] items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-semibold text-zinc-950 hover:bg-amber-400 disabled:opacity-50 transition-colors cursor-pointer"
              >
                {busy ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <LogIn className="h-4 w-4" />
                )}
                Zaloguj się przez Google
              </button>
            </div>
          )}

          {/* Error diagnostics */}
          {syncError && (
            <div className="rounded-xl border border-red-500/40 bg-red-950/30 p-3 space-y-2 text-[11px] text-red-200">
              {isTemplatesRuleError ? (
                <div className="space-y-1">
                  <div className="font-semibold text-amber-300">
                    Zaktualizuj reguły Firestore dla kolekcji szablonów (templates)
                  </div>
                  <p className="text-zinc-200 leading-relaxed">
                    Twoje projekty działają, ale w projekcie <strong>{FIREBASE_PROJECT_ID}</strong> opublikowane są jeszcze starsze reguły bez sekcji <code>templates</code>. Skopiuj poniższe reguły (krok 3), wklej je w konsoli Firebase → <strong>Publish</strong>, a następnie kliknij przycisk poniżej.
                  </p>
                </div>
              ) : (
                <div className="font-semibold text-red-300">Szczegóły błędu:</div>
              )}
              <div className="font-mono break-all text-[10px] text-red-200/80">{syncError}</div>
              {user && (
                <button
                  type="button"
                  onClick={onRetrySync}
                  className="inline-flex min-h-[34px] items-center gap-1.5 rounded-lg bg-amber-500 px-3 text-[11px] font-semibold text-zinc-950 hover:bg-amber-400 cursor-pointer"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  <span>Ponów synchronizację</span>
                </button>
              )}
            </div>
          )}

          {/* Setup Checklist for manual stolarz3d project */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-950/70">
            <button
              type="button"
              onClick={() => setShowSetupGuide((s) => !s)}
              className="flex w-full items-center justify-between px-3 py-2.5 text-left text-xs font-medium text-zinc-300 hover:text-white cursor-pointer"
            >
              <span>Konfiguracja konsoli Firebase ({FIREBASE_PROJECT_ID})</span>
              <span className="text-[11px] text-amber-400">
                {showSetupGuide || hasSetupError ? 'Ukryj' : 'Pokaż 3 kroki'}
              </span>
            </button>

            {(showSetupGuide || hasSetupError) && (
              <div className="border-t border-zinc-800 px-3 py-3 space-y-3 text-[11px] text-zinc-300">
                <div>
                  <div className="font-semibold text-white">
                    1. Włącz logowanie Google + autoryzowaną domenę
                  </div>
                  <p className="mt-0.5 text-zinc-400">
                    Włącz dostawcę <strong>Google</strong> w Authentication → Sign-in method, a w
                    Authentication → Settings → Authorized domains dodaj tę domenę:
                  </p>
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <code className="flex-1 truncate rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1 text-[10px] text-sky-300">
                      {currentHost}
                    </code>
                    <button
                      type="button"
                      onClick={() => void handleCopy(currentHost, 'domain')}
                      className="flex items-center gap-1 rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1 text-[10px] font-medium text-zinc-200 hover:border-amber-500/60 cursor-pointer shrink-0"
                    >
                      {copiedDomain ? (
                        <>
                          <Check className="h-3 w-3 text-emerald-400" />
                          Skopiowano
                        </>
                      ) : (
                        <>
                          <Copy className="h-3 w-3" />
                          Kopiuj
                        </>
                      )}
                    </button>
                  </div>
                  <a
                    href={`https://console.firebase.google.com/project/${FIREBASE_PROJECT_ID}/authentication/providers`}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-amber-400 hover:underline"
                  >
                    Otwórz Authentication w konsoli Firebase
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>

                <div>
                  <div className="font-semibold text-white">
                    2. Utwórz bazę Firestore (plan darmowy Spark)
                  </div>
                  <p className="mt-0.5 text-zinc-400">
                    Kliknij <strong>Create database</strong> (region np. <code>europe-central2</code>{' '}
                    Warszawa, tryb produkcyjny).
                  </p>
                  <a
                    href={`https://console.firebase.google.com/project/${FIREBASE_PROJECT_ID}/firestore`}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-flex items-center gap-1 text-[11px] text-amber-400 hover:underline"
                  >
                    Otwórz Firestore Database
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>

                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-white">
                      3. Wklej reguły bezpieczeństwa w Firestore → Rules
                    </span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => setShowRulesCode((v) => !v)}
                        className="rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1 text-[10px] font-medium text-zinc-300 hover:border-zinc-700 cursor-pointer"
                      >
                        {showRulesCode || hasPermissionError ? 'Ukryj kod' : 'Podgląd'}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleCopy(FIRESTORE_RULES_SNIPPET, 'rules')}
                        className="flex items-center gap-1 rounded-lg border border-amber-500/50 bg-amber-500/15 px-2 py-1 text-[10px] font-semibold text-amber-200 hover:bg-amber-500/25 cursor-pointer"
                      >
                        {copiedRules ? (
                          <>
                            <Check className="h-3 w-3 text-emerald-400" />
                            Skopiowano reguły
                          </>
                        ) : (
                          <>
                            <Copy className="h-3 w-3" />
                            Kopiuj reguły
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                  {(showRulesCode || hasPermissionError) && (
                    <textarea
                      readOnly
                      aria-label="Kod reguł Firestore"
                      value={FIRESTORE_RULES_SNIPPET}
                      onFocus={(e) => e.currentTarget.select()}
                      rows={7}
                      className="mt-2 w-full rounded-lg border border-zinc-800 bg-zinc-950 p-2 font-mono text-[10px] leading-relaxed text-zinc-300 focus:border-amber-500 focus:outline-none cad-scroll"
                    />
                  )}
                  <a
                    href={`https://console.firebase.google.com/project/${FIREBASE_PROJECT_ID}/firestore/rules`}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-amber-400 hover:underline"
                  >
                    Otwórz Firestore → Rules i kliknij Opublikuj
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
