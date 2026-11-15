import { createHash, randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  type InstructionTrustKey,
  type InstructionTrustRecord,
  type InstructionTrustStore,
  isInstructionTrustFor,
} from "@halonicjs/ports";
import { writeFlushedFile } from "./flushed-write.ts";
import { isMissing } from "./links.ts";
import { makePrivateFolder, readUnlinkedFile } from "./private-files.ts";
import { renameOver } from "./rename-over.ts";

/**
 * The instructions a person trusted for each agent as a file in one folder of
 * the user's profile: one JSON file per agent, named by the SHA-256 of its
 * key. Like the trust records, the name never holds the location or the agent
 * id, so a file system that folds case or normalises Unicode (macOS, Windows)
 * still keeps two agents apart, and a long path still fits in a name.
 *
 * A save writes a temporary file and renames it over the record, so a reader
 * sees the old record or the new one, never half of one. The folder must
 * never be inside a workspace: an agent that edits the workspace must not be
 * able to trust its own edited instructions. For the same reason a record that
 * is a link, such as one to a file in a workspace, can't be read, and a save
 * makes the folder private even when it was already there. Only the files are
 * checked, not the folder: a folder that is itself a link is followed, which
 * is safe only because the folder lives in the profile.
 */
export class FileInstructionTrustStore implements InstructionTrustStore {
  readonly #root: string;

  /** @param root - the folder for the records, such as `<profile>/instruction-trust`; created on the first save */
  constructor(root: string) {
    this.#root = resolve(root);
  }

  async get(key: InstructionTrustKey): Promise<InstructionTrustRecord | null> {
    const file = this.#file(key);
    let text: string;
    try {
      text = await readUnlinkedFile(file);
    } catch (error) {
      if (isMissing(error)) return null;
      throw unreadable(key, file, error);
    }
    return parseRecord(key, file, text);
  }

  async save(trusted: InstructionTrustRecord): Promise<void> {
    const { location, agent, pin, grantedAt } = trusted;
    // The key goes first, so a person who opens the file sees whose it is.
    // Only the fields of a record are written, so `get` can read it back.
    const record = { location, agent, pin, grantedAt };
    const text = `${JSON.stringify(record, null, 2)}\n`;
    const file = this.#file(trusted);
    const temporary = `${file}.${randomUUID()}.tmp`;
    await makePrivateFolder(this.#root);
    try {
      await writeFlushedFile(temporary, text, { mode: 0o600 });
      await renameOver(temporary, file);
    } catch (error) {
      await rm(temporary, { force: true });
      throw error;
    }
  }

  async remove(key: InstructionTrustKey): Promise<void> {
    // Deletes the file without reading it, so a damaged record goes too.
    await rm(this.#file(key), { force: true });
  }

  #file(key: InstructionTrustKey): string {
    return join(this.#root, `${hashKey(key)}.json`);
  }
}

/**
 * The hash of a key: the JSON of `[location, agent]` as UTF-16 code units,
 * little-endian. JSON keeps a location ending in `/` from running into the
 * agent id, and UTF-16 keeps lone surrogates apart, as for trust records.
 */
function hashKey(key: InstructionTrustKey): string {
  return createHash("sha256")
    .update(JSON.stringify([key.location, key.agent]), "utf16le")
    .digest("hex");
}

/**
 * Reads a record, and refuses one that isn't exactly trusted instructions for
 * this key: a file copied over another agent's would let one agent borrow
 * another's trust, and a hand edit could add fields a harness reads.
 */
function parseRecord(key: InstructionTrustKey, file: string, text: string): InstructionTrustRecord {
  let record: unknown;
  try {
    record = JSON.parse(text);
  } catch (error) {
    throw unreadable(key, file, error);
  }
  if (!isInstructionTrustFor(key, record)) {
    throw unreadable(key, file, new Error("It isn't valid trusted instructions for this agent."));
  }
  return record;
}

function unreadable(key: InstructionTrustKey, file: string, cause: unknown): Error {
  return new Error(
    `The trusted instructions for the agent ${JSON.stringify(key.agent)} in ${JSON.stringify(key.location)} can't be read (${JSON.stringify(file)}).`,
    { cause },
  );
}
