import type { DefinitionSource, DefinitionStore } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";

/** Workspace files to start with, by relative path. The suite passes them in, so read-only sources can be tested too. */
export type DefinitionFiles = Readonly<Record<string, string>>;

/** Creates the source under test, holding exactly `files`. */
export type MakeDefinitionSource = (files: DefinitionFiles) => Promise<DefinitionSource>;

/** Creates the store under test, holding exactly `files`. */
export type MakeDefinitionStore = (files: DefinitionFiles) => Promise<DefinitionStore>;

/**
 * Paths every method must refuse with a `RangeError` (port doc): absolute,
 * a `.`, `..` or empty segment, a backslash or a NUL.
 */
export const unsafeDefinitionPaths: readonly string[] = [
  "/etc/passwd",
  "..",
  "../outside.yaml",
  "hubs/../../outside.yaml",
  ".",
  "a/./b.yaml",
  "",
  "a//b.yaml",
  "hubs/",
  "a\\b.yaml",
  "C:\\workspace.yaml",
  "a\u0000b.yaml",
];

/**
 * Private paths every method must refuse with a `RangeError`, and `list()`
 * must leave out (port doc, `ports.definition-store-private-entries`): a
 * segment that is `.git`, `.studio`, `.env`, `.envrc` or `.env.*` once the
 * code points HFS+ ignores, case and trailing dots and spaces are set aside,
 * or one with a `:` or a `~` followed by a digit.
 */
export const privateDefinitionPaths: readonly string[] = [
  ".git/config",
  "hubs/.GIT/config",
  ".g\u200Cit/config",
  ".studio/trust.json",
  ".env",
  ".env.local",
  ".env. ",
  ".envrc",
  "hubs/a/.Env.Production",
  "GIT~1/config",
  "ENV~1.LOC",
  "GI3F2A~1/config",
  ".env::$DATA",
  ".git::$INDEX_ALLOCATION/config",
];

const workspace: DefinitionFiles = {
  "workspace.yaml": "id: acme\n",
  "hubs/a/hub.yaml": "id: a\n",
  "hubs/a/agents/x.agent.yaml": "id: x\n",
  "hubs/ab/hub.yaml": "id: ab\n",
};

/**
 * The read side of the {@link DefinitionStore} port: the contract every
 * {@link DefinitionSource} adapter passes, including read-only ones.
 */
export function definitionSourceContract(name: string, make: MakeDefinitionSource): void {
  verifies("contracts.definition-source", () => {
    describe(`DefinitionSource contract: ${name}`, () => {
      it("reads a file's text, and null for a missing file", async () => {
        const source = await make(workspace);
        expect(await source.read("workspace.yaml")).toBe("id: acme\n");
        expect(await source.read("hubs/a/agents/x.agent.yaml")).toBe("id: x\n");
        expect(await source.read("missing.yaml")).toBeNull();
        expect(await source.read("hubs/a")).toBeNull();
      });

      it("lists every file recursively, sorted, relative to the root", async () => {
        const source = await make(workspace);
        expect(await source.list()).toEqual([
          "hubs/a/agents/x.agent.yaml",
          "hubs/a/hub.yaml",
          "hubs/ab/hub.yaml",
          "workspace.yaml",
        ]);
        expect(await source.list("hubs/a")).toEqual([
          "hubs/a/agents/x.agent.yaml",
          "hubs/a/hub.yaml",
        ]);
        expect(await source.list("hubs/a/agents")).toEqual(["hubs/a/agents/x.agent.yaml"]);
      });

      it("lists nothing for a folder that doesn't exist", async () => {
        const source = await make(workspace);
        expect(await source.list("hubs/missing")).toEqual([]);
        expect(await (await make({})).list()).toEqual([]);
      });

      it("refuses an unsafe path with a RangeError", async () => {
        const source = await make(workspace);
        for (const path of unsafeDefinitionPaths) {
          await expect(source.read(path), path).rejects.toThrow(RangeError);
          await expect(source.list(path), path).rejects.toThrow(RangeError);
        }
      });

      it("reports a version that stays the same while nothing changes", async () => {
        const source = await make(workspace);
        const version = await source.version();
        expect(version).not.toBe("");
        expect(await source.version()).toBe(version);
        expect(typeof source.location).toBe("string");
      });
    });
  });

  // Symbolic links, junctions and other reparse points are private too, but
  // only an adapter over a real folder can hold one. Its own tests cover
  // them, since this suite builds stores from text files only.
  verifies("ports.definition-store-private-entries", () => {
    describe(`DefinitionSource private entries: ${name}`, () => {
      it("refuses to read or list a private path with a RangeError", async () => {
        const source = await make(workspace);
        for (const path of privateDefinitionPaths) {
          await expect(source.read(path), path).rejects.toThrow(RangeError);
          await expect(source.list(path), path).rejects.toThrow(RangeError);
        }
      });

      it("leaves private entries out of a listing", async () => {
        const source = await make({
          ".studio/trust.json": "{}",
          ".env": "A=1",
          "hubs/a/.git/config": "[core]",
          "hubs/a/hub.yaml": "id: a\n",
          "workflows/a.yaml": "id: a\n",
        });
        expect(await source.list()).toEqual(["hubs/a/hub.yaml", "workflows/a.yaml"]);
        expect(await source.list("hubs/a")).toEqual(["hubs/a/hub.yaml"]);
      });
    });
  });
}

