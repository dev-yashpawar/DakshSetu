import Dexie, { type Table, type DexieOptions } from "dexie";
import type { AxiosInstance } from "axios";
import type {
  PublicUser,
  Assessment,
  RubricScore,
  Evidence,
} from "../../../shared/types";

export interface CacheEntry {
  key: string;
  ownerId: string;
  url: string;
  data: unknown;
  updatedAt: number;
}
export interface DeviceDraft {
  key: string;
  ownerId: string;
  kind: "quiz" | "practical" | "media" | "declaration";
  resourceId: string;
  payload: unknown;
  baseVersion: number;
  revision: string;
  updatedAt: number;
}
export interface SyncItem {
  id: string;
  ownerId: string;
  type: "practical" | "self" | "media" | "declaration";
  resourceId: string;
  href: string;
  payload: Record<string, unknown>;
  draftKey: string;
  draftRevision: string;
  createdAt: number;
  updatedAt: number;
  synced: boolean;
  status:
    | "pending"
    | "syncing"
    | "synced"
    | "conflict"
    | "failed"
    | "cancelled";
  attempts: number;
  nextAttemptAt: number;
  leaseUntil?: number;
  lastError?: string;
  result?: unknown;
  mediaEvidence?: Evidence;
}
export class OfflineDatabase extends Dexie {
  profileCache!: Table<CacheEntry, string>;
  qualificationCache!: Table<CacheEntry, string>;
  assessmentDrafts!: Table<DeviceDraft, string>;
  syncQueue!: Table<SyncItem, string>;
  constructor(name = "dakshsetu-offline-v1", options?: DexieOptions) {
    super(name, options);
    this.version(1).stores({
      profileCache: "key,ownerId",
      qualificationCache: "key,ownerId",
      assessmentDrafts: "key,ownerId,[ownerId+resourceId]",
      syncQueue: "id,ownerId,[ownerId+resourceId],status,createdAt",
    });
  }
}
let database: OfflineDatabase | undefined, client: AxiosInstance | undefined;
let storageError = "";
const locks = new Map<string, Promise<void>>();
export const isOnline = () =>
  typeof navigator === "undefined" || navigator.onLine !== false;
export const activeOwner = () => {
  try {
    return sessionStorage.getItem("dakshsetu-user-id");
  } catch {
    return null;
  }
};
const changed = () => {
  if (typeof window !== "undefined")
    window.dispatchEvent(new window.Event("dakshsetu:offline-change"));
};
export function getStorageError() {
  return storageError;
}
export function offlineDatabase() {
  if (typeof indexedDB === "undefined") return undefined;
  return (database ??= new OfflineDatabase());
}
export function useOfflineDatabaseForTest(db: OfflineDatabase | undefined) {
  database = db;
  storageError = "";
}
function failedStorage() {
  const message =
    "Device storage failed. Keep this page open and reconnect before leaving.";
  if (storageError !== message) {
    storageError = message;
    changed();
  }
}
export function rememberUser(user: PublicUser) {
  sessionStorage.setItem("dakshsetu-user-id", user.id);
  sessionStorage.setItem("dakshsetu-user", JSON.stringify(user));
  void storeResponse(user.id, "/auth/me", user);
  changed();
}
export function forgetUser() {
  sessionStorage.removeItem("dakshsetu-user-id");
  sessionStorage.removeItem("dakshsetu-user");
  changed();
}
export function rememberedUser(): PublicUser | null {
  try {
    const data = JSON.parse(sessionStorage.getItem("dakshsetu-user") ?? "null");
    return data && data.id === activeOwner() ? data : null;
  } catch {
    return null;
  }
}
export function offlineSessionValid() {
  try {
    const payload = JSON.parse(
      atob(
        (sessionStorage.getItem("dakshsetu-token") ?? "")
          .split(".")[1]
          .replace(/-/g, "+")
          .replace(/_/g, "/"),
      ),
    );
    return Number(payload.exp) * 1000 > Date.now();
  } catch {
    return false;
  }
}

