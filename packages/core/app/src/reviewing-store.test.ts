import type { Digest } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { isReviewPath, ReviewingDefinitionStore } from "./reviewing-store.ts";
import { TestDefinitionStore } from "./testing/memory-definition-store.ts";

/** SHA-256 from Web Crypto, as the platform's `Digest` adapter gives it. */
const digest: Digest = {
  async sha256(data) {
    return new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(data)));
  },
};

const record = `.halonic/review/files/${"a".repeat(64)}.json`;

function setUp() {
  const inner = new TestDefinitionStore({
    "agents/clerk.agent.yaml": "name: Clerk\n",
    "hubs/p/.halonic/source.json": "{}\n",
    [record]: "{}\n",
  });
  return { inner, store: new ReviewingDefinitionStore(inner, digest) };
}

verifies("app.review-hidden", () => {
  it("leaves the records out of every listing, and keeps the rest of .halonic", async () => {
    const { store } = setUp();
    expect(await store.list()).toEqual(["agents/clerk.agent.yaml", "hubs/p/.halonic/source.json"]);
    expect(await store.list(".halonic")).toEqual([]);
  });

  it("refuses to list, read, write or remove in the review folder", async () => {
    const { inner, store } = setUp();
    await expect(store.list(".halonic/review")).rejects.toThrow(RangeError);
    await expect(store.read(record)).rejects.toThrow(RangeError);
    await expect(store.write(record, "[]\n")).rejects.toThrow(RangeError);
    await expect(store.remove(record)).rejects.toThrow(RangeError);
    expect(inner.files.get(record)).toBe("{}\n");
  });

  it("refuses the folder however it is written", () => {
    for (const path of [
      ".halonic/review",
      ".Halonic/REVIEW/x.json",
      ".halonic./review /x",
      ".hal\u200Conic/review/x",
    ]) {
      expect(isReviewPath(path), path).toBe(true);
    }
    for (const path of [".halonic/reviews/x", ".halonic", "review/x", "hubs/p/.halonic/review/x"]) {
      expect(isReviewPath(path), path).toBe(false);
    }
  });

  it("passes everything else through", async () => {
    const { inner, store } = setUp();
    expect(store.location).toBe(inner.location);
    expect(await store.read("agents/clerk.agent.yaml")).toBe("name: Clerk\n");
    await store.write("agents/new.agent.yaml", "name: New\n");
    await store.remove("agents/clerk.agent.yaml");
    expect([...inner.files.keys()].sort()).toEqual(
      ["agents/new.agent.yaml", "hubs/p/.halonic/source.json", record].sort(),
    );
  });

  it("keeps its version when only a record changes, and changes it with any other file", async () => {
    const { inner, store } = setUp();
    const version = await store.version();
    expect(version).toMatch(/^sha256:[0-9a-f]{16}$/u);
    inner.files.set(record, '{"changed":true}\n');
    inner.files.set(`.halonic/review/files/${"b".repeat(64)}.json`, "{}\n");
    expect(await store.version()).toBe(version);
    await store.write("agents/clerk.agent.yaml", "name: Clerk 2\n");
    expect(await store.version()).not.toBe(version);
  });

  it("gives the version the folder and memory adapters give for the same files", async () => {
    const inner = new TestDefinitionStore({ "a.yaml": "a\n", "b/c.yaml": "c\n" });
    const store = new ReviewingDefinitionStore(inner, digest);
    // The memory adapter's version of these two files, written down from it.
    const listing = "a.yaml\na\n\n\0b/c.yaml\nc\n";
    const hash = new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(listing)),
    );
    const hex = [...hash].map((byte) => byte.toString(16).padStart(2, "0")).join("");
    expect(await store.version()).toBe(`sha256:${hex.slice(0, 16)}`);
  });
});
