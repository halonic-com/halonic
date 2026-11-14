import {
  approvalFrom,
  formatApproval,
  formatWaiting,
  readApproval,
  readWaiting,
} from "@halonicjs/adapter-tool-approval-kit";
import {
  keptWaitingVersions,
  type ToolApproval,
  type ToolApprovalKey,
  type ToolApprovalStore,
  type WaitingVersion,
} from "@halonicjs/ports";
import { bytesToHex, errorKindOf, KindedError } from "@halonicjs/std";
import { fileCommands, isFileRefusal } from "./file-commands.ts";
import type { TauriShell } from "./shell.ts";
import {
  believed,
  describeKey,
  newer,
  newerWaiting,
  type SourceKey,
  unreadable,
  unreadableFile,
} from "./tool-approval-errors.ts";
import { approvalFile, hashText, nameIn, waitingFile } from "./tool-approval-files.ts";

/** How often a change gives way to a write that came between its read and its write, before it gives up. */
const maxChangeAttempts = 5;

/** What a change does to a file once it has read it. */
type Change = { readonly text: string } | "remove" | "keep";

/**
 * Listed tool approvals for the Studio desktop app: every call goes to one
 * of the shell's `fs_*` commands with the folder `"tool-approvals"` and the
 * key's source, which keep them in the same files as the CLI's
 * `FileToolApprovalStore`. The page names a workspace it opened and a
 * source, never a path: the shell works out the source's folder in the
 * profile itself, refuses one inside the workspace, and writes the files
 * private to the user.
 *
 * It fails closed as the CLI's store does: it believes a file only when it
 * is exactly as Halonic writes it, and never overwrites one a newer Halonic
 * wrote. The shell holds a lock for each write, and a write here names the
 * text it read, so a change that came between is read again, never lost.
 */
export class TauriToolApprovalStore implements ToolApprovalStore {
  readonly #shell: TauriShell;

  /** @param shell - the shell's IPC, built from `window.__TAURI_INTERNALS__` */
  constructor(shell: TauriShell) {
    this.#shell = shell;
  }

  async get(key: ToolApprovalKey): Promise<ToolApproval | null> {
    const file = await approvalPath(key);
    let text: string | null;
    try {
      text = await this.#read(key, file);
    } catch (error) {
      throw unreadableText(error) ? unreadable(key, file, error) : error;
    }
    return text === null ? null : believed(key, file, readApproval(key, text));
  }

