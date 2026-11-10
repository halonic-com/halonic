import type { TrustRecord, TrustStore } from "@halonicjs/ports";
import { type ErrorKind, KindedError } from "@halonicjs/std";
import { isTrustRefusal, type TauriShell, type TrustRefusal, trustCommands } from "./shell.ts";

/**
 * Trust records for the Studio desktop app: every call goes to one of the
 * shell's `trust_*` commands, which keep the records in the `trust` folder of
 * the profile, the same files the CLI's `FileTrustStore` reads and writes.
 *
 * The page never names a folder the shell then opens. A grant only asks: the
 * shell saves the record, and adds the folder to the one list git and the
 * file commands share, only when the person chose that folder in the shell,
 * in the folder dialog or by saying yes when the shell asks. A grant the
 * person says no to rejects with a `denied` {@link KindedError}, and nothing
 * is saved. The shell asks about one folder at a time: a grant that arrives
 * while it is asking rejects with a `conflict` error. A revoke also closes
 * the folder.
 */
export class TauriTrustStore implements TrustStore {
  readonly #shell: TauriShell;

  /** @param shell - the shell's IPC, usually `window.__TAURI_INTERNALS__` */
  constructor(shell: TauriShell) {
    this.#shell = shell;
  }

  /** @throws when the record exists but can't be read, naming its location */
  async get(location: string): Promise<TrustRecord | null> {
    const answer = await this.#call(trustCommands.get, { location });
    if (answer === null) {
      return null;
    }
    return checkedRecord(answer);
  }

  /**
   * @throws KindedError `denied` when the person said no in the shell,
   *   `not_found` when the folder doesn't exist, `unavailable` when the
   *   profile can't be written
   */
  async grant(record: TrustRecord): Promise<void> {
    await this.#call(trustCommands.grant, { record });
  }

  /** Deletes the record and closes its folder; also when there is no record. */
  async revoke(location: string): Promise<void> {
    await this.#call(trustCommands.revoke, { location });
  }

  /** @throws when any record can't be read, naming its location, or its file when the location can't be read either */
  async list(): Promise<TrustRecord[]> {
    const answer = await this.#call(trustCommands.list, {});
    if (!Array.isArray(answer)) {
      throw noAnswer();
    }
    return answer.map(checkedRecord);
  }

  /** Runs one command, turning a refusal into the error the port asks for. */
  async #call(command: string, args: Record<string, unknown>): Promise<unknown> {
    try {
      return await this.#shell.invoke(command, args);
    } catch (reason) {
      throw trustFailure(reason, args["location"]);
    }
  }
}

/** How a surface should respond to each refusal other than `unreadable`. */
const errorKinds: Readonly<Record<Exclude<TrustRefusal["kind"], "unreadable">, ErrorKind>> = {
  declined: "denied",
  busy: "conflict",
  folder_unreadable: "not_found",
  // The page built the record, so a record the shell refuses is our bug.
  invalid_record: "internal",
  io: "unavailable",
};

/**
 * The error a rejected `trust_*` command becomes. An unreadable record is a
 * plain `Error` naming its location, as `FileTrustStore` throws it, so
 * `TrustService` treats both the same. Anything that isn't the shell's
 * refusal shape (a missing capability, a broken IPC call) is `unavailable`,
 * and its text is dropped: the adapter can't vouch for it. A refusal keeps
 * the shell's message, which names no secret.
 */
function trustFailure(reason: unknown, asked: unknown): Error {
  if (!isTrustRefusal(reason)) {
    return noAnswer();
  }
  if (reason.kind !== "unreadable") {
    return new KindedError(
      errorKinds[reason.kind],
      `The trust store refused the call: ${reason.message}`,
    );
  }
  const location = reason.location ?? (typeof asked === "string" ? asked : undefined);
  if (location !== undefined) {
    return new Error(`The trust record for ${JSON.stringify(location)} can't be read.`, {
      cause: reason,
    });
  }
  return new Error(
    `The trust record in ${JSON.stringify(reason.file ?? "the profile's trust folder")} can't be read, nor which location it is for. Delete the file to remove it.`,
    { cause: reason },
  );
}

function noAnswer(): KindedError {
  return new KindedError("unavailable", "The desktop shell gave no answer to the trust call.");
}

/**
 * A record from the shell, checked only as far as the adapter relies on it:
 * the shell reads the files with the same rules as `FileTrustStore`, and
 * `TrustService` checks the content against its fingerprint.
 */
function checkedRecord(answer: unknown): TrustRecord {
  if (
    typeof answer !== "object" ||
    answer === null ||
    typeof (answer as { location?: unknown }).location !== "string"
  ) {
    throw noAnswer();
  }
  return answer as TrustRecord;
}
