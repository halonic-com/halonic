// The source Try it and Test read while there are changes to review
// (AI changes 1.5, HAL-65 section F `workspace.trust.try-it-leaves-out` and
// `workspace.trust.untrusted-changes-held`, HAL-3277): the workspace as it
// is, but with the baseline's value for what gives an item more reach, and
// with the whole baseline for what the assistant wrote before the workspace
// was trusted. Built in memory; nothing is written.

import type { LeftOutReason } from "@halonicjs/events";
import type { DefinitionSource } from "@halonicjs/ports";
import { deepEqual, diffLines, isPlainObject } from "@halonicjs/std";
import { placeOf } from "@halonicjs/workspace";
import { readYaml } from "@halonicjs/yaml";
import { revertParts } from "./changes/revert-parts.ts";
import type { ReviewFiles } from "./review-files.ts";
import type { ReviewRecord } from "./review-record.ts";
import type { LeftOut, LeftOutFile, TryItSource } from "./review-types.ts";
import { firstGroup, type HeldBackPart, heldBackFor } from "./try-it-held-back.ts";

/** What Try it reads for one file instead of the file, and why. */
interface UsedInstead {
  /** The text Try it reads; `null` when it reads no file there. */
  readonly text: string | null;
  readonly reason: LeftOutReason;
}

/**
 * Builds the Try it source from the workspace's files and their records.
 * Each file is read in its turn, with its record read again there, so a
 * save in between can't pair a record with a file it doesn't describe.
 */
export async function buildTryItSource(files: ReviewFiles): Promise<TryItSource> {
  const { records } = await files.list();
  const used = new Map<string, string | null>();
  const leftOutFiles: LeftOutFile[] = [];
  for (const { path } of records) {
    const found = await files.turn(path, async () => {
      const record = await files.read(path);
      if (record === null) {
        return null;
      }
      const text = await files.store.read(path);
      const instead = usedInstead(record, text);
      return instead === null ? null : { instead, text };
    });
    if (found === null) {
      continue;
    }
    const { instead, text } = found;
    used.set(path, instead.text);
    leftOutFiles.push({
      path,
      reason: instead.reason,
      changes: diffLines(instead.text ?? "", text ?? "").length,
    });
  }
  const version = used.size === 0 ? null : await files.digestOf(JSON.stringify([...used]));
  return {
    source: new HeldBackSource(files.store, used, version),
    leftOut: leftOutOf(leftOutFiles),
  };
}

/**
 * What Try it reads instead of a file with changes to review, or `null`
 * when it reads the file:
 * - written while the workspace was untrusted: the baseline, whole;
 * - a kind held back whole, such as `models.yaml`: the baseline;
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
  const kind = placeOf(record.path)?.kind;
  const heldBack = kind === undefined ? null : heldBackFor(kind);
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
    .filter((part) => !deepEqual(valueAt(baselineData ?? {}, part), valueAt(fileData, part)));
  const reason = firstGroup(touched.map((part) => part.group));
  if (reason === null) {
    return null;
  }
  if (baseline === null || baselineData === null) {
    return { text: baseline, reason };
  }
  const reverted = revertParts(
    text,
    baseline,
    touched.map((part) => part.path),
  );
  return { text: reverted.ok ? reverted.value : baseline, reason };
}

/** The text's data when it reads as a YAML map; `null` otherwise. */
function yamlMap(text: string): Record<string, unknown> | null {
  const read = readYaml(text);
  return read.ok && isPlainObject(read.value.data) ? read.value.data : null;
}

/** The value at a part's path, through map keys only; `undefined` where there is none. */
function valueAt(data: Record<string, unknown>, part: HeldBackPart): unknown {
  let value: unknown = data;
  for (const key of part.path) {
    if (!isPlainObject(value)) {
      return undefined;
    }
    value = value[key];
  }
  return value;
}

function leftOutOf(files: readonly LeftOutFile[]): LeftOut {
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
 * The other files are read from the workspace as they are when asked.
 */
class HeldBackSource implements DefinitionSource {
  readonly location: string;
  readonly #inner: DefinitionSource;
  readonly #used: ReadonlyMap<string, string | null>;
  /** The digest of what is held, or `null` when nothing is. */
  readonly #held: string | null;

  constructor(
    inner: DefinitionSource,
    used: ReadonlyMap<string, string | null>,
    held: string | null,
  ) {
    this.location = inner.location;
    this.#inner = inner;
    this.#used = used;
    this.#held = held;
  }

  async list(dir?: string): Promise<string[]> {
    // The workspace's own list first: it refuses an unsafe `dir`.
    const paths = new Set(await this.#inner.list(dir));
    for (const [path, text] of this.#used) {
      if (dir !== undefined && !path.startsWith(`${dir}/`)) {
        continue;
      }
      if (text === null) {
        paths.delete(path);
      } else {
        paths.add(path);
      }
    }
    return [...paths].sort();
  }

  read(path: string): Promise<string | null> {
    const text = this.#used.get(path);
    // Only record paths are held, and a record's path is always a safe one.
    return text === undefined ? this.#inner.read(path) : Promise.resolve(text);
  }

  /**
   * The workspace's version, with the digest of what is held after a `+`
   * when anything is, so a run tried with held-back changes never records
   * the same version as one run with the files as they are.
   */
  async version(): Promise<string> {
    const version = await this.#inner.version();
    return this.#held === null ? version : `${version}+held-back.${this.#held}`;
  }
}
