import { join } from "node:path";
import type {
  HarnessBridge,
  HarnessEvent,
  HarnessInput,
  HarnessRun,
  HarnessTask,
  SandboxExit,
  SandboxProcess,
  SandboxSession,
} from "@halonicjs/ports";
import { SecretScrubber } from "@halonicjs/std";
import {
  claudeCodeCommand,
  hasInstructions,
  instructionsFileName,
  userMessageLine,
} from "./command.ts";
import { outputTail, streamJsonLines } from "./output.ts";
import { type SettingsFolderWriter, writeClaudeCodeSettings } from "./settings.ts";
import { findSignInProblem, SignInError } from "./sign-in.ts";
import { StreamJsonReader } from "./stream-json.ts";

/** How much of Claude Code's standard error a failed run keeps, to say why it failed. */
const keptErrorCharacters = 4_096;

/** What a {@link ClaudeCodeRun} needs besides the task, the session and the bridge. */
export interface ClaudeCodeRunOptions {
  /** Writes the agent's settings folder and the run's instructions file before Claude Code starts. */
  settings: SettingsFolderWriter;
}

/** The running program, with what the run needs to talk to it. */
interface Started {
  process: SandboxProcess;
  input: WritableStreamDefaultWriter<Uint8Array>;
  /** Claude Code's standard error, read to its end in the background; its last part. */
  errorTail: Promise<string>;
}

/**
 * One Claude Code run (requirement `harness-claude-code.start`). It writes
 * the settings folder, starts `claude` in the sandbox session, sends the
 * prompt on standard input, and turns what Claude Code prints into run
 * events with the {@link StreamJsonReader}.
 *
 * - The stream ends with the task agent's `agent.finished` once Claude Code
 *   has printed its result and exited.
 * - A run that fails, can't start or is cancelled ends the stream with an
 *   error. No error holds the bridge token.
 * - `send` passes a person's answer on as the next user message. Claude
 *   Code asks for approvals through the bridge, so no approval ever waits
 *   here.
 * - `cancel` stops Claude Code and everything it started, and resolves once
 *   they have stopped.
 */
export class ClaudeCodeRun implements HarnessRun {
  readonly #task: HarnessTask;
  readonly #bridgeToken: string;
  /** Removes the bridge token from every error the run ends with. */
  readonly #scrubber = new SecretScrubber();
  readonly #started: Promise<Started>;
  #iterated = false;
  #ended = false;
  #cancelled = false;

  constructor(
    task: HarnessTask,
    session: SandboxSession,
    bridge: HarnessBridge,
    options: ClaudeCodeRunOptions,
  ) {
    this.#task = task;
    this.#bridgeToken = bridge.token;
    this.#scrubber.remember(bridge.token);
    this.#started = this.#start(session, options.settings);
    // A program that can't start is reported by the stream, not here.
    this.#started.catch(() => undefined);
  }