const cacheable = (url: string) =>
  /^\/practical\/[^/]+$/.test(url) ||
  url.startsWith("/credentials/assessment/") ||
  /^\/assessments\/[^/]+\/videos$/.test(url) ||
  url === "/auth/me" ||
  url === "/workers/me" ||
  url === "/workers/portal" ||
  url.startsWith("/qualifications") ||
  url.startsWith("/self-assessment/questions/") ||
  /^\/assessor\/candidates\/[^/]+$/.test(url) ||
  url.startsWith("/passports/");
const cacheTable = (db: OfflineDatabase, url: string) =>
  url.startsWith("/qualifications") ||
  url.startsWith("/self-assessment/questions/")
    ? db.qualificationCache
    : db.profileCache;
export async function storeResponse(
  ownerId: string,
  url: string,
  data: unknown,
) {
  const db = offlineDatabase();
  if (!db || !cacheable(url) || ownerId !== activeOwner()) return;
  try {
    await cacheTable(db, url).put({
      key: ownerId + "|" + url,
      ownerId,
      url,
      data,
      updatedAt: Date.now(),
    });
  } catch {
    failedStorage();
  }
}
export async function cachedResponse(ownerId: string, url: string) {
  const db = offlineDatabase();
  if (
    !db ||
    !cacheable(url) ||
    ownerId !== activeOwner() ||
    (url === "/auth/me" && !offlineSessionValid())
  )
    return undefined;
  try {
    return (await cacheTable(db, url).get(ownerId + "|" + url))?.data;
  } catch {
    failedStorage();
    return undefined;
  }
}
export async function getDraft(
  ownerId: string,
  kind: DeviceDraft["kind"],
  resourceId: string,
) {
  const db = offlineDatabase();
  if (!db) return undefined;
  try {
    return await db.assessmentDrafts.get(
      ownerId + "|" + kind + "|" + resourceId,
    );
  } catch {
    failedStorage();
    return undefined;
  }
}
export async function saveDraft(
  ownerId: string,
  kind: DeviceDraft["kind"],
  resourceId: string,
  payload: unknown,
  baseVersion: number,
) {
  const db = offlineDatabase();
  if (!db) {
    if (!isOnline())
      throw Error(
        "Offline storage is unavailable on this device. Reconnect before saving.",
      );
    return undefined;
  }
  const key = ownerId + "|" + kind + "|" + resourceId;
  try {
    const result = await db.transaction("rw", db.assessmentDrafts, async () => {
      const previous = await db.assessmentDrafts.get(key);
      if (
        previous &&
        previous.baseVersion === baseVersion &&
        JSON.stringify(previous.payload) === JSON.stringify(payload)
      )
        return previous;
      const row: DeviceDraft = {
        key,
        ownerId,
        kind,
        resourceId,
        payload,
        baseVersion,
        revision: crypto.randomUUID(),
        updatedAt: Date.now(),
      };
      await db.assessmentDrafts.put(row);
      return row;
    });
    storageError = "";
    changed();
    return result;
  } catch {
    failedStorage();
    throw Error(storageError);
  }
}
export async function pendingItems(ownerId: string) {
  const db = offlineDatabase();
  if (!db) return [];
  try {
    return (await db.syncQueue.where("ownerId").equals(ownerId).toArray())
      .filter((i) => !i.synced && !["synced", "cancelled"].includes(i.status))
      .sort((a, b) => a.createdAt - b.createdAt);
  } catch {
    failedStorage();
    return [];
  }
}
export async function queueDeclaration(
  ownerId: string,
  profileId: string,
  payload: Record<string, unknown>,
  baseVersion: number,
) {
  const draft = await saveDraft(
    ownerId,
    "declaration",
    profileId,
    payload,
    baseVersion,
  );
  if (!draft)
    throw Error(
      "Offline storage is unavailable on this device. Reconnect before saving.",
    );
  await enqueue(
    ownerId,
    "declaration",
    profileId,
    "/worker/describe",
    { ...payload, baseVersion },
    draft,
  );
  if (isOnline()) await syncPending(ownerId);
}
export async function deviceDraftCount(ownerId: string) {
  const db = offlineDatabase();
  if (!db) return 0;
  try {
    return await db.assessmentDrafts.where("ownerId").equals(ownerId).count();
  } catch {
    failedStorage();
    return 0;
  }
}
export async function discardResource(ownerId: string, resourceId: string) {
  const db = offlineDatabase();
  if (!db) return;
  await db.transaction("rw", db.syncQueue, db.assessmentDrafts, async () => {
    const rows = await db.syncQueue
      .where("[ownerId+resourceId]")
      .equals([ownerId, resourceId])
      .toArray();
    if (
      rows.some(
        (i) => i.status === "syncing" && (i.leaseUntil ?? 0) > Date.now(),
      )
    )
      throw Error(
        "An update is syncing. Wait before changing the device draft.",
      );
    for (const row of rows)
      if (!row.synced)
        await db.syncQueue.update(row.id, {
          status: "cancelled",
          synced: true,
        });
    await db.assessmentDrafts
      .where("[ownerId+resourceId]")
      .equals([ownerId, resourceId])
      .delete();
  });
  changed();
}
export async function clearDeviceData(ownerId: string) {
  const db = offlineDatabase();
  if (!db) return;
  if ((await pendingItems(ownerId)).length)
    throw Error("Review pending changes before clearing device data.");
  await db.transaction("rw", db.tables, async () => {
    for (const table of db.tables)
      await table.where("ownerId").equals(ownerId).delete();
  });
  changed();
}
async function enqueue(
  ownerId: string,
  type: SyncItem["type"],
  resourceId: string,
  href: string,
  payload: Record<string, unknown>,
  draft: DeviceDraft,
) {
  const db = offlineDatabase()!;
  const row = await db.transaction("rw", db.syncQueue, async () => {
    const pending = (
      await db.syncQueue
        .where("[ownerId+resourceId]")
        .equals([ownerId, resourceId])
        .toArray()
    ).find(
      (i) => i.type === type && i.status === "pending" && i.attempts === 0,
    );
    const id =
      pending?.id ?? (type === "media" ? resourceId : crypto.randomUUID());
    const item: SyncItem = {
      id,
      ownerId,
      type,
      resourceId,
      href,
      payload:
        pending && type === "practical"
          ? { ...payload, baseVersion: pending.payload.baseVersion }
          : payload,
      draftKey: draft.key,
      draftRevision: draft.revision,
      createdAt: pending?.createdAt ?? Date.now(),
      updatedAt: Date.now(),
      synced: false,
      status: "pending",
      attempts: 0,
      nextAttemptAt: 0,
    };
    await db.syncQueue.put(item);
    return item;
  });
  changed();
  return row;
}
export function configureOffline(api: AxiosInstance) {
  client = api;
  api.interceptors.request.use((config) => {
    (config as typeof config & { offlineOwner?: string | null }).offlineOwner =
      activeOwner();
    return config;
  });
  api.interceptors.response.use(
    async (response) => {
      const config = response.config as typeof response.config & {
        offlineOwner?: string;
      };
      if (config.method === "get" && config.offlineOwner && config.url)
        await storeResponse(config.offlineOwner, config.url, response.data);
      return response;
    },
    async (error) => {
      const config = error.config as
        | { method?: string; url?: string; offlineOwner?: string }
        | undefined;
      if (
        !error.response &&
        config?.method === "get" &&
        config.offlineOwner &&
        config.url
      ) {
        const data = await cachedResponse(config.offlineOwner, config.url);
        if (data !== undefined)
          return {
            data,
            status: 200,
            statusText: "Offline cache",
            headers: { "x-dakshsetu-offline-cache": "true" },
            config: error.config,
          };
      }
      throw error;
    },
  );
}
async function sendMedia(
  item: Pick<SyncItem, "id" | "payload">,
): Promise<{ data: Assessment; evidence?: Evidence }> {
  if (!client) throw Error("The assessment service is unavailable.");
  const p = item.payload as {
    taskId?: string;
    assessmentId: string;
    kind: "image" | "video";
    mimeType: string;
    filename: string;
    sha256: string;
    bytes: ArrayBuffer;
  };
  const a = (await client.get<Assessment>("/assessments/" + p.assessmentId))
    .data;
  // Append-only media can safely use the current version; scores are never replaced.
  if (a.evidenceIds.includes(item.id)) return { data: a };
  if (p.taskId !== a.practicalTask?.taskId) throw { response: { status: 409, data: { error: "The practical task changed. Review the device draft before uploading." } } };
  await client.post(`/assessments/${a.id}/media-intents`, {
    id: item.id,
    type: p.kind,
    mimeType: p.mimeType,
    filename: p.filename,
    size: p.bytes.byteLength,
    sha256: p.sha256,
    ...(p.taskId ? { taskId: p.taskId } : {}),
  });
  const form = new FormData();
  form.append(p.kind, new Blob([p.bytes], { type: p.mimeType }), p.filename);
  form.append("baseVersion", String(a.version));
  form.append("uploadId", item.id);
  const result = await client.post<{
    assessment: Assessment;
    evidence: Evidence;
  }>(
    `/assessments/${a.id}/` + (p.kind === "image" ? "evidence" : "videos"),
    form,
    { timeout: 60000, onUploadProgress: (event) => {
      if (typeof window !== "undefined") window.dispatchEvent(new window.CustomEvent("dakshsetu:upload-progress", { detail: { assessmentId: a.id, percent: Math.min(100, Math.round(100 * event.loaded / (event.total || p.bytes.byteLength))) } }));
    } },
  );
  return { data: result.data.assessment, evidence: result.data.evidence };
}
export async function queueMedia(
  ownerId: string,
  a: Assessment,
  workerId: string,
  file: File,
  uploadId = crypto.randomUUID(),
) {
  const kind = file.type.startsWith("video/") ? "video" : "image";
  if (
    ![
      "image/jpeg",
      "image/png",
      "image/webp",
      "video/mp4",
      "video/webm",
    ].includes(file.type)
  )
    throw Error("Choose a JPEG, PNG, WebP, MP4 or WebM file.");
  if (file.size > (kind === "image" ? 5 : 10) * 1024 * 1024)
    throw Error(
      kind === "image"
        ? "Choose an image smaller than 5 MB."
        : "Choose a video smaller than 10 MB.",
    );
  const bytes =
    typeof file.arrayBuffer === "function"
      ? await file.arrayBuffer()
      : await new Promise<ArrayBuffer>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as ArrayBuffer);
          reader.onerror = () =>
            reject(Error("Unable to read the selected media."));
          reader.readAsArrayBuffer(file);
        });
  const digest = await crypto.subtle.digest("SHA-256", bytes),
    sha256 = Array.from(new Uint8Array(digest), (v) =>
      v.toString(16).padStart(2, "0"),
    ).join("");
  const metadata = {
      assessmentId: a.id,
      ...(a.practicalTask ? { taskId: a.practicalTask.taskId } : {}),
      kind,
      mimeType: file.type,
      filename: file.name.slice(0, 150),
      sha256,
    },
    payload = { ...metadata, bytes };
  const draft = await saveDraft(
    ownerId,
    "media",
    uploadId,
    metadata,
    a.version,
  );
  if (!draft) {
    if (!isOnline())
      throw Error(
        "Offline storage is unavailable on this device. Reconnect before saving.",
      );
    const result = await sendMedia({ id: uploadId, payload });
    if (activeOwner() === ownerId)
      window.dispatchEvent(
        new window.CustomEvent("dakshsetu:sync-complete", {
          detail: {
            resourceId: uploadId,
            type: "media",
            payload: metadata,
            assessment: result.data,
            evidence: result.evidence,
          },
        }),
      );
    return {
      queued: false as const,
      assessment: result.data,
      evidence: result.evidence,
    };
  }
  let item: SyncItem;
  try {
    item = await enqueue(
      ownerId,
      "media",
      uploadId,
      ownerId === workerId
        ? "/worker/evidence"
        : "/assessor/candidates/" + workerId + "?tab=evidence",
      payload,
      draft,
    );
  } catch {
    failedStorage();
    throw Error(storageError);
  }
  if (isOnline()) await syncPending(ownerId);
  const saved = (await offlineDatabase()!.syncQueue.get(
    item.id,
  )) as SyncItem & { mediaEvidence?: Evidence };
  if (saved?.synced)
    return {
      queued: false as const,
      assessment: saved.result as Assessment,
      evidence: saved.mediaEvidence,
    };
  if (saved?.status === "failed" || saved?.status === "conflict")
    throw Object.assign(
      Error(saved.lastError ?? "Unable to sync. Reconnect and try again."),
      { response: { status: saved.status === "conflict" ? 409 : 400 } },
    );
  return { queued: true as const };
}
async function runSync(ownerId: string) {
  const db = offlineDatabase();
  if (!db || !client || !isOnline() || activeOwner() !== ownerId) return;
  const items = await pendingItems(ownerId);
  for (const original of items) {
    if (!isOnline() || activeOwner() !== ownerId) break;
    if (
      !["pending", "syncing"].includes(original.status) ||
      original.nextAttemptAt > Date.now()
    )
      continue;
    const item = await db.transaction("rw", db.syncQueue, async () => {
      const row = await db.syncQueue.get(original.id);
      if (
        !row ||
        row.synced ||
        !["pending", "syncing"].includes(row.status) ||
        (row.status === "syncing" && (row.leaseUntil ?? 0) > Date.now())
      )
        return undefined;
      await db.syncQueue.update(row.id, {
        status: "syncing",
        leaseUntil: Date.now() + (row.type === "media" ? 150000 : 45000),
        attempts: row.attempts + 1,
      });
      return { ...row, attempts: row.attempts + 1 };
    });
    if (!item) continue;
    changed();
    try {
      let response: { data: Assessment; evidence?: Evidence };
      if (item.type === "media") response = await sendMedia(item);
      else {
        const batch = await client.post<{
          results: {
            id: string;
            status: string;
            httpStatus: number;
            data: Assessment;
            error?: string;
          }[];
        }>("/sync", {
          items: [
            {
              id: item.id,
              type: item.type,
              resourceId: item.resourceId,
              payload: item.payload,
            },
          ],
        });
        const result = batch.data.results.find((r) => r.id === item.id);
        if (!result) throw Error("Unable to sync. Reconnect and try again.");
        if (result.status !== "synced")
          throw {
            response: {
              status: result.httpStatus,
              data: { error: result.error },
            },
          };
        response = { data: result.data };
      }
      await db.transaction(
        "rw",
        db.syncQueue,
        db.assessmentDrafts,
        async () => {
          await db.syncQueue.update(item.id, {
            status: "synced",
            synced: true,
            result: response.data,
            ...(item.type === "media"
              ? {
                  payload: { ...item.payload, bytes: undefined },
                  mediaEvidence: response.evidence,
                }
              : {}),
            lastError: undefined,
            leaseUntil: undefined,
            updatedAt: Date.now(),
          });
          const draft = await db.assessmentDrafts.get(item.draftKey);
          if (draft?.revision === item.draftRevision)
            await db.assessmentDrafts.delete(draft.key);
        },
      );
      if (activeOwner() === ownerId && typeof window !== "undefined")
        window.dispatchEvent(
          new window.CustomEvent("dakshsetu:sync-complete", {
            detail: {
              resourceId: item.resourceId,
              type: item.type,
              assessment: response.data,
              evidence: response.evidence,
              payload: item.payload,
            },
          }),
        );
    } catch (error) {
      const e = error as {
        response?: { status: number; data?: { error?: string } };
        message?: string;
      };
      const status = e.response?.status;
      await db.syncQueue.update(item.id, {
        status:
          status === 409 || status === 423
            ? "conflict"
            : (status && status < 500 && status !== 408 && status !== 429) ||
                item.attempts >= 5
              ? "failed"
              : "pending",
        lastError:
          e.response?.data?.error ?? "Unable to sync. Reconnect and try again.",
        nextAttemptAt: Date.now() + Math.min(60000, 1000 * 2 ** item.attempts),
        leaseUntil: undefined,
        updatedAt: Date.now(),
      });
      if (status === 401) break;
    } finally {
      changed();
    }
  }
}
export function syncPending(ownerId: string) {
  if (locks.has(ownerId)) return locks.get(ownerId)!;
  const run = runSync(ownerId)
    .catch(() => {
      failedStorage();
    })
    .finally(() => locks.delete(ownerId));
  locks.set(ownerId, run);
  return run;
}
export async function retryPending(ownerId: string) {
  const db = offlineDatabase();
  if (!db) return;
  for (const row of await pendingItems(ownerId))
    if (row.status === "failed" || row.status === "pending")
      await db.syncQueue.update(row.id, {
        status: "pending",
        nextAttemptAt: 0,
        attempts: 0,
      });
  await syncPending(ownerId);
  changed();
}

