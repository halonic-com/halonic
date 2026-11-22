import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  type Entry,
  fileMode,
  gitlinkMode,
  index,
  u32,
  withExtension,
} from "./git-index.test-helper.ts";
import { gitlinkPaths, parseIndex } from "./git-index.ts";
import { snapshotNestedGit, undoNestedGit } from "./nested-git-check.ts";

let work: string;

beforeEach(async () => {
  work = await mkdtemp(join(tmpdir(), "srt-git-index-"));
});

afterEach(async () => {
  await rm(work, { recursive: true, force: true });
});

/** `bytes` with the SHA-1 hash git checks at its end, in place of the helper's filler. */
function hashed(bytes: Uint8Array): Uint8Array {
  const body = bytes.subarray(0, bytes.byteLength - 20);
  return new Uint8Array([...body, ...createHash("sha1").update(body).digest()]);
}

/** The gitlinks real git finds in `bytes`, written as the index of a new repository. */
async function gitlinksOfGit(bytes: Uint8Array): Promise<string[]> {
  const repository = join(work, "git");
  const env = { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: join(work, "none") };
  const git = (args: string[]) =>
    spawnSync("git", ["-c", "core.fsmonitor=false", ...args], { cwd: repository, env });
  await mkdir(repository);
  expect(git(["init", "-q"]).status).toBe(0);
  await writeFile(join(repository, ".git", "index"), hashed(bytes));
  const listed = git(["ls-files", "--stage", "-z"]);
  expect(listed.status, listed.stderr.toString()).toBe(0);
  // Each record is "<mode> <id> <stage>\t<path>", ended by a NUL.
  return listed.stdout
    .toString()
    .split("\0")
    .filter((record) => record.startsWith(`${gitlinkMode.toString(8)} `))
    .map((record) => record.slice(record.indexOf("\t") + 1));
}

/** An index whose first name holds NULs inside the length its flags give, then a gitlink. */
function nameWithNuls(): Uint8Array {
  // 9 bytes of name, NULs, and a last byte: the length counts all 73 of them.
  const first = `README.md${"\0".repeat(63)}a`;
  const bytes = index([
    { path: first, mode: fileMode },
    { path: "sub", mode: gitlinkMode },
  ]);
  // The gitlink starts after the header and the 136-byte first entry. Its change time
  // (8 bytes git doesn't read here) is set so that the file also reads to its end when
  // the first name is taken only up to its first NUL.
  bytes.set([...new TextEncoder().encode("ABCD"), ...u32(64)], 12 + 136);
  return bytes;
}

const names: Entry[] = [
  { path: "a/very/long/dir/f1", mode: fileMode },
  { path: "a/very/long/dir/sub", mode: gitlinkMode },
  { path: "libs/acme", mode: gitlinkMode },
  { path: `long/${"x".repeat(4200)}`, mode: gitlinkMode },
  { path: "zz", mode: fileMode },
];

