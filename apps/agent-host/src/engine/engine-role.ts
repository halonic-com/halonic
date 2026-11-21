// The engine role's life, from `halonic-agent-host --engine`: open the
// engine (which takes `engine.lock`), say where it serves in the handshake,
// report its health, and stop when the shell says so, when the shell goes
// away (standard input ends) or when the pipe breaks. What the engine is
// (the workspace engine, its routine scheduler and its HTTP server) comes in
// through `EngineRoleParts`, so this file holds only the order of things.
import type { Readable, Writable } from "node:stream";
import type { ControlPipeFault } from "./control-frames.ts";
import {
  controlProtocolVersion,
  type HealthMessage,
  type SandboxHostMessage,
  stopGraceMs,
} from "./control-messages.ts";
import { ControlPipe } from "./control-pipe.ts";

/** How often the engine reports its health when nothing changes. */
export const healthEveryMs = 30_000;

/** What the engine role reports in a `health` frame. */
export type EngineHealth = Omit<HealthMessage, "kind">;

/** Where the sandbox host is, or `null` while none runs. */
export type SandboxHostConnection = SandboxHostMessage["connection"];

/** An open engine: it holds `engine.lock`, serves its API and runs the routine scheduler. */
export interface RunningEngine {
  /** Where the engine's API listens, `http://127.0.0.1:<port>`. */
  readonly url: string;
  /** The engine API's token for this launch. */
  readonly token: string;
  /** Its health now. */
  health(): EngineHealth;
  /** Takes the sandbox host's newest connection, for harness steps and the bridge. */
  useSandboxHost(connection: SandboxHostConnection): void;
  /** Calls `listener` whenever its health changes, until the returned function is called. */
  followHealth(listener: () => void): () => void;
  /** Stops the routine scheduler: no new run starts after it. */
  stopScheduling(): void;
  /**
   * Waits up to `graceMs` for the running steps to end, then records the
   * runs whose steps didn't end as interrupted.
   *
   * @returns how many runs it recorded as interrupted
   */
  settle(graceMs: number): Promise<number>;
  /** Closes the server and the engine, and releases `engine.lock`. */
  close(): Promise<void>;
}

/** What the engine role is made of. */
export interface EngineRoleParts {
  /**
   * Opens the engine, with the pipe for its broker requests (secrets,
   * tokens, origins) and the sandbox host's connection.
   *
   * @throws when it can't open, such as when another engine holds `engine.lock`
   */
  open(pipe: ControlPipe): Promise<RunningEngine>;
  /** Runs `tick` every `ms` milliseconds, until the returned function is called. */
  every(tick: () => void, ms: number): () => void;
  /** Writes a line for the person or the log, on standard error. */
  writeError(text: string): void;
}

/** Why the engine stops: the shell's `stop`, standard input's end, or a broken pipe. */
type StopReason = { readonly kind: "stop" } | { readonly kind: "end" } | ControlPipeFaultReason;

interface ControlPipeFaultReason {
  readonly kind: "fault";
  readonly error: ControlPipeFault;
}

/**
 * Runs the engine role on the control pipe `input` and `output` until it
 * stops. After a `stop` it sends `stopped` as its last frame; when standard
 * input ended or the pipe broke there is nobody to send it to.
 *
 * @returns the exit code: 0 after a `stop` or the end of standard input, 1 when the engine couldn't open or the pipe broke
 */
export async function runEngineRole(
  input: Readable,
  output: Writable,
  parts: EngineRoleParts,
): Promise<number> {
  let stopRequested: (reason: StopReason) => void = () => {};
  const stopReason = new Promise<StopReason>((resolve) => {
    stopRequested = resolve;
  });
  // The shell sends the connection after the handshake, so normally to an
  // open engine; one that comes sooner is kept and handed over on opening.
  let engine: RunningEngine | undefined;
  let earlySandboxHost: SandboxHostConnection | undefined;
  const pipe = new ControlPipe(input, output, {
    sandboxHost: (connection) => {
      if (engine === undefined) earlySandboxHost = connection;
      else engine.useSandboxHost(connection);
    },
    stop: () => stopRequested({ kind: "stop" }),
    end: () => stopRequested({ kind: "end" }),
    fault: (error) => stopRequested({ kind: "fault", error }),
  });

  try {
    engine = await parts.open(pipe);
  } catch (error) {
    parts.writeError(`The engine couldn't open: ${messageOf(error)}\n`);
    return 1;
  }
  if (earlySandboxHost !== undefined) engine.useSandboxHost(earlySandboxHost);
  pipe.send({
    kind: "handshake",
    protocol: controlProtocolVersion,
    url: engine.url,
    token: engine.token,
  });
  const stopReporting = reportHealth(pipe, engine, parts);

  const reason = await stopReason;
  stopReporting();
  return await stop(pipe, engine, reason, parts);
}

/** Sends `health` now, whenever it changes, and every {@link healthEveryMs}. */
function reportHealth(
  pipe: ControlPipe,
  engine: RunningEngine,
  parts: EngineRoleParts,
): () => void {
  const send = () => pipe.send({ kind: "health", ...engine.health() });
  send();
  const unfollow = engine.followHealth(send);
  const cancel = parts.every(send, healthEveryMs);
  return () => {
    unfollow();
    cancel();
  };
}

/**
 * Stops in the order the design note gives: the scheduler first, so no run
 * starts while the steps end; then the grace time; then the lock. A failure
 * on the way is written out and still closes the engine, so the lock isn't
 * left held by a process that is about to exit.
 */
async function stop(
  pipe: ControlPipe,
  engine: RunningEngine,
  reason: StopReason,
  parts: EngineRoleParts,
): Promise<number> {
  if (reason.kind === "fault")
    parts.writeError(`The control pipe broke: ${reason.error.message}\n`);
  engine.stopScheduling();
  let interrupted = 0;
  let failed = reason.kind === "fault";
  try {
    interrupted = await engine.settle(stopGraceMs);
  } catch (error) {
    parts.writeError(`The engine couldn't record its interrupted runs: ${messageOf(error)}\n`);
    failed = true;
  }
  try {
    await engine.close();
  } catch (error) {
    parts.writeError(`The engine couldn't close: ${messageOf(error)}\n`);
    failed = true;
  }
  if (reason.kind === "stop") pipe.send({ kind: "stopped", interrupted });
  return failed ? 1 : 0;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
