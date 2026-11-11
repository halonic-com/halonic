// The source Try it and Test read while there are changes to review
// (AI changes 1.5, HAL-65 section F `workspace.trust.try-it-leaves-out` and
// `workspace.trust.untrusted-changes-held`, HAL-3277): the workspace as it
// is, but with the baseline's value for what gives an item more reach, and
// with the whole baseline for what the assistant wrote before the workspace
// was trusted. Built in memory; nothing is written.

import type { LeftOutReason } from "@halonicjs/events";
import type { DefinitionSource } from "@halonicjs/ports";
import { deepEqual, diffLines, isPlainObject } from "@halonicjs/std";
import { readYaml } from "@halonicjs/yaml";
import { type ItemPath, revertParts } from "./changes/revert-parts.ts";
import type { ReviewFiles } from "./review-files.ts";
import type { ReviewRecord } from "./review-record.ts";
import type { LeftOut, LeftOutFile, TryItSource } from "./review-types.ts";
import { firstGroup, type HeldBackPart, heldBackAt } from "./try-it-held-back.ts";

/** What Try it reads for one file instead of the file, and why. */
interface UsedInstead {
  /** The text Try it reads; `null` when it reads no file there. */
  readonly text: string | null;
  readonly reason: LeftOutReason;
}

/**
 * Builds the Try it source from the workspace's files and their records.
 * `leftOut` is what is held back now. A file the assistant writes later is
 * held back too, when the source reads it ({@link HeldBackSource}).
 *
 * @param reads - how the source reads the files; by default each read is live
 */
export async function buildTryItSource(
  files: ReviewFiles,
  reads: FileReads = new FileReads(files),
): Promise<TryItSource> {
  const { records } = await files.list();
  const used = new Map<string, string | null>();
  const leftOutFiles: LeftOutFile[] = [];
  for (const { path } of records) {
    const { text, instead } = await reads.now(path);
    if (instead === null) {
      continue;
    }
    used.set(path, instead.text);
    const changes = diffLines(instead.text ?? "", text ?? "").length;
    // A file put back to its baseline outside Halonic leaves nothing out.
    if (changes > 0) {
      leftOutFiles.push({ path, reason: instead.reason, changes });
    }
  }
  return {
    source: new HeldBackSource(files, reads, used),
    leftOut: leftOutOf(leftOutFiles),
    cantTry: [],
  };
}

/** A file as it is now, and what Try it reads instead of it, if anything. */
interface FileNow {
  readonly text: string | null;
  readonly instead: UsedInstead | null;
}

/**
 * How Try it reads the workspace's files. By default each read is live.
 * While shared ({@link FileReads.shared}), each path is read once, with its
 * record in its turn, and the workspace as it is ({@link asIs}) and as Try
 * it reads it give that same read. So a save between the two loads can't
 * show up as a difference between them. {@link close} makes reads live
 * again, so a file the assistant writes after the build is still held back.
 */
export class FileReads {
  readonly #files: ReviewFiles;
  #shared: boolean;
  readonly #reads = new Map<string, Promise<FileNow>>();
  readonly #lists = new Map<string | undefined, Promise<string[]>>();

  constructor(files: ReviewFiles, shared = false) {
    this.#files = files;
    this.#shared = shared;
  }

  /** Reads that each path gives once, until {@link close}. */
  static shared(files: ReviewFiles): FileReads {
    return new FileReads(files, true);
  }

  /** The file at `path` now, and what Try it reads instead of it. */
  now(path: string): Promise<FileNow> {
    return this.#once(this.#reads, path, () => readNow(this.#files, path));
  }

  /** The workspace's paths under `dir`, as its store lists them. */
  list(dir?: string): Promise<string[]> {
    return this.#once(this.#lists, dir, () => this.#files.store.list(dir));
  }

  /** The workspace as it is, from the same reads as Try it's. */
  asIs(): DefinitionSource {
    const store = this.#files.store;
    return {
      location: store.location,
      list: (dir) => this.list(dir),
      read: async (path) => (await this.now(path)).text,
      version: () => store.version(),
    };
  }

  /** Ends the shared reads: from now on each read is live. */
  close(): void {
    this.#shared = false;
    this.#reads.clear();
    this.#lists.clear();
  }

  #once<K, T>(cache: Map<K, Promise<T>>, key: K, read: () => Promise<T>): Promise<T> {
    if (!this.#shared) {
      return read();
    }
    let found = cache.get(key);
    if (found === undefined) {
      found = read();
      cache.set(key, found);
    }
    return found;
  }
}

/**
 * Reads a file and its record in the file's turn, so a save in between
 * can't pair a record with a file it doesn't describe.
 */
function readNow(files: ReviewFiles, path: string): Promise<FileNow> {
  return files.turn(path, async () => {
    const text = await files.store.read(path);
    const record = (await files.hasRecord(path)) ? await files.read(path) : null;
    return { text, instead: record === null ? null : usedInstead(record, text) };
  });
}

/**
 * What Try it reads instead of a file with changes to review, or `null`
 * when it reads the file:
 * - written while the workspace was untrusted: the baseline, whole;
 * - a kind held back whole, such as `models.yaml`, or a file that isn't a
 *   Halonic item, such as a script a connector runs: the baseline;
 * - otherwise, when the change touches a held-back part: the file with
 *   those parts set back to the baseline's. For a new file, or a baseline
 *   that doesn't read as YAML, there is nothing to set the parts in, so
 *   the baseline, whole. A deleted file, or one that doesn't read as YAML
 *   and so doesn't load, gives nothing more reach and is read as it is.
 */