verifies("sandbox-srt.session", () => {
  describe("reading the names of a git index the way git does", () => {
    it.each([2, 3, 4] as const)(
      "finds the gitlinks git finds in index version %i",
      async (version) => {
        const bytes = index(
          names.map((entry) => ({
            ...entry,
            extended: version !== 2 && entry.mode === gitlinkMode,
          })),
          version,
        );
        const gitlinks = gitlinkPaths(parseIndex(bytes, 20), null);
        expect(gitlinks).toEqual(await gitlinksOfGit(bytes));
        expect(gitlinks).toHaveLength(3);
      },
    );

    it("refuses an index whose name has a NUL before the length its flags give", async () => {
      const bytes = nameWithNuls();
      expect(await gitlinksOfGit(bytes)).toEqual(["sub"]);
      expect(() => parseIndex(bytes, 20)).toThrow("git index entry name doesn't match its length");
    });

    it("refuses an index whose name runs past the length its flags give", () => {
      const bytes = index([{ path: "README.md", mode: fileMode, nameLength: 3 }]);
      expect(() => parseIndex(bytes, 20)).toThrow("git index entry name doesn't match its length");
    });

    it("refuses a version 4 name that strips more than the name before it has", () => {
      const bytes = index(
        [
          { path: "ab", mode: fileMode },
          { path: "sub", mode: gitlinkMode },
        ],
        4,
      );
      // The second entry's strip count: 2 in a well-formed index, here one more than "ab" has.
      const strip = bytes.byteLength - 20 - "sub\0".length - 1;
      bytes[strip] = 3;
      expect(() => parseIndex(bytes, 20)).toThrow("git index entry strips too much");
    });

    it("refuses an index whose entries run into the file's hash", () => {
      const bytes = index([{ path: "libs/acme", mode: gitlinkMode }]);
      expect(() => parseIndex(bytes.subarray(0, 60), 20)).toThrow("git index entries are cut off");
    });

    it("reports the index at session end when the program writes one with such a name", async () => {
      await mkdir(join(work, ".git"));
      await writeFile(join(work, ".git", "index"), index([{ path: "README.md", mode: fileMode }]));
      const snapshot = await snapshotNestedGit(work);
      if (snapshot === null) throw new Error("no snapshot");
      await writeFile(join(work, ".git", "index"), nameWithNuls());
      expect(await undoNestedGit(snapshot)).toEqual({
        undone: [],
        failed: [join(".git", "index")],
      });
    });
  });

  describe("reading the offsets git can read entries from in parallel", () => {
    const entries: Entry[] = [
      { path: "README.md", mode: fileMode },
      { path: "libs/acme", mode: gitlinkMode },
    ];
    // In version 2 the entries above take 72 and 72 bytes, after the 12-byte header.
    const entriesEnd = 12 + 72 + 72;

    /** The `EOIE` extension: where the entries end, then a hash git checks and this reader doesn't. */
    const endOfEntries = (offset: number) => [...u32(offset), ...new Array(20).fill(5)];
    /** The `IEOT` extension, version 1: each block's offset and entry count. */
    const offsetTable = (blocks: [number, number][]) => [
      ...u32(1),
      ...blocks.flatMap(([offset, count]) => [...u32(offset), ...u32(count)]),
    ];

    it("reads an index whose EOIE and IEOT extensions match its entries", () => {
      const table = withExtension(
        index(entries),
        "IEOT",
        offsetTable([
          [12, 1],
          [84, 1],
        ]),
      );
      const bytes = withExtension(table, "EOIE", endOfEntries(entriesEnd));
      expect(gitlinkPaths(parseIndex(bytes, 20), null)).toEqual(["libs/acme"]);
    });

    it("refuses an EOIE extension that doesn't point where the entries end", () => {
      const bytes = withExtension(index(entries), "EOIE", endOfEntries(entriesEnd + 8));
      expect(() => parseIndex(bytes, 20)).toThrow(
        "git index EOIE extension doesn't match its entries",
      );
    });

    it.each([
      [
        "a block at another offset",
        [
          [12, 1],
          [92, 1],
        ],
      ],
      ["blocks with fewer entries", [[12, 1]]],
      [
        "blocks with more entries",
        [
          [12, 1],
          [84, 2],
        ],
      ],
    ] as [string, [number, number][]][])("refuses an IEOT extension with %s", (_, blocks) => {
      const bytes = withExtension(index(entries), "IEOT", offsetTable(blocks));
      expect(() => parseIndex(bytes, 20)).toThrow(
        "git index IEOT extension doesn't match its entries",
      );
    });

    it("refuses a version 4 block whose first name takes from the name before it", () => {
      const prefixed = index(
        [
          { path: "libs/a", mode: fileMode },
          { path: "libs/acme", mode: gitlinkMode },
        ],
        4,
      );
      // The second entry starts after the header and the first entry (62 + 1 + "libs/a\0").
      const bytes = withExtension(
        prefixed,
        "IEOT",
        offsetTable([
          [12, 1],
          [12 + 70, 1],
        ]),
      );
      expect(() => parseIndex(bytes, 20)).toThrow(
        "git index IEOT extension doesn't match its entries",
      );
    });
  });
});
