import type { Digest } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it, vi } from "vitest";
import { ReviewService } from "./review-service.ts";
import { ReviewingDefinitionStore } from "./reviewing-store.ts";
import { TestDefinitionStore } from "./testing/memory-definition-store.ts";
import { TestTrash } from "./testing/test-trash.ts";

/** SHA-256 from Web Crypto, as the platform's `Digest` adapter gives it. */
const digest: Digest = {
  async sha256(data) {
    return new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(data)));
  },
};

const leaveOut = { folders: ["repo"], names: ["node_modules"] };

function workspace() {
  const store = new TestDefinitionStore(
    {
      "workspace.yaml": "id: acme\n",
      "repo/src/a.ts": "export const a = 1;\n",
      "tools/node_modules/x.js": "x\n",
    },
    digest,
  );
  const review = new ReviewService({
    store,
    records: new TestDefinitionStore({}, digest),
    digest,
    isTrusted: () => true,
    trash: new TestTrash(store, digest),
  });
  return { store, review };
}

verifies("app.stores-pass-left-out", () => {
  it("passes leaveOut on from the reviewing store to the workspace's store", async () => {
    const { store, review } = workspace();
    const reviewing = new ReviewingDefinitionStore(store, review.writer);
    const version = vi.spyOn(store, "version");

    expect(await reviewing.list(undefined, { leaveOut })).toEqual(["workspace.yaml"]);
    await reviewing.version({ leaveOut });

    expect(version).toHaveBeenCalledExactlyOnceWith({ leaveOut });
  });

  // Listing with leaveOut first, then without, checks that Try it's cache keys a
  // listing by its leaveOut as well as its folder.
  it("leaves the same files out of Try it's source as the store does", async () => {
    const { store, review } = workspace();
    const version = vi.spyOn(store, "version");
    const { source } = await review.tryItSource();

    expect(await source.list(undefined, { leaveOut })).toEqual(["workspace.yaml"]);
    expect(await source.list()).toEqual(await store.list());
    await source.version({ leaveOut });

    expect(version).toHaveBeenCalledWith({ leaveOut });
  });
});
