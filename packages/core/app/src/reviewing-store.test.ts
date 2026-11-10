import type { DefinitionWatch, DefinitionWatchListener, Digest } from "@halonicjs/ports";
import { describe, expect, it, vi } from "vitest";
import { ReviewService } from "./review-service.ts";
import { ReviewingDefinitionStore } from "./reviewing-store.ts";
import { TestDefinitionStore } from "./testing/memory-definition-store.ts";

/** SHA-256 from Web Crypto, as the platform's `Digest` adapter gives it. */
const digest: Digest = {
  async sha256(data) {
    return new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(data)));
  },
};

describe("ReviewingDefinitionStore", () => {
  it("passes a watch to the workspace's store", async () => {
    const inner = new TestDefinitionStore({}, digest);
    const opened: DefinitionWatch = { close: async () => {} };
    const innerWatch = vi.spyOn(inner, "watch").mockResolvedValue(opened);
    const review = new ReviewService({
      store: inner,
      records: new TestDefinitionStore({}, digest),
      digest,
      isTrusted: () => true,
    });
    const store = new ReviewingDefinitionStore(inner, review.writer);
    const listener: DefinitionWatchListener = { changed: () => {}, failed: () => {} };

    const watch = await store.watch(listener);

    expect(innerWatch).toHaveBeenCalledExactlyOnceWith(listener);
    expect(watch).toBe(opened);
  });
});
