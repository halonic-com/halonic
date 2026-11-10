import {
  outputTail,
  type SettingsFolderWriter,
  writeSettingsFiles,
} from "@halonicjs/adapter-harness-kit";
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
import { isPlainObject, SecretScrubber } from "@halonicjs/std";
import { AppServerClient, type AppServerMessage, type ClientInfo } from "./app-server-client.ts";
import { AppServerEventReader, TurnFailedError } from "./app-server-events.ts";
import { PendingApprovals } from "./approvals.ts";
import { codexConfigArgs, codexConfigFile, codexConfigText } from "./config.ts";
import { codexProgram } from "./detect.ts";
import { RunEvents } from "./run-events.ts";

/** How much of Codex's standard error a failed run keeps, to say why it failed. */
const keptErrorCharacters = 4_096;

/** JSON-RPC's code for a method the receiver doesn't answer. */
const methodNotFound = -32_601;

/** What a {@link CodexRun} needs besides the task, the session and the bridge. */
export interface CodexRunOptions {
  /** Writes `config.toml` to the agent's settings folder before Codex starts. */
  settings: SettingsFolderWriter;
  /** Who Halonic is, as `initialize` tells Codex. */
  clientInfo: ClientInfo;
}

/** Codex, once it has started its thread and the task's turn. */
interface Started {
  client: AppServerClient;
  threadId: string;
  turnId: string;
}

/**
 * One Codex run (requirement `harness-codex.start`). It writes `config.toml`,
 * starts `codex app-server` in the sandbox session, starts a thread in the
 * working folder and a turn with the task's prompt, and turns what Codex
 * sends into run events with the {@link AppServerEventReader}.
 *
 * - The stream ends with the task agent's `agent.finished` once its turn has
 *   completed and Codex has been stopped.
 * - A run that fails, can't start or is cancelled ends the stream with an
 *   error. No error holds the bridge token.
 * - `send` passes a person's answer into the running turn, and a decision
 *   on an `approval.requested` back to the request it came from.
 * - `cancel` stops Codex and everything it started, and resolves once they
 *   have stopped.
 */
export class CodexRun implements HarnessRun {
  readonly #task: HarnessTask;
  readonly #bridgeToken: string;
  /** Removes the bridge token from every error the run ends with. */
  readonly #scrubber = new SecretScrubber();
  readonly #events = new RunEvents();
  readonly #approvals = new PendingApprovals();
  /** Settles with the running program once the session has started it, or `undefined` when it never did. */
  readonly #launched: Promise<SandboxProcess | undefined>;
  readonly #started: Promise<Started>;
  /** Talks to Codex; set once it has started. */
  #client: AppServerClient | undefined;
  /** Reads the task's thread; set once `thread/start` has answered. */
  #reader: AppServerEventReader | undefined;
  #iterated = false;
  #cancelled = false;
  /** Set once the turn's final event has come and the run is stopping Codex. */
  #finishing = false;

