import { createHash, randomUUID } from "node:crypto";
import { rename, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  type AgentPlacementKey,
  type AgentPlacementRecord,
  type AgentPlacementStore,
  isAgentPlacementFor,
} from "@halonicjs/ports";
import { isMissing } from "./links.ts";
import { makePrivateFolder, readUnlinkedFile } from "./private-files.ts";

/**
 * Each agent's "this computer" choice as a file in one folder of the user's
 * profile: one JSON file per agent, named by the SHA-256 of its key. Like
 * the trust records, the name never holds the location or the agent id, so
 * a file system that folds case or normalises Unicode (macOS, Windows) still
 * keeps two agents apart, and a long path still fits in a name.
 *
 * A save writes a temporary file and renames it over the choice, so a reader
 * sees the old choice or the new one, never half of one. The folder must
 * never be inside a workspace: an agent that edits the workspace must not be
 * able to take itself out of its sandbox. For the same reason a choice that
 * is a link, such as one to a file in a workspace, can't be read, and a
 * save makes the folder private even when it was already there. Only the
 * files are checked, not the folder: a folder that is itself a link is
 * followed, which is safe only because the folder lives in the profile.
 */
export class FileAgentPlacementStore implements AgentPlacementStore {
  readonly #root: string;

  /** @param root - the folder for the choices, such as `<profile>/placements`; created on the first save */
  constructor(root: string) {
    this.#root = resolve(root);
  }

  async get(key: AgentPlacementKey): Promise<AgentPlacementRecord | null> {
    const file = this.#file(key);
    let text: string;
    try {
      text = await readUnlinkedFile(file);
    } catch (error) {
      if (isMissing(error)) return null;
      throw unreadable(key, file, error);
    }
    return parsePlacement(key, file, text);
  }

  async save(placement: AgentPlacementRecord): Promise<void> {
    const { location, agent, runsOn, agentFingerprint, chosenAt } = placement;
    // The key goes first, so a person who opens the file sees whose it is.
    // Only the fields of a placement are written, so `get` can read it back.
    const record = { location, agent, runsOn, agentFingerprint, chosenAt };
    const text = `${JSON.stringify(record, null, 2)}\n`;
    const file = this.#file(placement);
    const temporary = `${file}.${randomUUID()}.tmp`;
    await makePrivateFolder(this.#root);
    try {
      await writeFile(temporary, text, { encoding: "utf8", mode: 0o600 });
      await rename(temporary, file);
    } catch (error) {
      await rm(temporary, { force: true });
      throw error;
    }
  }

  async remove(key: AgentPlacementKey): Promise<void> {
    // Deletes the file without reading it, so a damaged choice goes too.
    await rm(this.#file(key), { force: true });
  }

  #file(key: AgentPlacementKey): string {
    return join(this.#root, `${hashKey(key)}.json`);
  }
}

/**
 * The hash of a key: the JSON of `[location, agent]` as UTF-16 code units,
 * little-endian. JSON keeps a location ending in `/` from running into the
 * agent id, and UTF-16 keeps lone surrogates apart, as for trust records.
 */
function hashKey(key: AgentPlacementKey): string {
  return createHash("sha256")
    .update(JSON.stringify([key.location, key.agent]), "utf16le")
    .digest("hex");
}

/**
 * Reads a choice, and refuses one that isn't exactly a placement for this
 * key: a file copied over another agent's would let one agent borrow
 * another's choice, and a hand edit could add fields a harness reads.
 */
function parsePlacement(key: AgentPlacementKey, file: string, text: string): AgentPlacementRecord {
  let placement: unknown;
  try {
    placement = JSON.parse(text);
  } catch (error) {
    throw unreadable(key, file, error);
  }
  if (!isAgentPlacementFor(key, placement)) {
    throw unreadable(key, file, new Error("It isn't a valid placement for this agent."));
  }
  return placement;
}

function unreadable(key: AgentPlacementKey, file: string, cause: unknown): Error {
  return new Error(
    `The placement for the agent ${JSON.stringify(key.agent)} in ${JSON.stringify(key.location)} can't be read (${JSON.stringify(file)}).`,
    { cause },
  );
}
