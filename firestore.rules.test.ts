/**
 * Firestore Security Rules — Phase 0 "Dirty Dozen" Specification Suite
 * Verifies that all 12 adversarial payloads targeting Identity, Integrity,
 * Master Gate, Volumetric Guards, and Temporal Integrity are rejected.
 *
 * Run against Firebase Firestore Emulator with @firebase/rules-unit-testing
 * when running local emulator security audits.
 */

export interface DirtyDozenCase {
  id: number;
  name: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  path: string;
  auth: { uid: string; email_verified: boolean } | null;
  payload?: Record<string, unknown>;
  expected: 'PERMISSION_DENIED';
  enforcedByPillar: string;
}

export const DIRTY_DOZEN_PAYLOADS: DirtyDozenCase[] = [
  {
    id: 1,
    name: 'Unauthenticated Project Read',
    operation: 'get',
    path: '/users/userA/projects/proj_1',
    auth: null,
    expected: 'PERMISSION_DENIED',
    enforcedByPillar: 'Global Safety Net & Request Authentication',
  },
  {
    id: 2,
    name: 'Cross-User Project Theft',
    operation: 'get',
    path: '/users/userA/projects/proj_1',
    auth: { uid: 'userB', email_verified: true },
    expected: 'PERMISSION_DENIED',
    enforcedByPillar: 'Pillar 6 (PII & Owner Isolation)',
  },
  {
    id: 3,
    name: 'Cross-User List Scraping',
    operation: 'list',
    path: '/users/userA/projects',
    auth: { uid: 'userB', email_verified: true },
    expected: 'PERMISSION_DENIED',
    enforcedByPillar: 'Pillar 8 (Secure List Queries)',
  },
  {
    id: 4,
    name: 'Unverified Email Write',
    operation: 'create',
    path: '/users/userA',
    auth: { uid: 'userA', email_verified: false },
    payload: {
      ownerId: 'userA',
      displayName: 'Arek',
      createdAt: 'REQUEST_TIME',
      updatedAt: 'REQUEST_TIME',
    },
    expected: 'PERMISSION_DENIED',
    enforcedByPillar: 'Verified Users Mandate (email_verified == true)',
  },
  {
    id: 5,
    name: 'Identity Spoofing on Create',
    operation: 'create',
    path: '/users/userA/projects/proj_1',
    auth: { uid: 'userA', email_verified: true },
    payload: {
      id: 'proj_1',
      ownerId: 'userB',
      name: 'Kuchnia',
      parts: [],
      fasteners: [],
      room: null,
      cabinetConfigs: null,
      clientUpdatedAt: 1700000000000,
      createdAt: 'REQUEST_TIME',
      updatedAt: 'REQUEST_TIME',
    },
    expected: 'PERMISSION_DENIED',
    enforcedByPillar: 'Pillar 2 (Identity Integrity)',
  },
  {
    id: 6,
    name: 'Shadow Field Injection (Ghost Field)',
    operation: 'update',
    path: '/users/userA/projects/proj_1',
    auth: { uid: 'userA', email_verified: true },
    payload: {
      isVerified: true,
      isAdmin: true,
    },
    expected: 'PERMISSION_DENIED',
    enforcedByPillar: 'Pillar 2 & Action-Based affectedKeys().hasOnly()',
  },
  {
    id: 7,
    name: 'Immutable createdAt Tampering',
    operation: 'update',
    path: '/users/userA/projects/proj_1',
    auth: { uid: 'userA', email_verified: true },
    payload: {
      createdAt: '1999-01-01T00:00:00Z',
    },
    expected: 'PERMISSION_DENIED',
    enforcedByPillar: 'Immortal Field Rule',
  },
  {
    id: 8,
    name: 'Immutable ownerId Tampering',
    operation: 'update',
    path: '/users/userA/projects/proj_1',
    auth: { uid: 'userA', email_verified: true },
    payload: {
      ownerId: 'userB',
    },
    expected: 'PERMISSION_DENIED',
    enforcedByPillar: 'Immortal Field Rule & Identity Integrity',
  },
  {
    id: 9,
    name: 'Client Timestamp Forgery',
    operation: 'create',
    path: '/users/userA/projects/proj_1',
    auth: { uid: 'userA', email_verified: true },
    payload: {
      id: 'proj_1',
      ownerId: 'userA',
      name: 'Szafa',
      parts: [],
      fasteners: [],
      room: null,
      cabinetConfigs: null,
      clientUpdatedAt: 1700000000000,
      createdAt: '2020-01-01T00:00:00Z',
      updatedAt: '2020-01-01T00:00:00Z',
    },
    expected: 'PERMISSION_DENIED',
    enforcedByPillar: 'Temporal Integrity (request.time)',
  },
  {
    id: 10,
    name: 'ID Poisoning (Invalid Chars / Oversized ID)',
    operation: 'create',
    path: `/users/userA/projects/${'a'.repeat(160)}`,
    auth: { uid: 'userA', email_verified: true },
    payload: {
      id: 'a'.repeat(160),
      ownerId: 'userA',
      name: 'Szafa',
      parts: [],
      fasteners: [],
      clientUpdatedAt: 1700000000000,
    },
    expected: 'PERMISSION_DENIED',
    enforcedByPillar: 'Pillar 3 (Path Variable Hardening)',
  },
  {
    id: 11,
    name: 'Value Poisoning (Oversized Name / Bad Array Element Type)',
    operation: 'update',
    path: '/users/userA/projects/proj_1',
    auth: { uid: 'userA', email_verified: true },
    payload: {
      name: 'X'.repeat(300),
      parts: ['not-a-map'],
    },
    expected: 'PERMISSION_DENIED',
    enforcedByPillar: 'Pillar 2 & Pillar 5 (Total Array Guarding)',
  },
  {
    id: 12,
    name: 'Orphaned Subcollection Write / Unauthorized Setting Doc ID',
    operation: 'create',
    path: '/users/userA/settings/evil_doc',
    auth: { uid: 'userA', email_verified: true },
    payload: {
      ownerId: 'userA',
      materialsConfig: { customMaterials: [], builtInOverrides: {} },
      quoteSettings: {},
      clientUpdatedAt: 1700000000000,
      createdAt: 'REQUEST_TIME',
      updatedAt: 'REQUEST_TIME',
    },
    expected: 'PERMISSION_DENIED',
    enforcedByPillar: 'Pillar 1 (Master Gate) & Explicit Setting ID Lock',
  },
];