  async #start(session: SandboxSession, settings: SettingsFolderWriter): Promise<Started> {
    const folder = session.profile.settingsFolder;
    if (folder === null) {
      throw new Error("Claude Code needs a settings folder, and the sandbox profile has none.");
    }
    await writeClaudeCodeSettings(folder, settings);
    const instructionsFile = await this.#writeInstructions(session.profile.tempFolder, settings);
    if (this.#cancelled) throw cancelledError();
    const process = await session.start(
      claudeCodeCommand(this.#task, { settingsFolder: folder, instructionsFile }),
    );
    const input = process.stdin.getWriter();
    const errorTail = outputTail(process.stderr, keptErrorCharacters).catch(() => "");
    // Not awaited: a program that ends at once fails this write, and its
    // exit code and standard error say why better than the write does.
    input
      .write(new TextEncoder().encode(userMessageLine(this.#task.prompt)))
      .catch(() => undefined);
    return { process, input, errorTail };
  }

  /**
   * Writes the agent's instructions to the session's temp folder, which is
   * the run's own, unlike the settings folder its runs share. Returns the
   * file, or `null` when the agent's file sets no instructions.
   */
  async #writeInstructions(
    tempFolder: string,
    writer: SettingsFolderWriter,
  ): Promise<string | null> {
    if (!hasInstructions(this.#task)) return null;
    const path = join(tempFolder, instructionsFileName);
    await writer.write(path, this.#task.instructions);
    return path;
  }

  async *[Symbol.asyncIterator](): AsyncIterator<HarnessEvent> {
    if (this.#iterated) throw new Error("A Claude Code run's events can be read only once.");
    this.#iterated = true;
    let started: Started | undefined;
    let finished = false;
    try {
      started = await this.#started.catch((error: unknown) => {
        throw this.#cancelled ? cancelledError() : this.#withoutToken(error);
      });
      const reader = new StreamJsonReader({
        agentId: this.#task.agentId,
        bridgeToken: this.#bridgeToken,
      });
      for await (const line of streamJsonLines(started.process.stdout)) {
        const events = reader.read(line);
        if (reader.finished) {
          await this.#finish(started);
          finished = true;
          // A cancel that came while Claude Code was exiting still ends the run with an error.
          if (this.#cancelled) throw cancelledError();
        }
        yield* events;
        if (finished) return;
      }
      throw await this.#endedEarly(started);
    } finally {
      this.#ended = true;
      if (started !== undefined && !finished) await started.process.kill();
    }
  }

  /** After the result: ends Claude Code's input, so it exits by itself, and waits until it has. */
  async #finish({ process, input }: Started): Promise<void> {
    await input.close().catch(() => undefined);
    await process.exited;
  }

  /** The error for a run whose output ended without a result. */
  async #endedEarly({ process, errorTail }: Started): Promise<Error> {
    const exit = await process.exited;
    if (this.#cancelled) return cancelledError();
    const output = await errorTail;
    const signInProblem = output.split("\n").map(findSignInProblem).find(Boolean);
    if (signInProblem !== undefined) return new SignInError(signInProblem);
    const lastLine = output.trim().split("\n").at(-1)?.trim() ?? "";
    const sentence = endedEarlySentence(exit);
    return new Error(this.#scrubber.scrub(lastLine === "" ? sentence : `${sentence}: ${lastLine}`));
  }

  async send(input: HarnessInput): Promise<void> {
    if (this.#ended) throw new Error("The Claude Code run has ended.");
    if (input.type === "approval") {
      throw new Error(
        `No approval with call id "${input.callId}" is waiting: Claude Code asks for approvals through the Halonic bridge.`,
      );
    }
    const { input: programInput } = await this.#started.catch(() => {
      throw new Error("The Claude Code run has ended.");
    });
    try {
      await programInput.write(new TextEncoder().encode(userMessageLine(input.text)));
    } catch {
      throw new Error("The Claude Code run has ended.");
    }
  }

  async cancel(): Promise<void> {
    if (this.#ended) return;
    this.#cancelled = true;
    // A program that never started has nothing to stop.
    const started = await this.#started.catch(() => undefined);
    await started?.process.kill();
  }

  /** `error` as it may leave the run: an `Error` whose message holds no bridge token. */
  #withoutToken(error: unknown): Error {
    if (error instanceof SignInError) return error;
    const message = error instanceof Error ? error.message : String(error);
    return new Error(this.#scrubber.scrub(message));
  }
}

function cancelledError(): Error {
  return new Error("The Claude Code run was cancelled.");
}

/** Why Claude Code's output ended before its result, in words a person can act on. */
function endedEarlySentence(exit: SandboxExit): string {
  switch (exit.reason) {
    case "timeout":
      return "Claude Code ran out of time before it finished";
    case "stopped":
      return "Claude Code was stopped before it finished";
    case "exited":
      return `Claude Code stopped with exit code ${exit.code} before it finished`;
  }
}
