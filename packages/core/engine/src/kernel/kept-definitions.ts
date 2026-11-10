import type { BlobStore } from "@halonicjs/ports";
import { canonicalJson, decodeUtf8, encodeUtf8, isPlainObject } from "@halonicjs/std";
import type { RunDefinitions } from "./decide-types.ts";

// Runs keep the definitions they started with (HAL-186 decision 5). The
// engine stores them as canonical JSON in the blob store when a run starts,
// and `run.started.definitionsVersion` is the blob's hash. A waiting run
// reads them back from there, never from today's workspace files.

const mediaType = "application/json";

/**
 * Stores a run's definitions in the blob store.
 *
 * @returns the blob's hash, which the run's `definitionsVersion` is
 * @throws when the definitions aren't plain JSON data
 */
export async function keepDefinitions(
  blobs: Pick<BlobStore, "put">,
  definitions: RunDefinitions,
): Promise<string> {
  const json = canonicalJson(definitions);
  const ref = await blobs.put(encodeUtf8(json), mediaType);
  return ref.hash;
}

/**
 * Reads the definitions a run started with.
 *
 * @param version - the run's `definitionsVersion`, the hash {@link keepDefinitions} returned
 * @returns the definitions, or `null` when the blob is missing or isn't definitions
 */
export async function readDefinitions(
  blobs: Pick<BlobStore, "get">,
  version: string,
): Promise<RunDefinitions | null> {
  const data = await blobs.get(version);
  if (data === null) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(decodeUtf8(data));
  } catch {
    return null;
  }
  return isPlainObject(parsed) &&
    isPlainObject(parsed["workflow"]) &&
    (parsed["agents"] === undefined || isPlainObject(parsed["agents"]))
    ? (parsed as unknown as RunDefinitions)
    : null;
}

/** The error a run fails with when its definitions can't be read. */
export function missingDefinitionsError(version: string): string {
  return `The definitions this run started with (version ${version}) are missing from the blob store or can't be read, so the run can't go on. It never falls back to the workspace's files as they are now.`;
}
