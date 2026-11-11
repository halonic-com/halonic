import type { Agent } from "@halonicjs/format";
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
 * A run's definitions can't be used: their blob is missing, or it isn't
 * definitions. The message says so as {@link missingDefinitionsError} does,
 * then why, and `cause` keeps the error that caused it.
 */
export class UnreadableDefinitions extends Error {
  constructor(version: string, why?: { readonly text: string; readonly cause?: unknown }) {
    const detail = why === undefined ? "" : ` It can't be read: ${why.text}`;
    super(`${missingDefinitionsError(version)}${detail}`, { cause: why?.cause });
    this.name = "UnreadableDefinitions";
  }
}

/**
 * Reads the definitions a run started with.
 *
 * @param version - the run's `definitionsVersion`, the hash {@link keepDefinitions} returned
 * @throws UnreadableDefinitions when the blob is missing or isn't definitions, with why
 */
export async function definitionsOf(
  blobs: Pick<BlobStore, "get">,
  version: string,
): Promise<RunDefinitions> {
  const data = await blobs.get(version);
  if (data === null) {
    throw new UnreadableDefinitions(version);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(decodeUtf8(data));
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error);
    throw new UnreadableDefinitions(version, { text: `it isn't JSON (${text}).`, cause: error });
  }
  if (!isDefinitions(parsed)) {
    throw new UnreadableDefinitions(version, { text: "it doesn't hold a workflow and its files." });
  }
  return parsed;
}

/**
 * Reads the definitions a run started with, as {@link definitionsOf} does.
 *
 * @param version - the run's `definitionsVersion`, the hash {@link keepDefinitions} returned
 * @returns the definitions, or `null` when the blob is missing or isn't definitions
 */
export async function readDefinitions(
  blobs: Pick<BlobStore, "get">,
  version: string,
): Promise<RunDefinitions | null> {
  try {
    return await definitionsOf(blobs, version);
  } catch (error) {
    // `null` is this function's answer for both; `definitionsOf` says why.
    if (error instanceof UnreadableDefinitions) return null;
    throw error;
  }
}

function isDefinitions(parsed: unknown): parsed is RunDefinitions {
  return (
    isPlainObject(parsed) &&
    isPlainObject(parsed["workflow"]) &&
    (parsed["agents"] === undefined || isPlainObject(parsed["agents"])) &&
    (parsed["workflows"] === undefined || isPlainObject(parsed["workflows"])) &&
    (parsed["collections"] === undefined || isPlainObject(parsed["collections"])) &&
    (parsed["knowledge"] === undefined || isPlainObject(parsed["knowledge"]))
  );
}

/** The error a run fails with when its definitions can't be read. */
export function missingDefinitionsError(version: string): string {
  return `The definitions this run started with (version ${version}) are missing from the blob store or can't be read, so the run can't go on. It never falls back to the workspace's files as they are now.`;
}

/**
 * The agent's file in a run's definitions, or `undefined` for a run kept
 * before agents joined its definitions.
 */
export function agentIn(definitions: RunDefinitions, agentId: string): Agent | undefined {
  const agents = definitions.agents ?? {};
  return Object.hasOwn(agents, agentId) ? agents[agentId] : undefined;
}
