import {
  type InstructionTrustKey,
  type InstructionTrustRecord,
  type InstructionTrustStore,
  isInstructionTrustFor,
} from "@halonicjs/ports";
import { type ErrorKind, KindedError } from "@halonicjs/std";
import { instructionTrustCommands } from "./instruction-trust-commands.ts";
import { isTrustRefusal, type TauriShell, type TrustRefusal } from "./shell.ts";

/**
 * The instructions a person trusted, for the Studio desktop app: every call
 * goes to one of the shell's `instruction_trust_*` commands, which keep the
 * records in the profile, the same files the CLI's
 * `FileInstructionTrustStore` reads and writes.
 *
 * Only a person trusts instructions, so a save only asks: the shell shows its
 * own dialog and writes the record when they say yes. When they say no, the
 * save rejects with a `denied` {@link KindedError} and nothing is saved. The
 * shell asks one question at a time: a save that arrives while it is asking
 * rejects with a `conflict` error. Whatever the shell gives back is checked
 * again with `isInstructionTrustFor`, so a record that isn't for the agent
 * asked about is never trust.
 */
export class TauriInstructionTrustStore implements InstructionTrustStore {
  readonly #shell: TauriShell;

  /** @param shell - the shell's IPC, usually `window.__TAURI_INTERNALS__` */
  constructor(shell: TauriShell) {
    this.#shell = shell;
  }

  /** @throws when the record exists but can't be read, naming the agent and its workspace */
  async get(key: InstructionTrustKey): Promise<InstructionTrustRecord | null> {
    const answer = await this.#call(instructionTrustCommands.get, key, { key: keyOf(key) });
    if (answer === null) {
      return null;
    }
    if (!isInstructionTrustFor(key, answer)) {
      throw unreadable(
        key,
        new Error("The shell's answer isn't trusted instructions for this agent."),
      );
    }
    return answer;
  }

  /**
   * @throws KindedError `denied` when the person said no in the shell,
   *   `conflict` while the shell asks about another save, `unavailable` when
   *   the profile can't be written
   */
  async save(record: InstructionTrustRecord): Promise<void> {
    const { location, agent, pin, grantedAt } = record;
    await this.#call(instructionTrustCommands.save, record, {
      record: { location, agent, pin, grantedAt },
    });
  }

  /** Deletes the record, even one that can't be read; also when there is none. */
  async remove(key: InstructionTrustKey): Promise<void> {
    await this.#call(instructionTrustCommands.remove, key, { key: keyOf(key) });
  }

  /** Runs one command, turning a refusal into the error the port asks for. */
  async #call(
    command: string,
    key: InstructionTrustKey,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    try {
      return await this.#shell.invoke(command, args);
    } catch (reason) {
      throw instructionTrustFailure(reason, key);
    }
  }
}

/** Only the two fields of the key go to the shell, whatever else the caller's object holds. */
function keyOf(key: InstructionTrustKey): InstructionTrustKey {
  return { location: key.location, agent: key.agent };
}

/** How a surface should respond to each refusal other than `unreadable`. */
const errorKinds: Readonly<Record<Exclude<TrustRefusal["kind"], "unreadable">, ErrorKind>> = {
  declined: "denied",
  busy: "conflict",
  // The page built the record, so a record the shell refuses is our bug.
  invalid_record: "internal",
  io: "unavailable",
  // The commands below refuse with these only for folders, never for instructions.
  folder_unreadable: "not_found",
  not_picked: "denied",
  folder_missing: "not_found",
  folder_changed: "denied",
  name_invalid: "invalid_input",
  parent_not_chosen: "denied",
  parent_private: "denied",
  exists: "conflict",
};

/**
 * The error a rejected `instruction_trust_*` command becomes. An unreadable
 * record is a plain `Error` naming the agent and its workspace, as
 * `FileInstructionTrustStore` throws it, so the service treats both the same
 * and asks the person. Anything that isn't the shell's refusal shape (a
 * missing capability, a broken IPC call) is `unavailable`, and its text is
 * dropped: the adapter can't vouch for it.
 */
function instructionTrustFailure(reason: unknown, key: InstructionTrustKey): Error {
  if (!isTrustRefusal(reason)) {
    return new KindedError(
      "unavailable",
      "The desktop shell gave no answer to the instruction trust call.",
    );
  }
  if (reason.kind === "unreadable") {
    return unreadable(key, reason);
  }
  return new KindedError(
    errorKinds[reason.kind],
    `The instruction trust store refused the call: ${reason.message}`,
  );
}

function unreadable(key: InstructionTrustKey, cause: unknown): Error {
  return new Error(
    `The trusted instructions for the agent ${JSON.stringify(key.agent)} in ${JSON.stringify(key.location)} can't be read.`,
    { cause },
  );
}