async function queueOrSend(
  ownerId: string,
  type: "practical" | "self",
  resourceId: string,
  href: string,
  payload: Record<string, unknown>,
  draft: DeviceDraft | undefined,
) {
  if (!client) throw Error("The assessment service is unavailable.");
  if (!draft) {
    if (!isOnline())
      throw Error(
        "Offline storage is unavailable on this device. Reconnect before saving.",
      );
    return {
      queued: false as const,
      assessment: (type === "practical"
        ? await client.put<Assessment>(
            `/assessments/${resourceId}/practical`,
            payload,
          )
        : await client.post<Assessment>("/self-assessment/submit", payload)
      ).data,
    };
  }
  const row = await enqueue(ownerId, type, resourceId, href, payload, draft);
  if (isOnline()) await syncPending(ownerId);
  const saved = await offlineDatabase()!.syncQueue.get(row.id);
  if (saved?.synced)
    return { queued: false as const, assessment: saved.result as Assessment };
  if (saved?.status === "conflict" || saved?.status === "failed")
    throw Object.assign(
      Error(saved.lastError ?? "Review the device draft before retrying."),
      { response: { status: saved.status === "conflict" ? 409 : 400 } },
    );
  return { queued: true as const };
}
export async function savePractical(
  ownerId: string,
  a: Assessment,
  workerId: string,
  rows: RubricScore[],
) {
  const draft = await saveDraft(
    ownerId,
    "practical",
    a.id,
    { rubricScores: rows },
    a.version,
  );
  return queueOrSend(
    ownerId,
    "practical",
    a.id,
    "/assessor/candidates/" + workerId,
    { baseVersion: a.version, rubricScores: rows },
    draft,
  );
}
export async function submitSelf(
  ownerId: string,
  qualificationId: string,
  profileVersion: number,
  responses: { questionId: string; answer: number }[],
) {
  const draft = await saveDraft(
    ownerId,
    "quiz",
    qualificationId,
    {
      answers: Object.fromEntries(
        responses.map((r) => [r.questionId, r.answer]),
      ),
      questionIndex: 4,
      review: true,
    },
    profileVersion,
  );
  return queueOrSend(
    ownerId,
    "self",
    qualificationId,
    "/worker/quiz",
    { qualificationId, profileVersion, responses },
    draft,
  );
}
