import type { FolderReader } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";

/**
 * What the folder under test holds. Paths are relative and "/" separated.
 * The folders above every entry exist without being named in `folders`.
 */
export interface FolderTree {
  /** Files and their contents; a string is written as its UTF-8 bytes. */
  readonly files?: Readonly<Record<string, Uint8Array | string>>;
  /** Folders that hold nothing. */
  readonly folders?: readonly string[];
  /** Symbolic links and where they point, relative to the link's own folder. */
  readonly links?: Readonly<Record<string, string>>;
  /** Special files, such as a socket or a pipe. Only asked for when the adapter can make them. */
  readonly special?: readonly string[];
}

/** Creates a reader over a new folder that holds `tree`. */
export type MakeFolderReader = (tree: FolderTree) => Promise<FolderReader>;

/** What the adapter under test can make in a folder. */
export interface FolderReaderContractOptions {
  /** Whether the harness can make special files. Without them, the special-file cases are left out. */
  readonly specialFiles: boolean;
}

/**
 * The contract every {@link FolderReader} adapter passes. A plugin's trust
 * fingerprint is built from what the reader gives, so it hides nothing,
 * follows no link and gives the same listing on every system.
 */
export function folderReaderContract(
  name: string,
  make: MakeFolderReader,
  options: FolderReaderContractOptions,
): void {
  verifies("contracts.folder-reader", () => {
    describe(`FolderReader contract: ${name}`, () => {
      listingCases(make);
      byteCases(make);
      linkCases(make);
      if (options.specialFiles) specialFileCases(make);
      unsafePathCases(make);
      locationCases(make);
    });
  });
}

const encoder = new TextEncoder();

/** Bytes that aren't valid UTF-8: decoded as text, both would read as the same replacement characters. */
const notText = new Uint8Array([0xff, 0xfe, 0x00, 0x80]);
const otherNotText = new Uint8Array([0xfe, 0xff, 0x00, 0x81]);

function listingCases(make: MakeFolderReader): void {
  it("lists every entry, with its kind and a file's size, sorted by code unit", async () => {
    const reader = await make({
      files: { "a.txt": "a", "B.txt": "bb", "ä.txt": "", "a-c": "abc", "a/b": "abcd" },
      folders: ["empty"],
    });
    const entries = await reader.entries();
    expect(entries.map((entry) => entry.path)).toEqual([
      "B.txt",
      "a",
      "a-c",
      "a.txt",
      "a/b",
      "empty",
      "ä.txt",
    ]);
    expect(entries).toContainEqual({ path: "a/b", kind: "file", size: 4 });
    expect(entries).toContainEqual({ path: "a", kind: "folder" });
    expect(entries).toContainEqual({ path: "ä.txt", kind: "file", size: 0 });
  });

  it("lists and reads the names a workspace keeps private", async () => {
    const reader = await make({
      files: { ".git/config": "[core]\n", ".env": "MODE=demo\n", "tool/.studio/state": "x" },
    });
    const paths = (await reader.entries()).map((entry) => entry.path);
    expect(paths).toEqual([
      ".env",
      ".git",
      ".git/config",
      "tool",
      "tool/.studio",
      "tool/.studio/state",
    ]);
    expect(await reader.read(".env")).toEqual(encoder.encode("MODE=demo\n"));
  });

  it("lists under a folder with paths from the root, and nothing for a missing folder or a file", async () => {
    const reader = await make({ files: { "acme/plugin.yaml": "id: acme\n", "acme-two/x": "x" } });
    expect((await reader.entries("acme")).map((entry) => entry.path)).toEqual(["acme/plugin.yaml"]);
    expect(await reader.entries("missing")).toEqual([]);
    expect(await reader.entries("acme/plugin.yaml")).toEqual([]);
  });

  it("stops past the limit, giving one entry more than it allows", async () => {
    const reader = await make({ files: { a: "", b: "", c: "", d: "" } });
    expect(await reader.entries(undefined, { limit: 2 })).toHaveLength(3);
    expect(await reader.entries(undefined, { limit: 4 })).toHaveLength(4);
  });

  it("lists only what is directly under a folder when it isn't recursive", async () => {
    const reader = await make({
      files: { "acme/plugin.yaml": "id: acme\n", "acme/backend/index.js": "", "top.txt": "" },
      folders: ["empty"],
      links: { latest: "acme" },
    });
    const paths = async (dir?: string) =>
      (await reader.entries(dir, { recursive: false })).map((entry) => entry.path);
    expect(await paths()).toEqual(["acme", "empty", "latest", "top.txt"]);
    expect(await paths("acme")).toEqual(["acme/backend", "acme/plugin.yaml"]);
    expect(await reader.entries(undefined, { recursive: false, limit: 1 })).toHaveLength(2);
  });
}

