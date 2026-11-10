import type { RefusalCode } from "@halonicjs/adapter-integration-kit";
import type { SandboxExit } from "@halonicjs/ports";

/**
 * What Halonic holds the runner to (design HAL-958, section 3.7). Each has a
 * default from the design; tests lower them.
 */
export interface RunnerLimits {
  /** Requests in flight at once, from asking to the end of the body (8). */
  maxRequestsInFlight: number;
  /**
   * The longest a tool call may run when its own signal doesn't end it
   * sooner (5 minutes), so a call that never ends still ends (A21).
   */
  callTimeoutMs: number;
  /** How long a cancelled call may take to answer before the runner is stopped (5 s). */
  callGraceMs: number;
  /** How often Halonic pings the runner between calls (5 s). */
  pingIntervalMs: number;
  /** How long the runner has to answer a ping (1 s); a busy loop misses it (A37). */
  pongTimeoutMs: number;
  /** How long the runner may sit with no call before it is stopped (2 minutes). */
  idleStopMs: number;
  /** How long the runner has to send `ready` after it starts (10 s). */
  readyTimeoutMs: number;
  /** stderr kept per call (1 MiB); the rest is dropped and counted (A21). */
  maxStderrBytesPerCall: number;
  /** The largest body piece in one `chunk` frame (256 KiB), well inside a frame as base64. */
  maxBodyPieceBytes: number;
}

/** The design's limits. */
export const defaultRunnerLimits: Readonly<RunnerLimits> = Object.freeze({
  maxRequestsInFlight: 8,
  callTimeoutMs: 5 * 60_000,
  callGraceMs: 5_000,
  pingIntervalMs: 5_000,
  pongTimeoutMs: 1_000,
  idleStopMs: 2 * 60_000,
  readyTimeoutMs: 10_000,
  maxStderrBytesPerCall: 1_048_576,
  maxBodyPieceBytes: 256 * 1024,
});

/**
 * Why Halonic stopped the runner.
 *
 * - `closed`: the connection was closed.
 * - `idle`: no call for {@link RunnerLimits.idleStopMs}; the next call starts a new runner.
 * - `unresponsive`: no `ready` in time, or a missed `pong`.
 * - `call-deadline`: a cancelled call didn't answer within the grace.
 * - `protocol`: the runner sent something outside the protocol (A26, A33); `detail` says what.
 * - `channel-failed`: its stdin could no longer be written.
 * - `exited`: the runner ended by itself.
 */
export type RunnerStop =
  | { reason: "closed" }
  | { reason: "idle" }
  | { reason: "unresponsive" }
  | { reason: "call-deadline" }
  | { reason: "protocol"; detail: string }
  | { reason: "channel-failed" }
  | { reason: "exited"; exit: SandboxExit };

/**
 * Something the connector should be paused for and recorded as
 * `sandbox.blocked`: a frame outside the protocol, or a kit refusal on the
 * kit's leak list (`leakAttemptCodes`).
 */
export type RunnerBlock =
  | { kind: "protocol"; detail: string }
  | { kind: "leak-attempt"; code: RefusalCode };

/** A call or a start that failed because the runner stopped. */
export class RunnerStoppedError extends Error {
  override readonly name = "RunnerStoppedError";
  readonly stop: RunnerStop;

  constructor(stop: RunnerStop) {
    super(`the integration runner stopped (${stop.reason})`);
    this.stop = stop;
  }
}

/** A tool call that failed inside the runner. The message has been through the secret filter. */
export class RunnerToolError extends Error {
  override readonly name = "RunnerToolError";
}

/** A call that ran past {@link RunnerLimits.callTimeoutMs}. */
export class RunnerCallTimeoutError extends Error {
  override readonly name = "TimeoutError";
}
