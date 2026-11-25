import thisComputer from "node:path";
import {
  exitWithin,
  outputTail,
  readLines,
  resetSettingsFolder,
  type SettingsFolderWriter,
} from "@halonicjs/adapter-harness-kit";
import type {
  HarnessBridge,
  HarnessEvent,
  HarnessRun,
  HarnessTask,
  SandboxExit,
  SandboxProcess,
  SandboxSession,
} from "@halonicjs/ports";
import { SecretScrubber } from "@halonicjs/std";
import { opencodeCommand } from "./command.ts";
import {
  opencodeInstructionsText,
  opencodeModelCatalog,
  opencodeUpdatePolicyText,
} from "./config.ts";
import { type OpenCodeFiles, opencodeFiles } from "./files.ts";
import { opencodeRefusal } from "./refusals.ts";
import { OpenCodeEventReader } from "./run-events.ts";

/** The longest line OpenCode may print: a tool's whole output rides in one `tool_use` line. */
export const maxEventLineLength = 16 * 1024 * 1024;

/** How much of OpenCode's standard error a failed run keeps, to say why it failed. */
const keptErrorCharacters = 4_096;

/** What an {@link OpenCodeRun} needs besides the task, the session and the bridge. */
export interface OpenCodeRunOptions {
  /** Resets the agent's settings folder and writes the session's instructions file. */
  settings: SettingsFolderWriter;
  /** The computer's platform, as Node's `process.platform` names it. */
  platform: string;
}

/**
 * One OpenCode run (requirement `harness-opencode.run`).
 *
 * - Before anything starts, it refuses with {@link opencodeRefusal}.
 * - It resets the agent's settings folder to the update policy and the
 *   model catalog, writes the session's instructions file, and starts
 *   `opencode run` in the session with the task's prompt on standard input.
 * - It turns each line OpenCode prints into run events with the
 *   {@link OpenCodeEventReader}. OpenCode prints no final line: the run ends
 *   with `agent.finished` once it has exited with code 0.
 * - A run that fails, can't start or is cancelled ends the stream with an
 *   error. No error holds the bridge token.
 * - `cancel` stops OpenCode and everything it started, and resolves once
 *   they have stopped. When the session can't stop them, it rejects with the
 *   session's error and the stream ends with that error, not "cancelled".
 *
 * OpenCode's `run` mode takes nothing once it has started, so `send` always
 * throws: it runs only for agents that don't ask first.
 */
export class OpenCodeRun implements HarnessRun {
  readonly #task: HarnessTask;
  readonly #bridgeToken: string;
  /** Removes the bridge token from every error the run ends with. */
  readonly #scrubber = new SecretScrubber();
  /** Settles with the running program, or rejects when it never started. */
  readonly #launched: Promise<SandboxProcess>;
  #iterated = false;
  #ended = false;
  #cancelled = false;
  /** The error of a stop that failed: the stream ends with it, since OpenCode may still run. */
  #stopError: Error | undefined;

  constructor(
    task: HarnessTask,
    session: SandboxSession,
    bridge: HarnessBridge,
    options: OpenCodeRunOptions,
  ) {
    this.#task = task;
    this.#bridgeToken = bridge.token;
    this.#scrubber.remember(bridge.token);
    this.#launched = this.#launch(session, options);
    // The stream reports a program that can't start; this only marks it as handled.
    this.#launched.catch(() => undefined);
  }

