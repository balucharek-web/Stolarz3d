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
}

const FIRESTORE_RULES_SNIPPET = `rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} { allow read, write: if false; }

    function isSignedIn() { return request.auth != null; }
    function isVerifiedUser() { return isSignedIn() && request.auth.token.email_verified == true; }
    function isValidId(id) { return id is string && id.size() >= 1 && id.size() <= 128 && id.matches('^[a-zA-Z0-9_\\\\-]+$'); }
    function incoming() { return request.resource.data; }
    function existing() { return resource.data; }
    function isOwner(userId) { return isSignedIn() && request.auth.uid == userId; }
    function hasWorkspaceProfile(userId) {
      return exists(/databases/$(database)/documents/users/$(userId)) &&
        get(/databases/$(database)/documents/users/$(userId)).data.ownerId == request.auth.uid;
    }

    function isValidUserProfile(data, userId) {
      return data.keys().hasAll(['ownerId', 'displayName', 'createdAt', 'updatedAt']) &&
        data.keys().hasOnly(['ownerId', 'displayName', 'createdAt', 'updatedAt']) &&
        isValidId(data.ownerId) && data.ownerId == request.auth.uid && data.ownerId == userId &&
        data.displayName is string && data.displayName.size() >= 1 && data.displayName.size() <= 80 &&
        data.createdAt is timestamp && data.updatedAt is timestamp;
    }

    function isValidProject(data, projectId) {
      return data.keys().hasAll(['id', 'ownerId', 'name', 'parts', 'fasteners', 'clientUpdatedAt', 'createdAt', 'updatedAt']) &&
        data.keys().hasOnly(['id', 'ownerId', 'name', 'parts', 'fasteners', 'room', 'cabinetConfigs', 'clientUpdatedAt', 'createdAt', 'updatedAt']) &&
        isValidId(data.id) && data.id.size() <= 80 && data.id == projectId &&
        isValidId(data.ownerId) && data.ownerId == request.auth.uid &&
        data.name is string && data.name.size() >= 1 && data.name.size() <= 80 &&
        data.parts is list && data.parts.size() <= 400 && (data.parts.size() == 0 || data.parts[0] is map) &&
        data.fasteners is list && data.fasteners.size() <= 2000 && (data.fasteners.size() == 0 || data.fasteners[0] is map) &&
        (!('room' in data) || data.room == null || data.room is map) &&
        (!('cabinetConfigs' in data) || data.cabinetConfigs == null || data.cabinetConfigs is map) &&
        data.clientUpdatedAt is number && data.clientUpdatedAt >= 0 &&
        data.createdAt is timestamp && data.updatedAt is timestamp;
    }

    function isValidTemplatePayload(proj) {
      return proj is map &&
        proj.keys().hasAll(['id', 'name', 'parts', 'fasteners']) &&
        proj.keys().hasOnly(['id', 'name', 'parts', 'fasteners', 'room', 'cabinetConfigs']) &&
        isValidId(proj.id) && proj.id.size() <= 80 &&
        proj.name is string && proj.name.size() >= 1 && proj.name.size() <= 80 &&
        proj.parts is list && proj.parts.size() <= 400 && (proj.parts.size() == 0 || proj.parts[0] is map) &&
        proj.fasteners is list && proj.fasteners.size() <= 2000 && (proj.fasteners.size() == 0 || proj.fasteners[0] is map) &&
        (!('room' in proj) || proj.room == null || proj.room is map) &&
        (!('cabinetConfigs' in proj) || proj.cabinetConfigs == null || proj.cabinetConfigs is map);
    }

    function isValidTemplate(data, templateId) {
      return data.keys().hasAll(['id', 'ownerId', 'name', 'subtitle', 'category', 'project', 'createdAt', 'updatedAt']) &&
        data.keys().hasOnly(['id', 'ownerId', 'name', 'subtitle', 'category', 'project', 'createdAt', 'updatedAt']) &&
        isValidId(data.id) && data.id.size() <= 80 && data.id == templateId &&
        isValidId(data.ownerId) && data.ownerId == request.auth.uid &&
        data.name is string && data.name.size() >= 1 && data.name.size() <= 80 &&
        data.subtitle is string && data.subtitle.size() >= 1 && data.subtitle.size() <= 160 &&
        data.category is string && data.category in ['Ogród i DIY', 'Magazynowe i OSB', 'Kuchenne', 'Domowe', 'Warsztat'] &&
        isValidTemplatePayload(data.project) &&
        data.createdAt is timestamp && data.updatedAt is timestamp;
    }

    function isValidMaterialsConfig(cfg) {
      return cfg is map &&
        cfg.keys().hasAll(['customMaterials', 'builtInOverrides']) &&
        cfg.keys().hasOnly(['customMaterials', 'builtInOverrides']) &&
        cfg.customMaterials is list && cfg.customMaterials.size() <= 100 &&
        (cfg.customMaterials.size() == 0 || cfg.customMaterials[0] is map) &&
        cfg.builtInOverrides is map && cfg.builtInOverrides.size() <= 60;
    }

    function isValidWorkspaceSettings(data) {
      return data.keys().hasAll(['ownerId', 'materialsConfig', 'quoteSettings', 'clientUpdatedAt', 'createdAt', 'updatedAt']) &&
        data.keys().hasOnly(['ownerId', 'materialsConfig', 'quoteSettings', 'clientUpdatedAt', 'createdAt', 'updatedAt']) &&
        isValidId(data.ownerId) && data.ownerId == request.auth.uid &&
        isValidMaterialsConfig(data.materialsConfig) &&
        data.quoteSettings is map && data.quoteSettings.size() <= 30 &&
        data.clientUpdatedAt is number && data.clientUpdatedAt >= 0 &&
        data.createdAt is timestamp && data.updatedAt is timestamp;
    }

    match /users/{userId} {
      allow get: if isValidId(userId) && isOwner(userId) && (resource == null || existing().ownerId == request.auth.uid);
      allow list: if false;
      allow create: if isVerifiedUser() && isValidId(userId) && isOwner(userId) && isValidUserProfile(incoming(), userId) && incoming().createdAt == request.time && incoming().updatedAt == request.time;
      allow update: if isVerifiedUser() && isValidId(userId) && isOwner(userId) && isValidUserProfile(incoming(), userId) && incoming().ownerId == existing().ownerId && incoming().createdAt == existing().createdAt && incoming().updatedAt == request.time && incoming().diff(existing()).affectedKeys().hasOnly(['displayName', 'updatedAt']);
      allow delete: if false;

      match /projects/{projectId} {
        allow get: if isValidId(userId) && isValidId(projectId) && isOwner(userId) && (resource == null || existing().ownerId == request.auth.uid) && hasWorkspaceProfile(userId);
        allow list: if isOwner(userId) && existing().ownerId == request.auth.uid;
        allow create: if isVerifiedUser() && isValidId(userId) && isValidId(projectId) && isOwner(userId) && isValidProject(incoming(), projectId) && incoming().createdAt == request.time && incoming().updatedAt == request.time && hasWorkspaceProfile(userId);
        allow update: if isVerifiedUser() && isValidId(userId) && isValidId(projectId) && isOwner(userId) && isValidProject(incoming(), projectId) && incoming().ownerId == existing().ownerId && incoming().id == existing().id && incoming().createdAt == existing().createdAt && incoming().updatedAt == request.time && hasWorkspaceProfile(userId) && (incoming().diff(existing()).affectedKeys().hasOnly(['name', 'parts', 'fasteners', 'room', 'cabinetConfigs', 'clientUpdatedAt', 'updatedAt']) || incoming().diff(existing()).affectedKeys().hasOnly(['name', 'clientUpdatedAt', 'updatedAt']));
        allow delete: if isVerifiedUser() && isValidId(userId) && isValidId(projectId) && isOwner(userId) && existing().ownerId == request.auth.uid && hasWorkspaceProfile(userId);
      }

      match /templates/{templateId} {
        allow get: if isValidId(userId) && isValidId(templateId) && isOwner(userId) && (resource == null || existing().ownerId == request.auth.uid) && hasWorkspaceProfile(userId);
        allow list: if isOwner(userId) && existing().ownerId == request.auth.uid;
        allow create: if isVerifiedUser() && isValidId(userId) && isValidId(templateId) && isOwner(userId) && isValidTemplate(incoming(), templateId) && incoming().createdAt == request.time && incoming().updatedAt == request.time && hasWorkspaceProfile(userId);
        allow update: if isVerifiedUser() && isValidId(userId) && isValidId(templateId) && isOwner(userId) && isValidTemplate(incoming(), templateId) && incoming().ownerId == existing().ownerId && incoming().id == existing().id && incoming().createdAt == existing().createdAt && incoming().updatedAt == request.time && hasWorkspaceProfile(userId) && incoming().diff(existing()).affectedKeys().hasOnly(['name', 'subtitle', 'category', 'project', 'updatedAt']);
        allow delete: if isVerifiedUser() && isValidId(userId) && isValidId(templateId) && isOwner(userId) && existing().ownerId == request.auth.uid && hasWorkspaceProfile(userId);
      }

      match /settings/{settingId} {
        allow get: if isValidId(userId) && settingId == 'workspace' && isOwner(userId) && (resource == null || existing().ownerId == request.auth.uid) && hasWorkspaceProfile(userId);
        allow list: if false;
        allow create: if isVerifiedUser() && isValidId(userId) && settingId == 'workspace' && isOwner(userId) && isValidWorkspaceSettings(incoming()) && incoming().createdAt == request.time && incoming().updatedAt == request.time && hasWorkspaceProfile(userId);
        allow update: if isVerifiedUser() && isValidId(userId) && settingId == 'workspace' && isOwner(userId) && isValidWorkspaceSettings(incoming()) && incoming().ownerId == existing().ownerId && incoming().createdAt == existing().createdAt && incoming().updatedAt == request.time && hasWorkspaceProfile(userId) && incoming().diff(existing()).affectedKeys().hasOnly(['materialsConfig', 'quoteSettings', 'clientUpdatedAt', 'updatedAt']);
        allow delete: if false;
      }
    }
  }
}`;

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
}) => {
  const [busy, setBusy] = useState(false);
  const [copiedDomain, setCopiedDomain] = useState(false);
  const [copiedRules, setCopiedRules] = useState(false);
  const [showSetupGuide, setShowSetupGuide] = useState(false);

  if (!open) return null;

  const currentHost = typeof window !== 'undefined' ? window.location.hostname : '';
  const hasSetupError =
    Boolean(syncError) &&
    (syncError!.includes('unauthorized-domain') ||
      syncError!.includes('operation-not-allowed') ||
      syncError!.includes('Missing or insufficient permissions') ||
      syncError!.includes('permission-denied') ||
      syncError!.includes('NOT_FOUND'));

  const handleCopy = async (text: string, target: 'domain' | 'rules') => {
    try {
      await navigator.clipboard.writeText(text);
      if (target === 'domain') {
        setCopiedDomain(true);
        setTimeout(() => setCopiedDomain(false), 2000);
      } else {
        setCopiedRules(true);
        setTimeout(() => setCopiedRules(false), 2000);
      }
    } catch {
      // ignore clipboard errors
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
            <div className="rounded-xl border border-red-500/40 bg-red-950/30 p-3 space-y-1.5 text-[11px] text-red-200">
              <div className="font-semibold text-red-300">Szczegóły błędu:</div>
              <div className="font-mono break-all text-[10px] text-red-200/90">{syncError}</div>
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
                    <button
                      type="button"
                      onClick={() => void handleCopy(FIRESTORE_RULES_SNIPPET, 'rules')}
                      className="flex items-center gap-1 rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1 text-[10px] font-medium text-zinc-200 hover:border-amber-500/60 cursor-pointer shrink-0"
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
                  <a
                    href={`https://console.firebase.google.com/project/${FIREBASE_PROJECT_ID}/firestore/rules`}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-flex items-center gap-1 text-[11px] text-amber-400 hover:underline"
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
