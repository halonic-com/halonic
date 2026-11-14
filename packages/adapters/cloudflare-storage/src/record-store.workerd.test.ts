// Runs inside workerd: the RecordStore and TokenStore contracts against a real D1 database.

import { env } from "cloudflare:workers";
import { createTokenStore, tokenKeySecret } from "@halonicjs/adapter-token-store";
import { encodeBase64url } from "@halonicjs/std";
import {
  recordStoreContract,
  scopedRecordStore,
  tokenStoreContract,
} from "@halonicjs/testing-contracts";
import { D1RecordStore } from "./d1-record-store.ts";

declare global {
  namespace Cloudflare {
    interface Env {
      /** The test Worker's D1 database, bound by the test file that starts workerd. */
      DB: D1Database;
    }
  }
}

recordStoreContract("D1", async () => scopedRecordStore(new D1RecordStore(env.DB)));

tokenStoreContract("D1 token store", async () => {
  // One key per case: a key that changed on every read would make every sealed token unreadable.
  const key = encodeBase64url(crypto.getRandomValues(new Uint8Array(32)));
  return createTokenStore({
    records: scopedRecordStore(new D1RecordStore(env.DB)),
    secrets: { get: async (name) => (name === tokenKeySecret ? key : null) },
    clock: { now: () => new Date("2026-11-08T12:00:00.000Z") },
  });
});
