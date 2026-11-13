// Runs inside workerd: the RecordStore and TokenStore contracts against a real D1 database.

import { env } from "cloudflare:workers";
import { createTokenStore, tokenKeySecret } from "@halonicjs/adapter-token-store";
import type { RecordChange, RecordStore } from "@halonicjs/ports";
import { encodeBase64url } from "@halonicjs/std";
import { recordStoreContract, tokenStoreContract } from "@halonicjs/testing-contracts";
import { D1RecordStore } from "./d1-record-store.ts";

declare global {
  namespace Cloudflare {
    interface Env {
      /** The test Worker's D1 database, bound by the test file that starts workerd. */
      DB: D1Database;
    }
  }
}

/**
 * A view of the store whose collections all live under a tag of this case. The contracts want a
 * store that starts empty and every case uses the same names, such as "leads"; one D1 database
 * serves them all, so each case reads and writes through a tag of its own.
 */
function scoped(store: RecordStore): RecordStore {
  const tag = `case-${crypto.randomUUID()}/`;
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

recordStoreContract("D1", async () => scoped(new D1RecordStore(env.DB)));

tokenStoreContract("D1 token store", async () => {
  // One key per case: a key that changed on every read would make every sealed token unreadable.
  const key = encodeBase64url(crypto.getRandomValues(new Uint8Array(32)));
  return createTokenStore({
    records: scoped(new D1RecordStore(env.DB)),
    secrets: { get: async (name) => (name === tokenKeySecret ? key : null) },
    clock: { now: () => new Date("2026-11-08T12:00:00.000Z") },
  });
});
