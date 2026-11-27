import type { User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import {
  DEFAULT_QUOTE_SETTINGS,
  type FurniturePart,
  type FurnitureProject,
  type MaterialsCatalogConfig,
  type QuoteSettings,
} from '../types/furniture';
import { sanitizeImportedProject } from './storage';

// Validation constants synchronized verbatim with firebase-blueprint.json & firestore.rules
const VALID_ID_REGEX = /^[a-zA-Z0-9_-]+$/;
const MAX_ID_LENGTH = 80;
const MAX_NAME_LENGTH = 80;
const MAX_PARTS = 400;
const MAX_FASTENERS = 2000;
const MAX_CUSTOM_MATERIALS = 100;
const MAX_BUILTIN_OVERRIDES = 60;

/** Ensures any project/doc ID strictly satisfies ^[a-zA-Z0-9_\-]+$ and max length 80 */
export function sanitizeFirestoreId(rawId: string, fallbackPrefix = 'proj'): string {
  const cleaned = rawId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, MAX_ID_LENGTH);
  if (cleaned.length > 0 && VALID_ID_REGEX.test(cleaned)) {
    return cleaned;
  }
  return `${fallbackPrefix}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

/** Recursively strips undefined keys so Firestore never rejects optional TS fields */
function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefined(item)) as unknown as T;
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v !== undefined) {
        out[k] = stripUndefined(v);
      }
    }
    return out as T;
  }
  return value;
}

/**
 * Firestore forbids nested arrays (e.g. customPolygon: [number, number][]).
 * Encode polygon tuples into native Firestore list of { x, y } maps.
 */
function encodePartForFirestore(part: FurniturePart): Record<string, unknown> {
  const { customPolygon, ...rest } = part;
  const encoded: Record<string, unknown> = stripUndefined({ ...rest });
  if (Array.isArray(customPolygon) && customPolygon.length >= 3) {
    encoded.customPolygonPoints = customPolygon.slice(0, 64).map(([x, y]) => ({
      x: Number.isFinite(x) ? x : 0,
      y: Number.isFinite(y) ? y : 0,
    }));
  }
  return encoded;
}

function decodePartFromFirestore(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') return raw;
  const obj = raw as Record<string, unknown>;
  if (Array.isArray(obj.customPolygonPoints) && obj.customPolygonPoints.length >= 3) {
    const pts: [number, number][] = [];
    for (const pt of obj.customPolygonPoints) {
      if (pt && typeof pt === 'object') {
        const p = pt as Record<string, unknown>;
        const x = Number(p.x);
        const y = Number(p.y);
        if (Number.isFinite(x) && Number.isFinite(y)) {
          pts.push([x, y]);
        }
      }
    }
    if (pts.length >= 3) {
      return { ...obj, customPolygon: pts };
    }
  }
  return obj;
}

function buildSanitizedProjectFields(project: FurnitureProject, uid: string) {
  const safeId = sanitizeFirestoreId(project.id);
  const safeName = (project.name.trim() || 'Nowy projekt').slice(0, MAX_NAME_LENGTH);
  const safeParts = project.parts.slice(0, MAX_PARTS).map(encodePartForFirestore);
  const safeFasteners = project.fasteners.slice(0, MAX_FASTENERS).map((f) => stripUndefined(f));
  const safeRoom = project.room ? stripUndefined(project.room) : null;
  const safeCabinetConfigs =
    project.cabinetConfigs && Object.keys(project.cabinetConfigs).length > 0
      ? stripUndefined(project.cabinetConfigs)
      : null;

  return {
    id: safeId,
    ownerId: uid,
    name: safeName,
    parts: safeParts,
    fasteners: safeFasteners,
    room: safeRoom,
    cabinetConfigs: safeCabinetConfigs,
    clientUpdatedAt:
      typeof project.updatedAt === 'number' && Number.isFinite(project.updatedAt) && project.updatedAt >= 0
        ? project.updatedAt
        : Date.now(),
  };
}

function sanitizeMaterialsForFirestore(config: MaterialsCatalogConfig): MaterialsCatalogConfig {
  const customMaterials = config.customMaterials
    .slice(0, MAX_CUSTOM_MATERIALS)
    .map((m) => stripUndefined({ ...m, isCustom: true }));
  const overrideEntries = Object.entries(config.builtInOverrides || {}).slice(0, MAX_BUILTIN_OVERRIDES);
  const builtInOverrides: MaterialsCatalogConfig['builtInOverrides'] = {};
  for (const [key, val] of overrideEntries) {
    if (val && typeof val === 'object') {
      (builtInOverrides as Record<string, unknown>)[key] = stripUndefined(val);
    }
  }
  return { customMaterials, builtInOverrides };
}

function sanitizeQuoteForFirestore(quote: QuoteSettings): Record<string, unknown> {
  return stripUndefined({ ...DEFAULT_QUOTE_SETTINGS, ...quote }) as Record<string, unknown>;
}

/** Ensures Master Gate parent profile /users/{uid} exists before writing subcollections */
export async function ensureWorkspaceProfile(user: User): Promise<void> {
  const uid = user.uid;
  const path = `users/${uid}`;
  const ref = doc(db, 'users', uid);
  const displayName = (user.displayName?.trim() || user.email?.split('@')[0] || 'Stolarz')
    .slice(0, MAX_NAME_LENGTH);

  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        ownerId: uid,
        displayName,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else if (snap.data()?.displayName !== displayName) {
      await updateDoc(ref, {
        displayName,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

/** Real-time subscription to user's private projects (/users/{uid}/projects) */
export function subscribeCloudProjects(
  uid: string,
  onProjects: (projects: FurnitureProject[], cloudIds: Set<string>) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const path = `users/${uid}/projects`;
  // Mandatory ownerId filter matches firestore.rules allow list: existing().ownerId == request.auth.uid
  const q = query(collection(db, 'users', uid, 'projects'), where('ownerId', '==', uid));

  return onSnapshot(
    q,
    (snapshot) => {
      const projects: FurnitureProject[] = [];
      const cloudIds = new Set<string>();

      for (const docSnap of snapshot.docs) {
        cloudIds.add(docSnap.id);
        const raw = docSnap.data();
        const decodedParts = Array.isArray(raw.parts)
          ? raw.parts.map(decodePartFromFirestore)
          : [];
        const { project } = sanitizeImportedProject({
          id: docSnap.id,
          name: raw.name,
          parts: decodedParts,
          fasteners: raw.fasteners,
          room: raw.room ?? undefined,
          cabinetConfigs: raw.cabinetConfigs ?? undefined,
          updatedAt:
            typeof raw.clientUpdatedAt === 'number' && Number.isFinite(raw.clientUpdatedAt)
              ? raw.clientUpdatedAt
              : Date.now(),
        });
        if (project) {
          projects.push(project);
        }
      }

      projects.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
      onProjects(projects, cloudIds);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );
}

/** Real-time subscription to user's custom materials, prices & quote settings */
export function subscribeCloudSettings(
  uid: string,
  onSettings: (settings: {
    materialsConfig: MaterialsCatalogConfig;
    quoteSettings: QuoteSettings;
    clientUpdatedAt: number;
  } | null) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const path = `users/${uid}/settings/workspace`;
  const ref = doc(db, 'users', uid, 'settings', 'workspace');

  return onSnapshot(
    ref,
    (snap) => {
      if (!snap.exists()) {
        onSettings(null);
        return;
      }
      const data = snap.data();
      const rawMaterials = data.materialsConfig as Partial<MaterialsCatalogConfig> | undefined;
      const materialsConfig: MaterialsCatalogConfig = {
        customMaterials: Array.isArray(rawMaterials?.customMaterials)
          ? rawMaterials.customMaterials
          : [],
        builtInOverrides:
          rawMaterials?.builtInOverrides && typeof rawMaterials.builtInOverrides === 'object'
            ? rawMaterials.builtInOverrides
            : {},
      };
      const rawQuote = (data.quoteSettings || {}) as Partial<QuoteSettings>;
      const quoteSettings: QuoteSettings = {
        ...DEFAULT_QUOTE_SETTINGS,
        ...rawQuote,
        vatPercent: rawQuote.vatPercent === 8 ? 8 : 23,
      };
      const clientUpdatedAt =
        typeof data.clientUpdatedAt === 'number' && Number.isFinite(data.clientUpdatedAt)
          ? data.clientUpdatedAt
          : 0;
      onSettings({ materialsConfig, quoteSettings, clientUpdatedAt });
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.GET, path);
      } catch (wrapped) {
        onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );
}

/** Saves (creates or updates) a single furniture project in Firestore */
export async function saveCloudProject(
  uid: string,
  project: FurnitureProject,
  knownCloudIds?: Set<string>
): Promise<string> {
  const fields = buildSanitizedProjectFields(project, uid);
  const path = `users/${uid}/projects/${fields.id}`;
  const ref = doc(db, 'users', uid, 'projects', fields.id);

  try {
    let existsInCloud = knownCloudIds ? knownCloudIds.has(fields.id) : false;
    if (!existsInCloud) {
      const snap = await getDoc(ref);
      existsInCloud = snap.exists();
    }

    if (existsInCloud) {
      await updateDoc(ref, {
        name: fields.name,
        parts: fields.parts,
        fasteners: fields.fasteners,
        room: fields.room,
        cabinetConfigs: fields.cabinetConfigs,
        clientUpdatedAt: fields.clientUpdatedAt,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(ref, {
        ...fields,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      knownCloudIds?.add(fields.id);
    }
    return fields.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

/** Deletes a project document from Firestore */
export async function deleteCloudProject(uid: string, projectId: string): Promise<void> {
  const safeId = sanitizeFirestoreId(projectId);
  const path = `users/${uid}/projects/${safeId}`;
  const ref = doc(db, 'users', uid, 'projects', safeId);

  try {
    await deleteDoc(ref);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

/** Saves custom warehouse materials catalog & commercial quote settings */
export async function saveCloudWorkspaceSettings(
  uid: string,
  materialsConfig: MaterialsCatalogConfig,
  quoteSettings: QuoteSettings,
  clientUpdatedAt = Date.now()
): Promise<void> {
  const path = `users/${uid}/settings/workspace`;
  const ref = doc(db, 'users', uid, 'settings', 'workspace');
  const safeMaterials = sanitizeMaterialsForFirestore(materialsConfig);
  const safeQuote = sanitizeQuoteForFirestore(quoteSettings);

  try {
    const snap = await getDoc(ref);
    if (snap.exists()) {
      await updateDoc(ref, {
        materialsConfig: safeMaterials,
        quoteSettings: safeQuote,
        clientUpdatedAt,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(ref, {
        ownerId: uid,
        materialsConfig: safeMaterials,
        quoteSettings: safeQuote,
        clientUpdatedAt,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

/* ==================== Cloud 3D Templates (/users/{uid}/templates) ==================== */

const VALID_TEMPLATE_CATEGORIES = new Set<
  import('../data/templates').FurnitureTemplateMeta['category']
>(['Ogród i DIY', 'Magazynowe i OSB', 'Kuchenne', 'Domowe', 'Warsztat']);

function buildSanitizedTemplateFields(
  tpl: import('../data/templates').FurnitureTemplateMeta,
  uid: string
) {
  const safeId = sanitizeFirestoreId(tpl.id, 'tpl');
  const safeName = (tpl.name.trim() || 'Szablon 3D').slice(0, MAX_NAME_LENGTH);
  const safeSubtitle = (tpl.subtitle.trim() || 'Gotowy projekt 3D').slice(0, 160);
  const safeCategory = VALID_TEMPLATE_CATEGORIES.has(tpl.category) ? tpl.category : 'Domowe';
  const projFields = buildSanitizedProjectFields(tpl.project, uid);

  return {
    id: safeId,
    ownerId: uid,
    name: safeName,
    subtitle: safeSubtitle,
    category: safeCategory,
    project: {
      id: projFields.id,
      name: projFields.name,
      parts: projFields.parts,
      fasteners: projFields.fasteners,
      room: projFields.room,
      cabinetConfigs: projFields.cabinetConfigs,
    },
  };
}

/** Real-time subscription to starter & custom templates stored in Firestore */
export function subscribeCloudTemplates(
  uid: string,
  onTemplates: (templates: import('../data/templates').FurnitureTemplateMeta[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const path = `users/${uid}/templates`;
  const q = query(collection(db, 'users', uid, 'templates'), where('ownerId', '==', uid));

  return onSnapshot(
    q,
    (snapshot) => {
      const result: import('../data/templates').FurnitureTemplateMeta[] = [];
      for (const docSnap of snapshot.docs) {
        const raw = docSnap.data();
        const rawProj = raw.project && typeof raw.project === 'object' ? raw.project : null;
        if (!rawProj) continue;
        const decodedParts = Array.isArray(rawProj.parts)
          ? rawProj.parts.map(decodePartFromFirestore)
          : [];
        const { project } = sanitizeImportedProject({
          id: typeof rawProj.id === 'string' ? rawProj.id : docSnap.id,
          name: typeof rawProj.name === 'string' ? rawProj.name : raw.name,
          parts: decodedParts,
          fasteners: rawProj.fasteners,
          room: rawProj.room ?? undefined,
          cabinetConfigs: rawProj.cabinetConfigs ?? undefined,
          updatedAt: Date.now(),
        });
        if (!project) continue;
        const rawCat = raw.category as import('../data/templates').FurnitureTemplateMeta['category'];
        const category = VALID_TEMPLATE_CATEGORIES.has(rawCat) ? rawCat : 'Domowe';
        result.push({
          id: docSnap.id,
          name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : project.name,
          subtitle:
            typeof raw.subtitle === 'string' && raw.subtitle.trim()
              ? raw.subtitle.trim()
              : `${project.parts.length} elementów`,
          category,
          project,
        });
      }
      result.sort((a, b) => a.name.localeCompare(b.name, 'pl'));
      onTemplates(result);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );
}

/** Saves (creates or updates) a reusable template in Firestore */
export async function saveCloudTemplate(
  uid: string,
  template: import('../data/templates').FurnitureTemplateMeta
): Promise<string> {
  const fields = buildSanitizedTemplateFields(template, uid);
  const path = `users/${uid}/templates/${fields.id}`;
  const ref = doc(db, 'users', uid, 'templates', fields.id);

  try {
    const snap = await getDoc(ref);
    if (snap.exists()) {
      await updateDoc(ref, {
        name: fields.name,
        subtitle: fields.subtitle,
        category: fields.category,
        project: fields.project,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(ref, {
        ...fields,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    return fields.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

/** Deletes a template from Firestore */
export async function deleteCloudTemplate(uid: string, templateId: string): Promise<void> {
  const safeId = sanitizeFirestoreId(templateId, 'tpl');
  const path = `users/${uid}/templates/${safeId}`;
  const ref = doc(db, 'users', uid, 'templates', safeId);

  try {
    await deleteDoc(ref);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

/** Seeds starter sample projects into Firestore once so templates are always served from cloud */
export async function seedStarterTemplatesToCloud(
  uid: string,
  starters: import('../data/templates').FurnitureTemplateMeta[]
): Promise<void> {
  for (const tpl of starters) {
    await saveCloudTemplate(uid, tpl);
  }
}

