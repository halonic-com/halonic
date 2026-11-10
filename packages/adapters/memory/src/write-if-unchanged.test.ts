import type { DefinitionStore } from "@halonicjs/ports";
import { contentDigest } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { MemoryDefinitionStore } from "./definition-store.ts";
import { DryRunDefinitionStore } from "./dry-run-definition-store.ts";
import { webCryptoDigest } from "./sha256.ts";

const digestOf = (text: string): Promise<`sha256:${string}`> =>
  contentDigest(text, webCryptoDigest);

const stores: Record<string, (files: Record<string, string>) => DefinitionStore> = {
  memory: (files) => new MemoryDefinitionStore(files),
  "dry run": (files) => new DryRunDefinitionStore(new MemoryDefinitionStore(files)),
};

verifies("ports.definition-store-write-if-unchanged", () => {
  for (const [name, make] of Object.entries(stores)) {
    describe(`write if unchanged: ${name}`, () => {
      it("writes when the file still holds what was last read", async () => {
        const store = make({ "a.yaml": "1" });
        expect(await store.write("a.yaml", "2", { expected: await digestOf("1") })).toEqual({
          status: "written",
        });
        expect(await store.read("a.yaml")).toBe("2");
      });

      it("writes nothing and gives the current text when the file changed", async () => {
        const store = make({ "a.yaml": "3" });
        expect(await store.write("a.yaml", "2", { expected: await digestOf("1") })).toEqual({
          status: "changed-on-disk",
          current: "3",
        });
        expect(await store.read("a.yaml")).toBe("3");
      });

      it("gives null as the current text when the file is gone", async () => {
        const store = make({});
        expect(await store.write("a.yaml", "2", { expected: await digestOf("1") })).toEqual({
          status: "changed-on-disk",
          current: null,
        });
        expect(await store.list()).toEqual([]);
      });

      it("creates a file expected to be absent, but not over one that exists", async () => {
        const store = make({ "b.yaml": "there" });
        expect(await store.write("a.yaml", "new", { expected: "absent" })).toEqual({
          status: "written",
        });
        expect(await store.write("b.yaml", "new", { expected: "absent" })).toEqual({
          status: "changed-on-disk",
          current: "there",
        });
        expect(await store.read("b.yaml")).toBe("there");
      });

      it("lets only one of two writes expecting the same text through", async () => {
        const store = make({ "a.yaml": "1" });
        const expected = await digestOf("1");
        const results = await Promise.all([
          store.write("a.yaml", "from the editor", { expected }),
          store.write("a.yaml", "from a proposal", { expected }),
        ]);
        expect(results).toEqual([
          { status: "written" },
          { status: "changed-on-disk", current: "from the editor" },
        ]);
        expect(await store.read("a.yaml")).toBe("from the editor");
      });

      it("replaces the file whatever it holds when nothing is expected", async () => {
        const store = make({ "a.yaml": "3" });
        expect(await store.write("a.yaml", "2")).toEqual({ status: "written" });
        expect(await store.read("a.yaml")).toBe("2");
      });
    });
  }

  it("records no change for a dry-run write that didn't match", async () => {
    const dryRun = new DryRunDefinitionStore(new MemoryDefinitionStore({ "a.yaml": "3" }));
    await dryRun.write("a.yaml", "2", { expected: await digestOf("1") });
    expect(dryRun.changes()).toEqual([]);
  });
});