  /** Refuses a run that may not start, writes OpenCode's files and starts it. */
  async #launch(session: SandboxSession, options: OpenCodeRunOptions): Promise<SandboxProcess> {
    const refusal = opencodeRefusal({ task: this.#task, session, platform: options.platform });
    if (refusal !== undefined) throw new Error(refusal);
    const files = opencodeFiles(session.profile);
    await this.#writeFiles(files, options.settings);
    if (this.#cancelled) throw cancelledError();
    const process = await session.start(opencodeCommand(this.#task));
    // Not awaited: the write settles only once OpenCode reads it. One that
    // ends before reading its prompt ends the run by its exit, which says more.
    sendPrompt(process, this.#task.prompt).catch(() => undefined);
    return process;
  }

  /**
   * Leaves only Halonic's files in the agent's settings folder, so nothing a
   * run wrote there (its database, its log, a config file) reaches the next,
   * and writes the session's instructions file. The run token is in none.
   */
  async #writeFiles(files: OpenCodeFiles, settings: SettingsFolderWriter): Promise<void> {
    const folder = thisComputer.dirname(files.modelCatalog);
    const contents = {
      [thisComputer.relative(folder, files.updatePolicyFile)]: opencodeUpdatePolicyText(),
      [thisComputer.relative(folder, files.modelCatalog)]:
        `${JSON.stringify(opencodeModelCatalog(this.#task))}\n`,
    };
    await resetSettingsFolder(folder, { files: contents, signIn: [] }, settings);
    await settings.write(files.instructionsFile, opencodeInstructionsText(this.#task));
  }

  [Symbol.asyncIterator](): AsyncIterator<HarnessEvent> {
    if (this.#iterated) throw new Error("An OpenCode run's events can be read only once.");
    this.#iterated = true;
    return this.#stream();
  }

  async *#stream(): AsyncGenerator<HarnessEvent> {
    try {
      yield* this.#events();
    } catch (error) {
      throw this.#endingError(error);
    } finally {
      this.#ended = true;
      // A reader that stops early, or a run that failed, leaves nothing running.
      await this.#stop();
    }
    // A stop that failed in `finally` leaves OpenCode running: the stream says so.
    if (this.#stopError !== undefined) throw this.#stopError;
  }

  /** The run's events: each line OpenCode prints, then the final one once it exited well. */
  async *#events(): AsyncGenerator<HarnessEvent> {
    const process = await this.#launched;
    const errorTail = outputTail(process.stderr, keptErrorCharacters).catch(() => "");
    const reader = new OpenCodeEventReader({
      agentId: this.#task.agentId,
      bridgeToken: this.#bridgeToken,
    });
    for await (const line of readLines(process.stdout, { maxLineLength: maxEventLineLength })) {
      yield* reader.read(line);
    }
    const exit = await exitWithin(process, "OpenCode");
    if (this.#cancelled) throw cancelledError();
    if (exit.reason !== "exited" || exit.code !== 0) {
      const lastLine = (await errorTail).trim().split("\n").at(-1)?.trim() ?? "";
      const sentence = endedEarlySentence(exit);
      throw new Error(lastLine === "" ? sentence : `${sentence}: ${lastLine}`);
    }
    yield* reader.finish();
  }

  async send(): Promise<void> {
    if (this.#ended) throw new Error("The OpenCode run has ended.");
    throw new Error(
      "OpenCode takes no answer once it has started: it runs only for agents that don't ask first.",
    );
  }

  async cancel(): Promise<void> {
    if (this.#ended) return;
    this.#cancelled = true;
    await this.#stop();
    if (this.#stopError !== undefined) throw this.#stopError;
  }

  /** Stops OpenCode and everything it started; a program that never started has nothing to stop. */
  async #stop(): Promise<void> {
    const process = await this.#launched.catch(() => undefined);
    try {
      await process?.kill();
    } catch (error) {
      this.#stopError ??= this.#withoutToken(error);
    }
  }

  /** The error the stream ends with: a failed stop first, then a cancel, then what went wrong. */
  #endingError(error: unknown): Error {
    if (this.#stopError !== undefined) return this.#stopError;
    if (this.#cancelled) return cancelledError();
    return this.#withoutToken(error);
  }

  /** `error` as it may leave the run: an `Error` whose message holds no bridge token. */
  #withoutToken(error: unknown): Error {
    const message = error instanceof Error ? error.message : String(error);
    return new Error(this.#scrubber.scrub(message));
  }
}

/**
 * Writes the prompt to OpenCode's standard input and closes it: `opencode
 * run` with no message reads its prompt to the end of its input. The prompt
 * never goes in the arguments, which every program on the computer can see.
 */
async function sendPrompt(process: SandboxProcess, prompt: string): Promise<void> {
  const writer = process.stdin.getWriter();
  try {
    await writer.write(new TextEncoder().encode(prompt));
    await writer.close();
  } finally {
    writer.releaseLock();
  }
}

function cancelledError(): Error {
  return new Error("The OpenCode run was cancelled.");
}

/** Why OpenCode ended without finishing, in words a person can act on. */
function endedEarlySentence(exit: SandboxExit): string {
  switch (exit.reason) {
    case "timeout":
      return "OpenCode ran out of time before it finished";
    case "stopped":
      return "OpenCode was stopped before it finished";
    case "exited":
      return `OpenCode stopped with exit code ${exit.code} before it finished`;
  }
}
