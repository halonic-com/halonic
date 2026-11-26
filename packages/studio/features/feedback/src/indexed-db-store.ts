import type { FeedbackStore, WaitingFeedback } from "./outbox.ts";

/** The page's own database for waiting feedback; it needs no shell command. */
export const feedbackDatabase = { name: "halonic-feedback", version: 1, store: "waiting" } as const;

/**
 * One waiting feedback as the database keeps it. The screenshot is a `Blob`, so listing the
 * entries reads no image bytes: the webview keeps a blob's bytes apart and reads them on demand.
 */
interface Entry extends WaitingFeedback {
  readonly png: Blob | null;
}

/** The part of the page's `indexedDB` the store uses. */
export type FeedbackDatabases = Pick<IDBFactory, "open">;

/**
 * Waiting feedback in the page's IndexedDB (HAL-19010, option 2a): one database, one store, one
 * entry per feedback by its ID, holding its screenshot. Removing an entry removes its screenshot
 * in the same transaction, so neither outlives the other.
 */
export class IndexedDbFeedbackStore implements FeedbackStore {
  private readonly database: IDBDatabase;

  private constructor(database: IDBDatabase) {
    this.database = database;
  }

  /**
   * Opens the database, creating its store the first time.
   *
   * @example
   * const store = await IndexedDbFeedbackStore.open(indexedDB);
   */
  static async open(databases: FeedbackDatabases): Promise<IndexedDbFeedbackStore> {
    const opening = databases.open(feedbackDatabase.name, feedbackDatabase.version);
    opening.onupgradeneeded = () => {
      if (!opening.result.objectStoreNames.contains(feedbackDatabase.store)) {
        opening.result.createObjectStore(feedbackDatabase.store, { keyPath: "id" });
      }
    };
    return new IndexedDbFeedbackStore(await settled(opening));
  }

  async list(): Promise<readonly WaitingFeedback[]> {
    const entries = await settled<Entry[]>(this.entries("readonly").getAll());
    return entries.map(({ png: _png, ...feedback }) => feedback);
  }

  async add(feedback: WaitingFeedback, image: Uint8Array | null): Promise<void> {
    // `slice` copies into a plain ArrayBuffer, which a Blob takes and a shared one isn't.
    const png = image === null ? null : new Blob([image.slice()], { type: "image/png" });
    const entries = this.entries("readwrite");
    entries.put({ ...feedback, png } satisfies Entry);
    await finished(entries.transaction);
  }

  async update(feedback: WaitingFeedback): Promise<void> {
    const entries = this.entries("readwrite");
    const reading = entries.get(feedback.id);
    // Put inside the read's own event, while the transaction is still open; one removed in
    // between stays removed.
    reading.onsuccess = () => {
      const entry: Entry | undefined = reading.result;
      if (entry !== undefined) entries.put({ ...feedback, png: entry.png } satisfies Entry);
    };
    await finished(entries.transaction);
  }

  async loadImage(id: string): Promise<Uint8Array | null> {
    const entry = await settled<Entry | undefined>(this.entries("readonly").get(id));
    if (entry === undefined || entry.png === null) return null;
    return new Uint8Array(await entry.png.arrayBuffer());
  }

  async remove(id: string): Promise<void> {
    const entries = this.entries("readwrite");
    entries.delete(id);
    await finished(entries.transaction);
  }

  private entries(mode: IDBTransactionMode): IDBObjectStore {
    return this.database
      .transaction(feedbackDatabase.store, mode)
      .objectStore(feedbackDatabase.store);
  }
}

/** A request's result, or its error. */
function settled<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Settles once a transaction has written everything, or with why it didn't. */
function finished(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}