  async approve(approval: ToolApproval): Promise<void> {
    const key = { location: approval.location, source: approval.source, name: approval.name };
    const checked = approvalFrom(approval as unknown as Record<string, unknown>);
    if (typeof checked === "string") {
      throw new RangeError(`The approval for ${describeKey(key)} can't be stored: ${checked}.`);
    }
    const file = await approvalPath(key);
    await this.#change(key, file, (existing) => {
      const found = existing === null ? null : readApproval(key, existing);
      if (found?.kind === "newer") throw newer(key, file, found.problem);
      return { text: formatApproval(checked) };
    });
    await this.#forgetWaiting(key);
  }

  async revoke(key: ToolApprovalKey): Promise<void> {
    // Deletes the file without reading it, so a damaged or newer approval goes too.
    await this.#call(key, fileCommands.remove, { path: await approvalPath(key) });
    await this.#forgetWaiting(key);
  }

  async list(location: string, source: string): Promise<ToolApproval[]> {
    const sourceKey = { location, source };
    const answer = await this.#call(sourceKey, fileCommands.list, { dir: null });
    if (!Array.isArray(answer) || !answer.every((path) => typeof path === "string")) {
      throw noAnswer();
    }
    const approvals: ToolApproval[] = [];
    for (const entry of answer.filter((path) => approvalFile.test(path))) {
      let text: string | null;
      try {
        text = await this.#read(sourceKey, entry);
      } catch (error) {
        throw unreadableText(error) ? unreadableFile(sourceKey, entry, error) : error;
      }
      // Revoked since the folder was listed.
      if (text === null) continue;
      const name = await nameIn(entry, text);
      if (name === undefined) throw unreadableFile(sourceKey, entry);
      const key = { location, source, name };
      approvals.push(believed(key, entry, readApproval(key, text)));
    }
    // By code unit, never by locale. Names are unique, so there is no tie.
    return approvals.sort((left, right) => (left.name < right.name ? -1 : 1));
  }

  async noteWaiting(key: ToolApprovalKey, version: WaitingVersion): Promise<WaitingVersion[]> {
    let versions: WaitingVersion[] = [];
    await this.#change(key, waitingFile, (text) => {
      const found = text === null ? null : readWaiting(key, text);
      if (found?.kind === "newer") throw newerWaiting(key, waitingFile, found.problem);
      const waiting = found?.kind === "read" ? found.value : new Map<string, WaitingVersion[]>();
      const kept = keptWaitingVersions(waiting, key.name, version);
      versions = kept.versions;
      return { text: formatWaiting(key, kept.waiting) };
    });
    return versions;
  }

  /**
   * Forgets one tool's waiting versions. Leaves a newer Halonic's file alone.
   * Known gap: the shell can't remove a file only when it is unchanged, so a
   * `noteWaiting` from the CLI that lands between the read and the remove of
   * the last entry is lost.
   */
  async #forgetWaiting(key: ToolApprovalKey): Promise<void> {
    await this.#change(key, waitingFile, (text) => {
      if (text === null) return "keep";
      const found = readWaiting(key, text);
      if (found.kind === "newer") return "keep";
      if (found.kind === "damaged") return "remove";
      if (!found.value.delete(key.name)) return "keep";
      return found.value.size === 0 ? "remove" : { text: formatWaiting(key, found.value) };
    });
  }

  /**
   * Reads `file`, decides with `next` what to do with its text, and does it,
   * naming the text it read so the shell refuses the write if another came
   * between. Then it reads and decides again.
   */
  async #change(
    source: SourceKey,
    file: string,
    next: (text: string | null) => Change,
  ): Promise<void> {
    for (let attempt = 0; attempt < maxChangeAttempts; attempt += 1) {
      const text = await this.#readOrClear(source, file);
      const change = next(text);
      if (change === "keep") return;
      if (change === "remove") {
        await this.#call(source, fileCommands.remove, { path: file });
        return;
      }
      const answer = await this.#call(source, fileCommands.write, {
        path: file,
        text: change.text,
        expected: text === null ? "absent" : await digestOf(text),
      });
      const { status } = (answer ?? {}) as Record<string, unknown>;
      if (status === "written") return;
      if (status !== "changed-on-disk") throw noAnswer();
    }
    throw new KindedError(
      "unavailable",
      `The approvals of ${JSON.stringify(source.source)} kept changing, so ${JSON.stringify(file)} was left as it is.`,
    );
  }

  /**
   * Reads `file`. A file that isn't UTF-8 text is damaged, which the CLI's
   * store overwrites or drops, so it is removed here and read as absent.
   */
  async #readOrClear(source: SourceKey, file: string): Promise<string | null> {
    try {
      return await this.#read(source, file);
    } catch (error) {
      if (!unreadableText(error)) throw error;
      await this.#call(source, fileCommands.remove, { path: file });
      return null;
    }
  }

  async #read(source: SourceKey, file: string): Promise<string | null> {
    const answer = await this.#call(source, fileCommands.read, { path: file });
    if (answer !== null && typeof answer !== "string") throw noAnswer();
    return answer;
  }

  /** Runs one command on the source's folder, turning a refusal into an error. */
  async #call(source: SourceKey, command: string, args: Record<string, unknown>): Promise<unknown> {
    try {
      return await this.#shell.invoke(command, {
        workspace: source.location,
        folder: "tool-approvals",
        source: source.source,
        ...args,
      });
    } catch (reason) {
      throw callFailure(reason);
    }
  }
}

async function approvalPath(key: ToolApprovalKey): Promise<string> {
  return `${await hashText(key.name)}.json`;
}

/** `sha256:` and the hex SHA-256 of the text as UTF-8, which the shell compares `expected` with. */
async function digestOf(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return `sha256:${bytesToHex(new Uint8Array(digest))}`;
}

/** What a refused call becomes: a path the shell refuses is a `RangeError`, a closed workspace `denied`, anything else `unavailable`. */
function callFailure(reason: unknown): Error {
  if (!isFileRefusal(reason)) return noAnswer();
  const message = `The tool approvals refused the call: ${reason.message}`;
  switch (reason.kind) {
    case "unsafe_path":
    case "private_path":
      return new RangeError(message, { cause: reason });
    case "folder_not_open":
      return new KindedError("denied", message);
    case "not_text":
      return new KindedError("invalid_input", message);
    default:
      return new KindedError("unavailable", message);
  }
}

/** Whether a read failed because the file isn't text, which the stores tell as an unreadable approval. */
function unreadableText(error: unknown): boolean {
  return errorKindOf(error) === "invalid_input";
}

function noAnswer(): KindedError {
  return new KindedError("unavailable", "The desktop shell gave no answer to the approvals call.");
}
