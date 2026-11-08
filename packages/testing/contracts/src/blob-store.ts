import type { BlobStore } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";

/** Creates an empty store under test. */
export type MakeBlobStore = () => Promise<BlobStore>;

const helloHash = "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824";
/** SHA-256 of "x", which a refused `put` must not have stored. */
const xHash = "2d711642b726b04401627ca9fbac32f5c8530fb1903cc4db02258717921a4881";
const emptyHash = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

const bytes = (text: string): Uint8Array => new TextEncoder().encode(text);
const text = (data: Uint8Array | null): string | null =>
  data === null ? null : new TextDecoder().decode(data);

/** Media types `put` must refuse: not `type/subtype` of HTTP token characters. */
const badMediaTypes: readonly string[] = [
  "",
  "text",
  "text/",
  "/plain",
  "text/plain; charset=utf-8",
  "text /plain",
  "text/plain\r\nSet-Cookie: a=b",
  "text/plain\n",
  "text/pl/ain",
  "tëxt/plain",
];

/** Hashes `get` must answer with `null`: anything but 64 lowercase hex characters. */
const badHashes: readonly string[] = [
  "",
  "../etc/passwd",
  helloHash.toUpperCase(),
  helloHash.slice(1),
  `${helloHash}0`,
  `${helloHash.slice(0, 63)}g`,
  `../${helloHash.slice(3)}`,
];

/** The contract every {@link BlobStore} adapter passes. */
export function blobStoreContract(name: string, make: MakeBlobStore): void {
  verifies("contracts.blob-store", () => {
    describe(`BlobStore contract: ${name}`, () => {
      storingCases(make);
      refusalCases(make);
    });
  });
}

function storingCases(make: MakeBlobStore): void {
  // Ported: old "is content addressed".
  it("is content addressed", async () => {
    const store = await make();
    const a = await store.put(bytes("hello"), "text/plain");
    const b = await store.put(bytes("hello"), "text/plain");
    expect(a.hash).toBe(b.hash);
    expect(a.hash).toBe(helloHash);
    expect(text(await store.get(a.hash))).toBe("hello");
    expect(await store.get("0".repeat(64))).toBeNull();
  });

  it("returns the size and echoes this call's media type", async () => {
    const store = await make();
    expect(await store.put(bytes("hello"), "text/plain")).toEqual({
      hash: helloHash,
      size: 5,
      mediaType: "text/plain",
    });
    const again = await store.put(bytes("hello"), "application/vnd.acme+json");
    expect(again).toEqual({ hash: helloHash, size: 5, mediaType: "application/vnd.acme+json" });
    expect(text(await store.get(helloHash))).toBe("hello");
  });

  it("stores empty bytes", async () => {
    const store = await make();
    expect(await store.put(new Uint8Array(0), "application/octet-stream")).toEqual({
      hash: emptyHash,
      size: 0,
      mediaType: "application/octet-stream",
    });
    expect(await store.get(emptyHash)).toEqual(new Uint8Array(0));
  });

  it("keeps its own copy of the bytes", async () => {
    const store = await make();
    const data = bytes("hello");
    await store.put(data, "text/plain");
    data[0] = 0;
    const read = await store.get(helloHash);
    expect(text(read)).toBe("hello");
    if (read !== null) {
      read[0] = 0;
    }
    expect(text(await store.get(helloHash))).toBe("hello");
  });
}

function refusalCases(make: MakeBlobStore): void {
  it("refuses a media type that isn't type/subtype of token characters", async () => {
    const store = await make();
    for (const mediaType of badMediaTypes) {
      await expect(store.put(bytes("x"), mediaType), JSON.stringify(mediaType)).rejects.toThrow(
        RangeError,
      );
    }
    expect(await store.get(xHash)).toBeNull();
  });

  it("answers null for a hash that isn't 64 lowercase hex characters", async () => {
    const store = await make();
    await store.put(bytes("hello"), "text/plain");
    for (const hash of badHashes) {
      expect(await store.get(hash), hash).toBeNull();
    }
  });
}