  constructor(
    task: HarnessTask,
    session: SandboxSession,
    bridge: HarnessBridge,
    options: CodexRunOptions,
  ) {
    this.#task = task;
    this.#bridgeToken = bridge.token;
    this.#scrubber.remember(bridge.token);
    const launch = this.#launch(session, bridge, options.settings);
    this.#launched = launch.then(
      (process) => process,
      () => undefined,
    );
    const workingFolder = session.profile.workingFolder;
    this.#started = launch.then((process) =>
      this.#startTurn(process, workingFolder, options.clientInfo),
    );
    // A program that can't start, or a turn that can't, is reported by the stream.
    this.#started.catch((error: unknown) => {
      // When Codex itself stopped, how it stopped says more than the
      // request it left unanswered, and #codexStopped reports that.
      if (this.#client?.ended !== true) this.#fail(error);
    });
  }

  /** Writes `config.toml` and starts `codex app-server` in the session. */
  async #launch(
    session: SandboxSession,
    bridge: HarnessBridge,
    settings: SettingsFolderWriter,
  ): Promise<SandboxProcess> {
    const folder = session.profile.settingsFolder;
    if (folder === null) {
      throw new Error("Codex needs a settings folder, and the sandbox profile has none.");
    }
    await writeSettingsFiles(folder, { [codexConfigFile]: codexConfigText() }, settings);
    if (this.#cancelled) throw cancelledError();
    return session.start({
      program: codexProgram,
      args: ["app-server", ...codexConfigArgs(bridge)],
    });
  }

  /** Opens the conversation, starts the task's thread and its first turn. */
  async #startTurn(
    process: SandboxProcess,
    workingFolder: string,
    clientInfo: ClientInfo,
  ): Promise<Started> {
    const errorTail = outputTail(process.stderr, keptErrorCharacters).catch(() => "");
    const client = new AppServerClient({
      process,
      bridgeToken: this.#bridgeToken,
      onMessage: (message) => this.#receive(client, message),
    });
    this.#client = client;
    void client.closed.then((cause) => this.#codexStopped(process, errorTail, cause));
    await client.initialize(clientInfo);
    const thread = await client.request("thread/start", this.#threadParams(workingFolder));
    const threadId = idOf(thread, "thread");
    this.#reader = new AppServerEventReader({
      agentId: this.#task.agentId,
      bridgeToken: this.#bridgeToken,
      threadId,
    });
    const turn = await client.request("turn/start", {
      threadId,
      input: textInput(this.#task.prompt),
    });
    return { client, threadId, turnId: idOf(turn, "turn") };
  }

  /**
   * The thread runs in the session's working folder, with the agent's model
   * and instructions when its file sets them. It is ephemeral: Halonic keeps
   * the run's record, so Codex keeps none in the settings folder.
   */
  #threadParams(workingFolder: string): Record<string, unknown> {
    const params: Record<string, unknown> = { cwd: workingFolder, ephemeral: true };
    if (this.#task.model !== undefined) params["model"] = this.#task.model;
    if (this.#task.instructions.trim() !== "") {
      params["developerInstructions"] = this.#task.instructions;
    }
    return params;
  }

  /** Handles one message Codex sent on its own. */
  #receive(client: AppServerClient, message: AppServerMessage): void {
    if (message.method === "serverRequest/resolved" && isPlainObject(message.params)) {
      const { requestId } = message.params;
      if (typeof requestId === "string" || typeof requestId === "number") {
        this.#approvals.forget(requestId);
      }
    }
    const approval = this.#approvals.add(message);
    if (approval !== undefined) {
      const events = this.#events.ended ? [] : (this.#reader?.approvalRequested(approval) ?? []);
      if (events.length > 0) this.#events.push(events);
      // A request no one will see, about another thread or after the run's
      // final event, can't wait for a decision.
      else
        this.#answer(client, this.#approvals.answer(approval.callId, false)).catch(() => undefined);
      return;
    }
    if (message.kind === "request") {
      void client
        .respond(message.id, {
          error: { code: methodNotFound, message: `Halonic doesn't answer \`${message.method}\`.` },
        })
        .catch(() => undefined);
      return;
    }
    if (!this.#events.ended) this.#read(message);
  }

  /** Reads a notification about the task's thread, and finishes the run after its final event. */
  #read(notification: { method: string; params: unknown }): void {
    const reader = this.#reader;
    // Codex may still say something while it stops; the run finishes once.
    if (reader === undefined || this.#finishing) return;
    let events: HarnessEvent[];
    try {
      events = reader.read(notification);
    } catch (error) {
      // The subagents still working finish before the run ends with the error.
      if (error instanceof TurnFailedError) this.#events.push(error.events);
      this.#fail(error);
      return;
    }
    if (!reader.finished) {
      this.#events.push(events);
      return;
    }
    this.#finishing = true;
    void this.#finish(events);
  }

  /**
   * Stops Codex, then ends the run with the turn's final events. The final
   * event waits until Codex has stopped, so a cancel that comes meanwhile
   * still ends the run with an error.
   */
  async #finish(events: HarnessEvent[]): Promise<void> {
    await this.#stopCodex();
    if (this.#events.ended) return;
    if (this.#cancelled) return this.#fail(cancelledError());
    this.#events.push(events);
    this.#events.end();
  }

  /**
   * Stops Codex and everything it started. When the session can't stop it,
   * the run ends with that error, so its reader still hears how it ended.
   */
  async #stopCodex(): Promise<void> {
    try {
      await (await this.#launched)?.kill();
    } catch (error) {
      this.#fail(error);
    }
  }

  /**
   * The client has stopped reading Codex's output: before the final event,
   * that ends the run with an error. When the reading stopped on a line
   * that isn't JSON-RPC, Codex may still be running; the end of the stream
   * stops it.
   */
  async #codexStopped(
    process: SandboxProcess,
    errorTail: Promise<string>,
    cause: Error | undefined,
  ): Promise<void> {
    if (this.#reader?.finished) return;
    if (cause !== undefined) return this.#fail(cause);
    const exit = await process.exited;
    if (this.#events.ended) return;
    if (this.#cancelled) return this.#fail(cancelledError());
    const lastLine = (await errorTail).trim().split("\n").at(-1)?.trim() ?? "";
    const sentence = endedEarlySentence(exit);
    this.#fail(new Error(lastLine === "" ? sentence : `${sentence}: ${lastLine}`));
  }

  [Symbol.asyncIterator](): AsyncIterator<HarnessEvent> {
    if (this.#iterated) throw new Error("A Codex run's events can be read only once.");
    this.#iterated = true;
    return this.#stream();
  }

  async *#stream(): AsyncGenerator<HarnessEvent> {
    try {
      yield* this.#events;
    } finally {
      // A reader that stops early, or a run that failed, leaves nothing running.
      this.#events.fail(new Error("The Codex run has ended."));
      await this.#stopCodex();
    }
  }

  async send(input: HarnessInput): Promise<void> {
    if (this.#events.ended) throw new Error("The Codex run has ended.");
    if (input.type === "approval") {
      const answer = this.#approvals.answer(input.callId, input.approved);
      const { client } = await this.#runningCodex();
      await this.#answer(client, answer);
      return;
    }
    const { client, threadId, turnId } = await this.#runningCodex();
    await client
      .request("turn/steer", { threadId, expectedTurnId: turnId, input: textInput(input.text) })
      .catch((error: unknown) => {
        throw this.#withoutToken(error);
      });
  }

  async cancel(): Promise<void> {
    if (this.#events.ended) return;
    this.#cancelled = true;
    // A program that never started has nothing to stop.
    await this.#stopCodex();
    this.#fail(cancelledError());
  }

  /** Codex, once its turn has started; an error when the run ended before. */
  async #runningCodex(): Promise<Started> {
    return this.#started.catch(() => {
      throw new Error("The Codex run has ended.");
    });
  }

  async #answer(
    client: AppServerClient,
    { id, result }: ReturnType<PendingApprovals["answer"]>,
  ): Promise<void> {
    await client.respond(id, { result }).catch((error: unknown) => {
      throw this.#withoutToken(error);
    });
  }

  #fail(error: unknown): void {
    this.#events.fail(this.#cancelled ? cancelledError() : this.#withoutToken(error));
  }

  /** `error` as it may leave the run: an `Error` whose message holds no bridge token. */
  #withoutToken(error: unknown): Error {
    const message = error instanceof Error ? error.message : String(error);
    return new Error(this.#scrubber.scrub(message));
  }
}

function cancelledError(): Error {
  return new Error("The Codex run was cancelled.");
}

/** A text message for Codex: the task's prompt, or a person's answer. */
function textInput(text: string): unknown[] {
  return [{ type: "text", text, text_elements: [] }];
}

/**
 * The `id` of the `thread` or `turn` in Codex's answer to `thread/start` or
 * `turn/start`.
 *
 * @throws Error when the answer has none
 */
function idOf(answer: unknown, field: "thread" | "turn"): string {
  const value = isPlainObject(answer) ? answer[field] : undefined;
  const id = isPlainObject(value) ? value["id"] : undefined;
  if (typeof id !== "string") {
    throw new Error(`Codex started a ${field} but didn't say its id.`);
  }
  return id;
}

/** Why Codex's output ended before the task's turn completed, in words a person can act on. */
function endedEarlySentence(exit: SandboxExit): string {
  switch (exit.reason) {
    case "timeout":
      return "Codex ran out of time before it finished";
    case "stopped":
      return "Codex was stopped before it finished";
    case "exited":
      return `Codex stopped with exit code ${exit.code} before it finished`;
  }
}
