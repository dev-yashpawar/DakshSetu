import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import axios from "axios";
import { JSDOM } from "jsdom";
import { indexedDB, IDBKeyRange } from "fake-indexeddb";
import {
  OfflineDatabase,
  useOfflineDatabaseForTest,
  configureOffline,
  rememberUser,
  saveDraft,
  getDraft,
  savePractical,
  queueMedia,
  pendingItems,
  syncPending,
  retryPending,
  storeResponse,
  cachedResponse,
  discardResource,
  clearDeviceData,
  getStorageError,
} from "../src/services/offline";
import type { Assessment, PublicUser } from "../../shared/types";
const user: PublicUser = {
  id: "owner-a",
  name: "Offline Test",
  email: "offline@example.test",
  phone: "9876543210",
  role: "assessor",
  preferredLanguage: "en",
  createdAt: "test",
  updatedAt: "test",
};
const assessment = { id: "assessment-id", version: 1 } as Assessment;
const rows = (score: number) => [
  { criterionId: "power", score, remark: "Device remark" },
];
async function fixture(adapter?: Parameters<typeof axios.create>[0]) {
  const dom = new JSDOM("<!doctype html><html></html>", {
    url: "http://127.0.0.1/",
  });
  for (const [name, value] of Object.entries({
    window: dom.window,
    navigator: dom.window.navigator,
    sessionStorage: dom.window.sessionStorage,
    indexedDB,
    IDBKeyRange,
    CustomEvent: dom.window.CustomEvent,
  }))
    Object.defineProperty(globalThis, name, {
      value,
      writable: true,
      configurable: true,
    });
  const online = (value: boolean) =>
    Object.defineProperty(dom.window.navigator, "onLine", {
      value,
      configurable: true,
    });
  online(true);
  const db = new OfflineDatabase("dakshsetu_offline_test_" + randomUUID(), {
    indexedDB,
    IDBKeyRange,
  });
  await db.open();
  useOfflineDatabaseForTest(db);
  let calls = 0;
  const api = axios.create(
    adapter ?? {
      adapter: async (config) => {
        calls++;
        const item = JSON.parse(config.data).items[0];
        return {
          data: {
            results: [
              {
                id: item.id,
                status: "synced",
                httpStatus: 200,
                data: {
                  ...assessment,
                  version: 2,
                  practical: {
                    rubricScores: item.payload.rubricScores,
                    rubricScore: 100,
                  },
                },
              },
            ],
          },
          status: 200,
          statusText: "OK",
          headers: {},
          config,
        };
      },
    },
  );
  configureOffline(api);
  rememberUser(user);
  sessionStorage.setItem(
    "dakshsetu-token",
    "x." +
      btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })) +
      ".x",
  );
  const close = async () => {
    useOfflineDatabaseForTest(undefined);
    db.close();
    await db.delete();
    dom.window.close();
  };
  return { db, api, dom, online, close, calls: () => calls };
}
test("IndexedDB caches are account-scoped and an expired offline session cannot restore authentication", async () => {
  const f = await fixture();
  try {
    await storeResponse(user.id, "/workers/me", {
      profile: { name: "Private A" },
    });
    assert.deepEqual(await cachedResponse(user.id, "/workers/me"), {
      profile: { name: "Private A" },
    });
    rememberUser({ ...user, id: "owner-b" });
    assert.equal(await cachedResponse(user.id, "/workers/me"), undefined);
    assert.equal(await cachedResponse("owner-b", "/workers/me"), undefined);
    rememberUser(user);
    await storeResponse(user.id, "/auth/me", user);
    sessionStorage.setItem(
      "dakshsetu-token",
      "x." + btoa(JSON.stringify({ exp: 1 })) + ".x",
    );
    assert.equal(await cachedResponse(user.id, "/auth/me"), undefined);
  } finally {
    await f.close();
  }
});
test("offline saves coalesce only unattempted work, survive reopening IndexedDB, and sync once", async () => {
  const f = await fixture();
  try {
    f.online(false);
    assert.equal(
      (await savePractical(user.id, assessment, "worker-id", rows(1))).queued,
      true,
    );
    await savePractical(user.id, assessment, "worker-id", rows(3));
    assert.equal(f.calls(), 0);
    let queue = await pendingItems(user.id);
    assert.equal(queue.length, 1);
    assert.equal(
      (queue[0].payload.rubricScores as { score: number }[])[0].score,
      3,
    );
    const name = f.db.name;
    f.db.close();
    const reopened = new OfflineDatabase(name, { indexedDB, IDBKeyRange });
    await reopened.open();
    useOfflineDatabaseForTest(reopened);
    assert.ok(await getDraft(user.id, "practical", assessment.id));
    f.online(true);
    await Promise.all([syncPending(user.id), syncPending(user.id)]);
    assert.equal(f.calls(), 1);
    assert.equal((await pendingItems(user.id)).length, 0);
    assert.equal(
      await getDraft(user.id, "practical", assessment.id),
      undefined,
    );
    reopened.close();
  } finally {
    await f.close();
  }
});
test("a sync acknowledgement preserves a newer draft created while the request was in flight", async () => {
  let start!: () => void, finish!: (value: unknown) => void;
  const started = new Promise<void>((r) => (start = r)),
    released = new Promise((r) => (finish = r));
  const f = await fixture({
    adapter: async (config) => {
      const item = JSON.parse(config.data).items[0];
      start();
      await released;
      return {
        data: {
          results: [
            {
              id: item.id,
              status: "synced",
              httpStatus: 200,
              data: { ...assessment, version: 2 },
            },
          ],
        },
        status: 200,
        statusText: "OK",
        headers: {},
        config,
      };
    },
  });
  try {
    f.online(false);
    await savePractical(user.id, assessment, "worker-id", rows(1));
    f.online(true);
    const run = syncPending(user.id);
    await started;
    const newer = await saveDraft(
      user.id,
      "practical",
      assessment.id,
      { rubricScores: rows(2) },
      1,
    );
    finish(null);
    await run;
    assert.equal(
      (await getDraft(user.id, "practical", assessment.id))?.revision,
      newer?.revision,
    );
  } finally {
    await f.close();
  }
});
test("conflicts remain visible and are never auto-overwritten or automatically retried", async () => {
  let calls = 0;
  const f = await fixture({
    adapter: async (config) => {
      calls++;
      const item = JSON.parse(config.data).items[0];
      return {
        data: {
          results: [
            {
              id: item.id,
              status: "conflict",
              httpStatus: 409,
              error:
                "The assessment changed in another session. Reload it before continuing.",
            },
          ],
        },
        status: 200,
        statusText: "OK",
        headers: {},
        config,
      };
    },
  });
  try {
    f.online(false);
    await savePractical(user.id, assessment, "worker-id", rows(3));
    f.online(true);
    await syncPending(user.id);
    assert.equal((await pendingItems(user.id))[0].status, "conflict");
    await retryPending(user.id);
    assert.equal(calls, 1);
    assert.ok(await getDraft(user.id, "practical", assessment.id));
    await assert.rejects(clearDeviceData(user.id), /pending changes/);
    await discardResource(user.id, assessment.id);
    assert.equal((await pendingItems(user.id)).length, 0);
  } finally {
    await f.close();
  }
});
test("transient failures use bounded retries, while account switching prevents another user’s sync", async () => {
  let calls = 0;
  const f = await fixture({
    adapter: async (config) => {
      calls++;
      throw new axios.AxiosError(
        "Unavailable",
        "ERR_BAD_RESPONSE",
        config,
        undefined,
        {
          status: calls === 1 ? 429 : 503,
          data: { error: "Unavailable" },
          statusText: "Unavailable",
          headers: {},
          config,
        },
      );
    },
  });
  try {
    f.online(false);
    await savePractical(user.id, assessment, "worker-id", rows(3));
    f.online(true);
    rememberUser({ ...user, id: "owner-b" });
    await syncPending(user.id);
    assert.equal(calls, 0);
    rememberUser(user);
    for (let i = 0; i < 5; i++) {
      for (const row of await pendingItems(user.id))
        await f.db.syncQueue.update(row.id, { nextAttemptAt: 0 });
      await syncPending(user.id);
    }
    assert.equal(calls, 5);
    assert.equal((await pendingItems(user.id))[0].status, "failed");
    await syncPending(user.id);
    assert.equal(calls, 5);
  } finally {
    await f.close();
  }
});
test('offline media retains bytes, sends metadata before binary, and clears local bytes only after acknowledgement',async()=>{
  const order:string[]=[];let intent:any;
  const f=await fixture({adapter:async config=>{
    if(config.method==='get'){order.push('assessment');return {data:{...assessment,evidenceIds:[]},status:200,statusText:'OK',headers:{},config};}
    if(config.url?.endsWith('/media-intents')){order.push('metadata');intent=JSON.parse(config.data);return {data:{id:intent.id,status:'PENDING'},status:200,statusText:'OK',headers:{},config};}
    order.push('binary');assert.equal(config.data.get('uploadId'),intent.id);assert.equal(config.data.get('image').size,4);
    return {data:{assessment:{...assessment,version:2,evidenceIds:[intent.id]},evidence:{id:intent.id,type:'image',filename:'offline.png'}},status:201,statusText:'Created',headers:{},config};
  }});
  try{
    f.online(false);const id=randomUUID();const saved=await queueMedia(user.id,assessment,'worker-id',new File([new Uint8Array([1,2,3,4])],'offline.png',{type:'image/png'}),id);assert.equal(saved.queued,true);assert.deepEqual(order,[]);
    const row=(await pendingItems(user.id))[0];assert.equal((row.payload.bytes as ArrayBuffer).byteLength,4);assert.equal(row.id,id);assert.ok(await getDraft(user.id,'media',id));
    f.online(true);await syncPending(user.id);assert.deepEqual(order,['assessment','metadata','binary']);assert.equal((await pendingItems(user.id)).length,0);assert.equal((await f.db.syncQueue.get(id))!.payload.bytes,undefined);assert.equal(await getDraft(user.id,'media',id),undefined);
  }finally{await f.close()}
});
test("storage failures never produce a saved acknowledgement or a sync item", async () => {
  const f = await fixture();
  try {
    f.online(false);
    f.db.assessmentDrafts.put = async () => {
      throw new DOMException("Full", "QuotaExceededError");
    };
    await assert.rejects(
      savePractical(user.id, assessment, "worker-id", rows(3)),
      /Device storage failed/,
    );
    assert.match(getStorageError(), /Device storage failed/);
    assert.equal((await pendingItems(user.id)).length, 0);
  } finally {
    await f.close();
  }
});