function usedInstead(record: ReviewRecord, text: string | null): UsedInstead | null {
  const { baseline } = record;
  if (record.writtenUntrusted === true) {
    return { text: baseline, reason: "before-trust" };
  }
  const heldBack = heldBackAt(record.path);
  if (heldBack === null) {
    return null;
  }
  if (heldBack.kind === "whole") {
    return { text: baseline, reason: heldBack.group };
  }
  // A deleted agent or the like gives nothing more reach.
  const fileData = text === null ? null : yamlMap(text);
  if (text === null || fileData === null) {
    return null;
  }
  const baselineData = baseline === null ? null : yamlMap(baseline);
  const texts = [baseline, text].filter((side): side is string => side !== null);
  const touched = heldBack
    .parts(texts)
    .filter(
      (part) => !deepEqual(valueAt(baselineData ?? {}, part.path), valueAt(fileData, part.path)),
    );
  const reason = firstGroup(touched.map((part) => part.group));
  if (reason === null) {
    return null;
  }
  if (baseline === null || baselineData === null) {
    return { text: baseline, reason };
  }
  const reverted = revertParts(text, baseline, pathsToSetBack(touched, baselineData));
  return { text: reverted.ok ? reverted.value : baseline, reason };
}

/**
 * The paths to set back to the baseline's for the touched parts: each
 * part's own, or its whole entry when the baseline doesn't have the entry
 * (a method the change adds). Each path once.
 */
function pathsToSetBack(
  touched: readonly HeldBackPart[],
  baselineData: Record<string, unknown>,
): ItemPath[] {
  const paths = new Map<string, ItemPath>();
  for (const part of touched) {
    const path =
      part.entry !== undefined && valueAt(baselineData, part.entry) === undefined
        ? part.entry
        : part.path;
    paths.set(JSON.stringify(path), path);
  }
  return [...paths.values()];
}

/** The text's data when it reads as a YAML map; `null` otherwise. */
function yamlMap(text: string): Record<string, unknown> | null {
  const read = readYaml(text);
  return read.ok && isPlainObject(read.value.data) ? read.value.data : null;
}

/** The value at a path, through map keys only; `undefined` where there is none. */
function valueAt(data: Record<string, unknown>, path: ItemPath): unknown {
  let value: unknown = data;
  for (const key of path) {
    if (!isPlainObject(value)) {
      return undefined;
    }
    value = value[key];
  }
  return value;
}

/** The left-out files with their sums. */
export function leftOutOf(files: readonly LeftOutFile[]): LeftOut {
  const sum = (some: readonly LeftOutFile[]) =>
    some.reduce((total, file) => total + file.changes, 0);
  return {
    total: sum(files),
    beforeTrust: sum(files.filter((file) => file.reason === "before-trust")),
    files,
  };
}

/**
 * The workspace's files, with some read from texts held in memory instead:
 * `null` there means Try it reads no file at that path, so it isn't listed.
 *
 * A file that held nothing back when the source was built is read when
 * asked, with its record, in its turn. So a change the assistant writes in
 * between, while Build is still writing as the person presses Try it, is
 * held back as well. Once held, a file's text stays as first read.
 */
class HeldBackSource implements DefinitionSource {
  readonly location: string;
  readonly #files: ReviewFiles;
  readonly #reads: FileReads;
  readonly #used: Map<string, string | null>;

  constructor(files: ReviewFiles, reads: FileReads, used: Map<string, string | null>) {
    this.location = files.store.location;
    this.#files = files;
    this.#reads = reads;
    this.#used = used;
  }

  async list(dir?: string): Promise<string[]> {
    // The workspace's own list first: it refuses an unsafe `dir`.
    const listed = await this.#reads.list(dir);
    const prefix = dir === undefined ? null : `${dir.replace(/\/+$/u, "")}/`;
    const within = (path: string) => prefix === null || path.startsWith(prefix);
    const { records } = await this.#files.list();
    const candidates = new Set([
      ...listed,
      ...[...this.#used.keys()].filter(within),
      ...records.map((record) => record.path).filter(within),
    ]);
    const paths: string[] = [];
    for (const path of candidates) {
      // Only a file with a record can be held back; the others are listed as they are.
      const mayBeHeld = this.#used.has(path) || (await this.#files.hasRecord(path));
      if (!mayBeHeld || (await this.read(path)) !== null) {
        paths.push(path);
      }
    }
    return paths.sort();
  }

  async read(path: string): Promise<string | null> {
    const held = this.#used.get(path);
    if (held !== undefined) {
      return held;
    }
    const { text, instead } = await this.#reads.now(path);
    if (instead === null) {
      return text;
    }
    this.#used.set(path, instead.text);
    return instead.text;
  }

  /**
   * The workspace's version, with the digest of what is held after a `+`
   * when anything is, so a run tried with held-back changes never records
   * the same version as one run with the files as they are.
   */
  async version(): Promise<string> {
    const version = await this.#files.store.version();
    if (this.#used.size === 0) {
      return version;
    }
    const held = [...this.#used.keys()].sort().map((path) => [path, this.#used.get(path)]);
    return `${version}+held-back.${await this.#files.digestOf(JSON.stringify(held))}`;
  }
}
