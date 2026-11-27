# Stolarz 3D — Firestore Security Specification (Phase 0 TDD)

## 1. Data Invariants
1. **Strict Single-Tenant Ownership**: Every document under `/users/{userId}` (profile, projects, templates, workspace settings) belongs exclusively to `request.auth.uid == userId` and carries an immutable `ownerId == request.auth.uid`.
2. **Master Gate Relational Sync**: A project (`/users/{userId}/projects/{projectId}`), template (`/users/{userId}/templates/{templateId}`), or settings doc (`/users/{userId}/settings/workspace`) cannot be read (single `get`), created, updated, or deleted unless the parent workspace anchor `/users/{userId}` exists and has `ownerId == request.auth.uid`.
3. **Verified Identity Mandate**: All write operations require an authenticated user with `request.auth.token.email_verified == true`.
4. **No Shadow Fields / No Orphan Keys**: Every document creation strictly validates both `hasAll([...])` and `hasOnly([...])`; every update uses named actions with explicit `affectedKeys().hasOnly([...])` wrapped inside `isValid[Entity](incoming())`.
5. **Immutable Anchors & Temporal Integrity**: `ownerId`, `id`, and `createdAt` are immutable after creation; `createdAt == request.time` on create and `updatedAt == request.time` on both create and update.
6. **Volumetric & ID Poisoning Guards**: Every path ID matches `^[a-zA-Z0-9_\-]+$` (`<= 128` chars), every string has explicit `.size()` bounds, `parts.size() <= 400`, `fasteners.size() <= 2000`, `customMaterials.size() <= 100`, and list elements are type-guarded.
7. **Zero-Trust List Queries**: `allow list` on `/users/{userId}/projects/{projectId}` enforces `isOwner(userId) && existing().ownerId == request.auth.uid` directly against `resource.data` without `get()`/`exists()` cost amplification.

## 2. The "Dirty Dozen" Adversarial Payloads (All MUST fail with PERMISSION_DENIED)

1. **Unauthenticated Project Read**: `GET /users/userA/projects/proj_1` with `auth = null`.
2. **Cross-User Project Theft**: `GET /users/userA/projects/proj_1` signed in as `userB`.
3. **Cross-User List Scraping**: `LIST /users/userA/projects` signed in as `userB`.
4. **Unverified Email Write**: `CREATE /users/userA` with `auth = { uid: "userA", token: { email_verified: false } }`.
5. **Identity Spoofing on Create**: `CREATE /users/userA/projects/proj_1` with `{ ownerId: "userB", ... }`.
6. **Shadow Field Injection (Ghost Field)**: `UPDATE /users/userA/projects/proj_1` adding `{ isAdmin: true }`.
7. **Immutable Field Tampering (`createdAt`)**: `UPDATE /users/userA/projects/proj_1` modifying `createdAt`.
8. **Immutable Field Tampering (`ownerId`)**: `UPDATE /users/userA/projects/proj_1` changing `ownerId` to `"userB"`.
9. **Client Timestamp Forgery**: `CREATE /users/userA/projects/proj_1` with `updatedAt: "2020-01-01T00:00:00Z"` instead of `serverTimestamp()`.
10. **ID Poisoning / Path Traversal**: `CREATE /users/userA/projects/../../evil$id` or 200-char ID string.
11. **Value Poisoning / Volumetric DoS**: `UPDATE /users/userA/projects/proj_1` with `name: "A".repeat(500)` or `parts: ["not-a-map"]`.
12. **Orphaned Subcollection Write / Unauthorized Setting ID**: `CREATE /users/userA/projects/proj_1` before `/users/userA` exists, or `CREATE /users/userA/settings/arbitrary_doc` (`settingId != 'workspace'`).
