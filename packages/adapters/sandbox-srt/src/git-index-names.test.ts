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

/**
 * The gitlinks real git finds in `bytes`, written as the index of a new
 * repository, with `config` (such as `index.threads=3`) set for git.
 */
async function gitlinksOfGit(bytes: Uint8Array, config: string[] = []): Promise<string[]> {
  const repository = join(work, "git");
  const env = { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: join(work, "none") };
  const settings = ["core.fsmonitor=false", ...config].flatMap((setting) => ["-c", setting]);
  const git = (args: string[]) =>
    spawnSync("git", [...settings, ...args], { cwd: repository, env });
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

/** A name and size of an extension header, the way git hashes them for its `EOIE` extension. */
function header(name: string, size: number): number[] {
  return [...new TextEncoder().encode(name), ...u32(size)];
}

/**
 * The `EOIE` hash of an unknown extension `Z…` with no data and an `IEOT` of
 * `ieotSize` bytes after it, for the first such name whose hash is 10 bytes
 * other than NUL, then a NUL: so its first 11 bytes also read as a 10-byte name.
 */
function hashReadableAsName(ieotSize: number): { name: string; hash: Uint8Array } {
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  for (let at = 0; at < letters.length ** 3; at++) {
    const name = `Z${letters[at % 26]}${letters[Math.floor(at / 26) % 26]}${letters[Math.floor(at / 676)]}`;
    const headers = [...header(name, 0), ...header("IEOT", ieotSize)];
    const hash = createHash("sha1").update(new Uint8Array(headers)).digest();
    if (hash[10] === 0 && hash.subarray(0, 10).every((byte) => byte !== 0)) return { name, hash };
  }
  throw new Error("no extension name gives such a hash");
}

/**
 * An index of two files whose bytes, where git looks for an `EOIE` extension
 * (last before the file's hash), hold one inside the last entry. It names an
 * offset inside that entry, where an `IEOT` extension lists two blocks: one
 * starting 4 bytes into the first entry, read there as a gitlink, then the last
 * entry. Git follows it when it reads the entries in parallel.
 */
function endOfEntriesInsideAnEntry(): { bytes: Uint8Array; gitlink: string } {
  const gitlink = `${"a".repeat(61)}/sub`;
  // 4017 bytes of name make the first entry end, and the last start, at 4092.
  const first = `ab?A${gitlink}/${"x".repeat(4017 - 5 - gitlink.length)}`;
  const entries = index([
    { path: first, mode: fileMode },
    { path: "0123456789", mode: fileMode },
  ]);
  const last = 4092;
  // Two bytes after the entries, too few for an extension, then the file's hash.
  const bytes = new Uint8Array([...entries.subarray(0, -20), 0, 0, ...entries.subarray(-20)]);
  // Read from 4 bytes into the first entry: a gitlink's mode, then flags that
  // take the first name's bytes 2 and 3 (assume-valid, a 65-byte name: 0x41 is "A").
  bytes.set(u32(gitlinkMode), 12 + 4 + 24);
  bytes[12 + 62 + 2] = 0x80;
  // The extensions git reads from 14 bytes into the last entry, among its stat data.
  const extensions = last + 14;
  const blocks = [...u32(1), ...u32(12 + 4), ...u32(1), ...u32(last), ...u32(1)];
  const { name, hash } = hashReadableAsName(blocks.length);
  bytes.set([...header(name, 0), ...header("IEOT", blocks.length), ...blocks], extensions);
  // The EOIE's offset (0x0000100A) also gives the last entry its flags: stage 1, a
  // 10-byte name. That name, its NUL, its padding and the two bytes are the hash.
  expect(extensions).toBe(0x100a);
  bytes.set([...header("EOIE", 4 + 20), ...u32(extensions), ...hash], bytes.byteLength - 20 - 32);
  return { bytes, gitlink };
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

    it("skips the extra flag bytes of an extended entry in index version 2, as git does", async () => {
      const bytes = index([{ path: "a", mode: gitlinkMode, extended: true }], 2);
      expect(await gitlinksOfGit(bytes)).toEqual(["a"]);
      expect(gitlinkPaths(parseIndex(bytes, 20), null)).toEqual(["a"]);
    });

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

    it("refuses an EOIE extension inside the entries that points elsewhere, as git may read it", async () => {
      const { bytes, gitlink } = endOfEntriesInsideAnEntry();
      // Git copies the byte after a name too, where a well-formed index has its NUL.
      // Here that byte is "/", so git prints on until a NUL in memory it never set
      // (the padding of its entry): only the name and that byte are certain.
      expect(await gitlinksOfGit(bytes, ["index.threads=3"])).toEqual([
        expect.stringMatching(new RegExp(`^${gitlink}/`)),
      ]);
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