function byteCases(make: MakeFolderReader): void {
  it("reads the exact bytes, so files that aren't text never read the same", async () => {
    const reader = await make({
      files: { "one.bin": notText, "two.bin": otherNotText, empty: "" },
    });
    expect(await reader.read("one.bin")).toEqual(notText);
    expect(await reader.read("two.bin")).toEqual(otherNotText);
    expect(await reader.read("empty")).toEqual(new Uint8Array());
  });

  it("gives a fresh copy on every read", async () => {
    const reader = await make({ files: { "one.bin": notText } });
    const first = await reader.read("one.bin");
    first?.fill(0);
    expect(await reader.read("one.bin")).toEqual(notText);
  });

  it("gives null for a missing file, a folder and a path under a file", async () => {
    const reader = await make({ files: { "acme/plugin.yaml": "id: acme\n" } });
    expect(await reader.read("missing")).toBeNull();
    expect(await reader.read("acme")).toBeNull();
    expect(await reader.read("acme/plugin.yaml/x")).toBeNull();
  });
}

function linkCases(make: MakeFolderReader): void {
  const tree: FolderTree = {
    files: { "real/secret.txt": "kept" },
    links: { "acme/latest": "../real", "acme/file-link": "../real/secret.txt" },
  };

  it("lists a link as a link and lists nothing through it", async () => {
    const reader = await make(tree);
    const entries = await reader.entries("acme");
    expect(entries).toEqual([
      { path: "acme/file-link", kind: "link" },
      { path: "acme/latest", kind: "link" },
    ]);
  });

  it("refuses to read a link, or anything through one", async () => {
    const reader = await make(tree);
    await expect(reader.read("acme/file-link")).rejects.toThrow(RangeError);
    await expect(reader.read("acme/latest/secret.txt")).rejects.toThrow(RangeError);
  });

  it("refuses to list or locate a link, or anything through one", async () => {
    const reader = await make(tree);
    await expect(reader.entries("acme/latest")).rejects.toThrow(RangeError);
    await expect(reader.locationOf("acme/latest")).rejects.toThrow(RangeError);
    await expect(reader.locationOf("acme/latest/secret.txt")).rejects.toThrow(RangeError);
  });
}

function specialFileCases(make: MakeFolderReader): void {
  it("lists a special file as other and never opens it", async () => {
    const reader = await make({ special: ["acme/socket"] });
    expect(await reader.entries("acme")).toEqual([{ path: "acme/socket", kind: "other" }]);
    await expect(reader.read("acme/socket")).rejects.toThrow(RangeError);
  });
}

const unsafePaths = ["", "/etc/passwd", "a/../b", "a/./b", "a//b", "a\\b", "a\u0000b", ".."];

function unsafePathCases(make: MakeFolderReader): void {
  for (const path of unsafePaths) {
    it(`refuses the unsafe path ${JSON.stringify(path)} in every method`, async () => {
      const reader = await make({ files: { "a/b": "x" } });
      await expect(reader.entries(path)).rejects.toThrow(RangeError);
      await expect(reader.read(path)).rejects.toThrow(RangeError);
      await expect(reader.locationOf(path)).rejects.toThrow(RangeError);
    });
  }
}

function locationCases(make: MakeFolderReader): void {
  it("gives the folder's location, an entry's, and null for a missing one", async () => {
    const reader = await make({ files: { "acme/plugin.yaml": "id: acme\n" } });
    const root = await reader.locationOf();
    const plugin = await reader.locationOf("acme");
    expect(root).toEqual(expect.any(String));
    expect(plugin).toEqual(expect.any(String));
    expect(plugin).not.toBe(root);
    expect(await reader.locationOf("acme")).toBe(plugin);
    expect(await reader.locationOf("missing")).toBeNull();
  });
}
