// The pinned ids the auto approvals shadow runner reads (`cli.commands.serve.auto-approvals-shadow`,
// HAL-19971): one file in the serve profile, written by the owner, never in the engine workspace.
// Without it the runner doesn't start and nothing is read.

import { join } from "node:path";
import { privateFileAt } from "@halonicjs/adapter-fs-node";

/** The shadow runner's folder in the serve profile: the config, the ledger and the digests. */
export function shadowFolder(profileFolder: string): string {
  return join(profileFolder, "auto-approvals");
}

/** The config file's name in {@link shadowFolder}. */
export const shadowConfigFile = "shadow.json";

/** What the owner pins: the connection to read through, and the documents and their owners. */
export interface ShadowConfig {
  /** The connection file whose stored key the reader uses; its company is the pinned workspace. */
  readonly connection: string;
  readonly issueId: string;
  readonly neverListDocumentId: string;
  readonly stopDocumentId: string;
  /** The board users with authority over both documents. */
  readonly ownerUserIds: readonly string[];
}

/** Why the config can't be used; the runner then doesn't start. */
export type ShadowConfigProblem = "unreadable" | "wrong-shape";

/** An id as Paperclip gives them, and a connection name as the connection files allow it. */
const idPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u;

const configKeys = [
  "connection",
  "issueId",
  "neverListDocumentId",
  "ownerUserIds",
  "stopDocumentId",
] as const;

/**
 * Reads the config from the serve profile: `undefined` when there is no file, so the runner stays
 * off, a problem when it can't be used, or the config.
 */
export async function readShadowConfig(
  profileFolder: string,
): Promise<ShadowConfig | ShadowConfigProblem | undefined> {
  let text: string | undefined;
  try {
    text = await privateFileAt(join(shadowFolder(profileFolder), shadowConfigFile)).read();
  } catch {
    return "unreadable";
  }
  return text === undefined ? undefined : parseShadowConfig(text);
}

/**
 * The config in `text`, or `wrong-shape`: exactly the five fields, every id one Paperclip could
 * give, and at least one owner. Anything else is refused rather than guessed.
 */
export function parseShadowConfig(text: string): ShadowConfig | "wrong-shape" {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return "wrong-shape";
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) return "wrong-shape";
  const fields = value as Record<string, unknown>;
  if (Object.keys(fields).sort().join() !== configKeys.join()) return "wrong-shape";
  const { connection, issueId, neverListDocumentId, stopDocumentId, ownerUserIds } = fields;
  const ids = [connection, issueId, neverListDocumentId, stopDocumentId];
  if (!ids.every(isId) || !Array.isArray(ownerUserIds) || ownerUserIds.length === 0) {
    return "wrong-shape";
  }
  if (!ownerUserIds.every(isId)) return "wrong-shape";
  return {
    connection: connection as string,
    issueId: issueId as string,
    neverListDocumentId: neverListDocumentId as string,
    stopDocumentId: stopDocumentId as string,
    ownerUserIds: ownerUserIds as string[],
  };
}

function isId(value: unknown): value is string {
  return typeof value === "string" && idPattern.test(value);
}
