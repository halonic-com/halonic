import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { R2BlobStore } from "./r2-blob-store.ts";

/**
 * The few R2 calls the store makes, over a map, counting the writes. It is here for what the
 * contract run inside workerd can't show: that a second put writes nothing, and the coverage
 * of this file, which Node can't measure while the code runs in workerd.
 */
class CountingBucket {
  readonly objects = new Map<string, { bytes: Uint8Array; contentType: string | undefined }>();
  writes = 0;
  reads = 0;

  async head(key: string): Promise<unknown> {
    return this.objects.has(key) ? {} : null;
  }

  async put(
    key: string,
    bytes: Uint8Array,
    options: { httpMetadata: { contentType: string } },
  ): Promise<void> {
    this.writes += 1;
    this.objects.set(key, { bytes, contentType: options.httpMetadata.contentType });
  }

  async get(key: string): Promise<{ arrayBuffer(): Promise<ArrayBuffer> } | null> {
    this.reads += 1;
    const stored = this.objects.get(key);
    return stored === undefined
      ? null
      : { arrayBuffer: async () => new Uint8Array(stored.bytes).buffer };
  }
}

const helloHash = "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824";
const hello = new TextEncoder().encode("hello");

function storeOver(bucket: CountingBucket, prefix?: string): R2BlobStore {
  return new R2BlobStore(bucket, prefix);
}

verifies("cloudflare-storage.r2-blob-store", () => {
  describe("the R2 objects", () => {
    it("keeps a blob under its prefix and hash, with the put's media type", async () => {
      const bucket = new CountingBucket();
      await storeOver(bucket).put(hello, "text/plain");

      expect([...bucket.objects.keys()]).toEqual([`blobs/${helloHash}`]);
      expect(bucket.objects.get(`blobs/${helloHash}`)?.contentType).toBe("text/plain");
    });

    it("uses the prefix it is given", async () => {
      const bucket = new CountingBucket();
      await storeOver(bucket, "mine/").put(hello, "text/plain");

      expect([...bucket.objects.keys()]).toEqual([`mine/${helloHash}`]);
    });

    it("writes nothing when the bytes are already stored", async () => {
      const bucket = new CountingBucket();
      const store = storeOver(bucket);
      await store.put(hello, "text/plain");
      await store.put(hello, "application/json");

      expect(bucket.writes).toBe(1);
    });

    it("doesn't call R2 for a hash that isn't 64 lowercase hex characters", async () => {
      const bucket = new CountingBucket();

      expect(await storeOver(bucket).get("../other")).toBeNull();
      expect(bucket.reads).toBe(0);
    });

    it("answers null for a blob that isn't there", async () => {
      expect(await storeOver(new CountingBucket()).get(helloHash)).toBeNull();
    });
  });
});
