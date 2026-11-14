import type { RecordChange, RecordStore } from "@halonicjs/ports";

/**
 * A view of `store` whose collections all live under a tag of their own. The record contract
 * wants a store that starts empty, and its cases all use the same collection names, such as
 * "leads"; a test that has one database for every case reads and writes each case through a view.
 *
 * @example
 * recordStoreContract("D1", async () => scopedRecordStore(new D1RecordStore(env.DB)));
 */
export function scopedRecordStore(
  store: RecordStore,
  tag = `case-${crypto.randomUUID()}/`,
): RecordStore {
  const inside = (change: RecordChange): RecordChange => ({
    ...change,
    collection: `${tag}${change.collection}`,
  });
  const outside = (change: RecordChange): RecordChange => ({
    ...change,
    collection: change.collection.slice(tag.length),
  });
  return {
    append: (changes) => store.append(changes.map(inside)),
    changes: async (collection) => (await store.changes(`${tag}${collection}`)).map(outside),
    compact: (collection) => store.compact(`${tag}${collection}`),
  };
}
