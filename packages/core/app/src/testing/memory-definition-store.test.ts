import type { Digest } from "@halonicjs/ports";
import { contentDigest } from "@halonicjs/std";
import { definitionStoreContract } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { TestDefinitionStore } from "./memory-definition-store.ts";

const digest: Digest = {
  async sha256(data) {
    return new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(data)));
  },
};

// The kernel's fake store keeps the port's rules, so a kernel test can't
// pass on it and fail on a real store.
definitionStoreContract(
  "kernel test fake",
  async (files) => new TestDefinitionStore(files, digest),
);

verifies("ports.definition-store-write-if-unchanged", () => {
  describe("kernel test fake: write if unchanged", () => {
    it("lets only one of two writes expecting the same text through", async () => {
      const store = new TestDefinitionStore({ "a.yaml": "1" }, digest);
      const expected = await contentDigest("1", digest);
      const results = await Promise.all([
        store.write("a.yaml", "from the editor", { expected }),
        store.write("a.yaml", "from a proposal", { expected }),
      ]);
      expect(results).toEqual([
        { status: "written" },
        { status: "changed-on-disk", current: "from the editor" },
      ]);
      expect(store.files.get("a.yaml")).toBe("from the editor");
    });
  });
});
