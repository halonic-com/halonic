import type { DefinitionSource, DefinitionStore, ExpectedContent } from "@halonicjs/ports";
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
 * code points HFS+ ignores, case (a long s, an `st` ligature and a dotless i
 * included) and trailing dots and spaces are set aside, or one with a `:` or
 * a `~` followed by a digit.
 */
export const privateDefinitionPaths: readonly string[] = [
  ".git/config",
  "hubs/.GIT/config",
  ".g\u200Cit/config",
  ".studio/trust.json",
  ".\u017Ftudio/trust.json",
  ".\uFB06udio/trust.json",
  ".g\u0131t/config",
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

  verifies("ports.definition-store-write-if-unchanged", () => {
    describe(`DefinitionStore write if unchanged: ${name}`, () => {
      writeIfUnchangedCases(make);
    });
  });
}

/**
 * The digest `write` expects, worked out here rather than with
 * `contentDigest`, so a store that hashes differently from the port doc
 * fails: `sha256:` and the lowercase hex SHA-256 of the UTF-8 text.
 */
async function digestOf(text: string): Promise<ExpectedContent> {
  const hash = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)),
  );
  let hex = "";
  for (const byte of hash) {
    hex += byte.toString(16).padStart(2, "0");
  }
  return `sha256:${hex}`;
}

function writeIfUnchangedCases(make: MakeDefinitionStore): void {
  it("writes when the file still holds what was last read", async () => {
    const store = await make({ "a.yaml": "1", "b.yaml": "naïve: ü\n" });
    expect(await store.write("a.yaml", "2", { expected: await digestOf("1") })).toEqual({
      status: "written",
    });
    expect(await store.read("a.yaml")).toBe("2");
    // The digest is of the UTF-8 bytes, so text beyond ASCII matches too.
    expect(await store.write("b.yaml", "x", { expected: await digestOf("naïve: ü\n") })).toEqual({
      status: "written",
    });
    expect(await store.read("b.yaml")).toBe("x");
  });

  it("writes nothing and gives the current text when the file changed", async () => {
    const store = await make({ "a.yaml": "3" });
    const before = await store.version();
    expect(await store.write("a.yaml", "2", { expected: await digestOf("1") })).toEqual({
      status: "changed-on-disk",
      current: "3",
    });
    expect(await store.read("a.yaml")).toBe("3");
    expect(await store.version()).toBe(before);
  });

  it("matches only the digest as the port doc writes it", async () => {
    const store = await make({ "a.yaml": "1" });
    const before = await store.version();
    const digest = await digestOf("1");
    // Not digests as the type writes them, but a caller in plain JavaScript can pass them.
    const malformed = [digest.slice("sha256:".length), digest.toUpperCase(), "1", ""];
    for (const expected of malformed as ExpectedContent[]) {
      expect(await store.write("a.yaml", "2", { expected }), expected).toEqual({
        status: "changed-on-disk",
        current: "1",
      });
    }
    expect(await store.version()).toBe(before);
  });

  it("gives null as the current text when the file is gone, and creates nothing", async () => {
    const store = await make({ "b.yaml": "1" });
    const before = await store.version();
    expect(await store.write("a.yaml", "2", { expected: await digestOf("1") })).toEqual({
      status: "changed-on-disk",
      current: null,
    });
    expect(await store.read("a.yaml")).toBeNull();
    expect(await store.list()).toEqual(["b.yaml"]);
    expect(await store.version()).toBe(before);
  });

  it("creates a file expected to be absent, but not over one that exists", async () => {
    const store = await make({ "b.yaml": "there" });
    expect(await store.write("hubs/a/hub.yaml", "new", { expected: "absent" })).toEqual({
      status: "written",
    });
    expect(await store.read("hubs/a/hub.yaml")).toBe("new");
    const before = await store.version();
    expect(await store.write("b.yaml", "new", { expected: "absent" })).toEqual({
      status: "changed-on-disk",
      current: "there",
    });
    expect(await store.read("b.yaml")).toBe("there");
    expect(await store.version()).toBe(before);
  });

  it("replaces the file whatever it holds when nothing is expected", async () => {
    const store = await make({ "a.yaml": "3" });
    expect(await store.write("a.yaml", "2")).toEqual({ status: "written" });
    expect(await store.read("a.yaml")).toBe("2");
    expect(await store.write("c.yaml", "new", {})).toEqual({ status: "written" });
    expect(await store.read("c.yaml")).toBe("new");
  });

  it("refuses an unsafe or private path with a RangeError before comparing", async () => {
    const store = await make({ "a.yaml": "1", ".env": "A=1" });
    const before = await store.version();
    const expectations: ExpectedContent[] = ["absent", await digestOf("1"), await digestOf("A=1")];
    for (const path of [...unsafeDefinitionPaths, ...privateDefinitionPaths]) {
      for (const expected of expectations) {
        await expect(store.write(path, "x", { expected }), path).rejects.toThrow(RangeError);
      }
    }
    expect(await store.list()).toEqual(["a.yaml"]);
    expect(await store.version()).toBe(before);
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
