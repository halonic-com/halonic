import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { feedbackDatabase, IndexedDbFeedbackStore } from "./indexed-db-store.ts";
import type { WaitingFeedback } from "./outbox.ts";

/** A request as IndexedDB gives one: its result and handlers, settled a moment later. */
interface FakeRequest {
  result: unknown;
  error: Error | null;
  onsuccess: (() => void) | null;
  onerror: (() => void) | null;
  onupgradeneeded?: (() => void) | null;
}

/**
 * The few parts of IndexedDB the store uses, kept in memory (Liam on HAL-19010: no
 * `fake-indexeddb`). Requests settle in later microtasks, and a transaction completes once its
 * last request has, as in a browser. `failWrites` aborts every read-write transaction instead.
 */
class FakeDatabases {
  readonly entries = new Map<string, unknown>();
  readonly stores = new Set<string>();
  readonly modes: string[] = [];
  failWrites = false;

  open(name: string, version: number) {
    const opening = fakeRequest();
    queueMicrotask(() => {
      expect([name, version]).toEqual([feedbackDatabase.name, feedbackDatabase.version]);
      opening.result = this.database();
      opening.onupgradeneeded?.();
      opening.onsuccess?.();
    });
    return opening;
  }

  private database() {
    return {
      objectStoreNames: { contains: (store: string) => this.stores.has(store) },
      createObjectStore: (store: string, options: { keyPath: string }) => {
        expect(options).toEqual({ keyPath: "id" });
        this.stores.add(store);
      },
      transaction: (store: string, mode: string) => {
        expect(this.stores.has(store)).toBe(true);
        this.modes.push(mode);
        return this.transaction(mode);
      },
    };
  }

  private transaction(mode: string) {
    let pending = 0;
    const transaction = {
      error: null as Error | null,
      oncomplete: null as (() => void) | null,
      onerror: null as (() => void) | null,
      onabort: null as (() => void) | null,
      objectStore: () => objectStore,
    };
    const settle = (request: FakeRequest, work: () => unknown) => {
      pending += 1;
      queueMicrotask(() => {
        request.result = work();
        request.onsuccess?.();
        pending -= 1;
        if (pending > 0) return;
        queueMicrotask(() => {
          if (mode === "readwrite" && this.failWrites) {
            transaction.error = new Error("QuotaExceededError");
            transaction.onabort?.();
          } else {
            transaction.oncomplete?.();
          }
        });
      });
      return request;
    };
    const objectStore = {
      transaction,
      getAll: () => settle(fakeRequest(), () => [...this.entries.values()]),
      get: (id: string) => settle(fakeRequest(), () => this.entries.get(id)),
      put: (entry: { id: string }) =>
        settle(fakeRequest(), () => this.entries.set(entry.id, entry)),
      delete: (id: string) => settle(fakeRequest(), () => this.entries.delete(id)),
    };
    return transaction;
  }
}

function fakeRequest(): FakeRequest {
  return { result: undefined, error: null, onsuccess: null, onerror: null };
}

function waiting(id: string, imageBytes: number): WaitingFeedback {
  return {
    id,
    task: {
      title: `Feedback ${id}`,
      description: "Run list jumps",
      project: "Acme apps",
      assignee: "Robin",
      screenshot: null,
    },
    destination: "acme",
    keptAt: 1000,
    imageBytes,
    refusals: 0,
    lastRefusal: null,
  };
}

async function openStore(databases = new FakeDatabases()) {
  // The fake has only the members the store calls, so it stands in for the browser's type.
  const store = await IndexedDbFeedbackStore.open(databases as unknown as IDBFactory);
  return { store, databases };
}

const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

verifies("feedback.outbox-retry", () => {
  it("keeps each feedback with its screenshot under its ID, and lists none of the bytes", async () => {
    const { store, databases } = await openStore();

    await store.add(waiting("a", png.byteLength), png);
    await store.add(waiting("b", 0), null);

    expect(databases.stores).toEqual(new Set([feedbackDatabase.store]));
    expect(await store.list()).toEqual([waiting("a", png.byteLength), waiting("b", 0)]);
    expect(databases.entries.get("a")).toMatchObject({ id: "a", png: expect.any(Blob) });
    expect(await store.loadImage("a")).toEqual(png);
    expect(await store.loadImage("b")).toBeNull();
    expect(await store.loadImage("gone")).toBeNull();
  });

  it("removes a feedback and its screenshot in one read-write transaction", async () => {
    const { store, databases } = await openStore();
    await store.add(waiting("a", png.byteLength), png);
    databases.modes.length = 0;

    await store.remove("a");

    expect(databases.modes).toEqual(["readwrite"]);
    expect(databases.entries.size).toBe(0);
    expect(await store.loadImage("a")).toBeNull();
  });

  it("updates a refusal count, keeping the screenshot, and brings no removed feedback back", async () => {
    const { store } = await openStore();
    await store.add(waiting("a", png.byteLength), png);
    const refused = { ...waiting("a", png.byteLength), refusals: 1, lastRefusal: "no project" };

    await store.update(refused);
    await store.update({ ...waiting("gone", 0), refusals: 1 });

    expect(await store.list()).toEqual([refused]);
    expect(await store.loadImage("a")).toEqual(png);
  });

  it("opens an existing database without creating its store again, and fails a write that aborts", async () => {
    const databases = new FakeDatabases();
    await openStore(databases);
    const { store } = await openStore(databases);
    databases.failWrites = true;

    await expect(store.add(waiting("a", 0), null)).rejects.toThrow("QuotaExceededError");
  });
});