/** The whole {@link DefinitionStore} port: the read side, plus writing and removing. */
export function definitionStoreContract(name: string, make: MakeDefinitionStore): void {
  definitionSourceContract(name, make);

  verifies("contracts.definition-store", () => {
    describe(`DefinitionStore contract: ${name}`, () => {
      writeCases(make);
      unsafeWriteCases(make);
    });
  });

  verifies("ports.definition-store-private-entries", () => {
    describe(`DefinitionStore private entries: ${name}`, () => {
      it("refuses to write or remove a private path, and changes nothing", async () => {
        const store = await make({ "a.yaml": "1", ".env": "A=1" });
        const before = await store.version();
        for (const path of privateDefinitionPaths) {
          await expect(store.write(path, "x"), path).rejects.toThrow(RangeError);
          await expect(store.remove(path), path).rejects.toThrow(RangeError);
        }
        expect(await store.list()).toEqual(["a.yaml"]);
        expect(await store.version()).toBe(before);
      });
    });
  });
}

function writeCases(make: MakeDefinitionStore): void {
  // Ported: old "writes, reads, lists recursively and removes".
  it("writes, reads, lists recursively and removes", async () => {
    const store = await make({});
    await store.write("workspace.yaml", "id: acme\n");
    await store.write("hubs/a/hub.yaml", "id: a\n");
    await store.write("hubs/a/agents/x.agent.yaml", "id: x\n");
    expect(await store.read("workspace.yaml")).toBe("id: acme\n");
    expect(await store.read("missing.yaml")).toBeNull();
    expect(await store.list()).toEqual([
      "hubs/a/agents/x.agent.yaml",
      "hubs/a/hub.yaml",
      "workspace.yaml",
    ]);
    expect(await store.list("hubs/a/agents")).toEqual(["hubs/a/agents/x.agent.yaml"]);
    await store.remove("workspace.yaml");
    expect(await store.read("workspace.yaml")).toBeNull();
  });

  it("replaces a file that is already there", async () => {
    const store = await make({ "a.yaml": "1" });
    await store.write("a.yaml", "2");
    expect(await store.read("a.yaml")).toBe("2");
    expect(await store.list()).toEqual(["a.yaml"]);
  });

  it("removes a file that isn't there without an error", async () => {
    const store = await make({ "a.yaml": "1" });
    await store.remove("missing.yaml");
    await store.remove("a.yaml");
    await store.remove("a.yaml");
    expect(await store.list()).toEqual([]);
  });

  // Ported: old "reports a version that changes when content changes".
  it("reports a version that changes when content changes", async () => {
    const store = await make({});
    await store.write("a.yaml", "1");
    const v1 = await store.version();
    await store.write("a.yaml", "2");
    const v2 = await store.version();
    expect(v2).not.toBe(v1);
    await store.remove("a.yaml");
    expect(await store.version()).not.toBe(v2);
  });
}

function unsafeWriteCases(make: MakeDefinitionStore): void {
  it("refuses to write or remove an unsafe path, and changes nothing", async () => {
    const store = await make({ "a.yaml": "1" });
    const before = await store.version();
    for (const path of unsafeDefinitionPaths) {
      await expect(store.write(path, "x"), path).rejects.toThrow(RangeError);
      await expect(store.remove(path), path).rejects.toThrow(RangeError);
    }
    expect(await store.list()).toEqual(["a.yaml"]);
    expect(await store.version()).toBe(before);
  });
}
