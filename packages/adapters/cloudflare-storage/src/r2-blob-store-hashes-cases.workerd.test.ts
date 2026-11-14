// Runs inside workerd: which hashes the R2 blob store lists from a real R2 bucket, across pages.

import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { R2BlobStore } from "./r2-blob-store.ts";

declare global {
  namespace Cloudflare {
    interface Env {
      /** The test Worker's R2 bucket, bound by the test file that starts workerd. */
      BLOBS: R2Bucket;
    }
  }
}

const hello = new TextEncoder().encode("hello");
const helloHash = "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824";

/** The bucket, listing one object per page, so a store with two blobs has to follow a cursor. */
const onePerPage: ConstructorParameters<typeof R2BlobStore>[0] = {
  head: (key) => env.BLOBS.head(key),
  get: (key) => env.BLOBS.get(key),
  put: (key, value, options) => env.BLOBS.put(key, value, options),
  list: (options) => env.BLOBS.list({ ...options, limit: 1 }),
};

/** A prefix of its own, so a case never finds what another left in the bucket. */
function ownPrefix(): string {
  return `case-${crypto.randomUUID()}/`;
}

describe("hashes", () => {
  it("lists the hash of every blob, across pages, and nothing else under the prefix", async () => {
    const prefix = ownPrefix();
    const store = new R2BlobStore(onePerPage, prefix);
    const first = await store.put(hello, "text/plain");
    const second = await store.put(new TextEncoder().encode("world"), "text/plain");
    await env.BLOBS.put(`${prefix}readme.txt`, hello);
    await env.BLOBS.put(`other-${prefix}${helloHash}`, hello);

    expect(await store.hashes()).toEqual([first.hash, second.hash].sort());
  });

  it("lists nothing for an empty bucket", async () => {
    expect(await new R2BlobStore(onePerPage, ownPrefix()).hashes()).toEqual([]);
  });
});
