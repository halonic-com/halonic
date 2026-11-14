// Runs inside workerd: what the R2 blob store does to a real R2 bucket, beyond the BlobStore
// contract: which key and media type it writes, and when it doesn't call R2 at all.

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

const helloHash = "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824";
const hello = new TextEncoder().encode("hello");

/** The bucket, with a count of the calls the store makes on it. */
function countingBucket(): {
  bucket: ConstructorParameters<typeof R2BlobStore>[0];
  calls: { put: number; get: number };
} {
  const calls = { put: 0, get: 0 };
  const bucket = {
    head: (key: string) => env.BLOBS.head(key),
    get: (key: string) => {
      calls.get += 1;
      return env.BLOBS.get(key);
    },
    put: (key: string, value: Uint8Array, options: { httpMetadata: { contentType: string } }) => {
      calls.put += 1;
      return env.BLOBS.put(key, value, options);
    },
  };
  return { bucket, calls };
}

/** A prefix of its own, so a case never finds what another left in the bucket. */
function ownPrefix(): string {
  return `case-${crypto.randomUUID()}/`;
}

async function keysUnder(prefix: string): Promise<string[]> {
  return (await env.BLOBS.list({ prefix })).objects.map((object) => object.key);
}

describe("the R2 objects", () => {
  it("keeps a blob under its prefix and hash, with the put's media type", async () => {
    const prefix = ownPrefix();
    await new R2BlobStore(env.BLOBS, prefix).put(hello, "text/plain");

    expect(await keysUnder(prefix)).toEqual([`${prefix}${helloHash}`]);
    const stored = await env.BLOBS.head(`${prefix}${helloHash}`);
    expect(stored?.httpMetadata?.contentType).toBe("text/plain");
  });

  it("keeps blobs under blobs/ unless it is given another prefix", async () => {
    await new R2BlobStore(env.BLOBS).put(hello, "text/plain");

    expect(await keysUnder("blobs/")).toEqual([`blobs/${helloHash}`]);
  });

  it("writes nothing when the bytes are already stored", async () => {
    const prefix = ownPrefix();
    const { bucket, calls } = countingBucket();
    const store = new R2BlobStore(bucket, prefix);
    await store.put(hello, "text/plain");
    await store.put(hello, "application/json");

    expect(calls.put).toBe(1);
    const stored = await env.BLOBS.head(`${prefix}${helloHash}`);
    expect(stored?.httpMetadata?.contentType).toBe("text/plain");
  });

  it("doesn't call R2 for a hash that isn't 64 lowercase hex characters", async () => {
    const { bucket, calls } = countingBucket();

    expect(await new R2BlobStore(bucket, ownPrefix()).get("../other")).toBeNull();
    expect(calls.get).toBe(0);
  });

  it("answers null for a blob that isn't there", async () => {
    expect(await new R2BlobStore(env.BLOBS, ownPrefix()).get(helloHash)).toBeNull();
  });
});
