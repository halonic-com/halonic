// Halonic's side of the bridge: it talks to one started runner over its
// stdin and stdout, holds it to the protocol and the limits, and offers it to
// the engine as an ordinary IntegrationConnection (design HAL-958, section 3).

import { removeSecrets, type SecretForms } from "@halonicjs/adapter-integration-kit";
import type {
  IntegrationConnection,
  IntegrationHttpClient,
  SandboxProcess,
} from "@halonicjs/ports";
import { parse } from "@halonicjs/schema-kit";
import { FrameLineError, FrameLineWriter, readFrameLines } from "../frame-lines.ts";
import { type HalonicFrame, type RunnerFrame, runnerFrame } from "../frames.ts";
import { CallTable } from "./calls.ts";
import { Heartbeat } from "./heartbeat.ts";
import {
  defaultRunnerLimits,
  type RunnerBlock,
  type RunnerLimits,
  type RunnerStop,
  RunnerStoppedError,
} from "./limits.ts";
import { RequestTable } from "./requests.ts";
import { StderrLog } from "./stderr-log.ts";

/** What {@link connectRunner} needs. */
export interface ConnectRunnerOptions {
  /** The runner, already started through a `Sandbox` session. */
  process: SandboxProcess;
  /** The fresh nonce of this start; `ready` must carry it (A38). */
  nonce: string;
  /** The user's plain settings for the integration. Never a secret. */
  settings: Readonly<Record<string, unknown>>;
  /** The names of the tools the permission sheet declares. Only these are called. */
  tools: readonly string[];
  /** The kit's client for this integration: every request the runner asks for goes through it. */
  http: IntegrationHttpClient;
  /** Every form of this integration's secrets, to filter what leaves the runner. */
  secrets: SecretForms;
  /** Hears what the connector should be paused for and recorded as `sandbox.blocked`. */
  onBlocked?: (block: RunnerBlock) => void;
  /** Hears the runner's stderr, filtered and cut. */
  onStderr?: (text: string) => void;
  /** Lower limits than the design's, for tests. */
  limits?: Partial<RunnerLimits>;
}

/** A connection to one runner. */
export interface RunnerConnection extends IntegrationConnection {
  /**
   * Settles when the runner has stopped and ended, with the reason. Every
   * call still running fails with a {@link RunnerStoppedError} first.
   */
  readonly stopped: Promise<RunnerStop>;
}

/**
 * Waits for the runner's `ready`, sends `start`, and returns the connection.
 * From then on, anything the runner sends outside the protocol stops it.
 *
 * @throws {RunnerStoppedError} when the runner stops before it is ready, such as on a wrong nonce
 */
export async function connectRunner(options: ConnectRunnerOptions): Promise<RunnerConnection> {
  const bridge = new RunnerBridge(options);
  await bridge.ready;
  return {
    callTool: (name, args, signal) => bridge.callTool(name, args, signal),
    close: () => bridge.close(),
    stopped: bridge.stopped,
  };
}

class RunnerBridge {
  readonly ready: Promise<void>;
  readonly stopped: Promise<RunnerStop>;
  readonly #options: ConnectRunnerOptions;
  readonly #writer: FrameLineWriter;
  readonly #calls: CallTable;
  readonly #requests: RequestTable;
  readonly #heartbeat: Heartbeat;
  readonly #stderr: StderrLog;
  #state: "waiting" | "started" | "stopped" = "waiting";
  #stop: RunnerStop | undefined;
  #markReady: () => void = () => undefined;
  #failReady: (error: Error) => void = () => undefined;
  #markStopped: (stop: RunnerStop) => void = () => undefined;
  #readyTimer: ReturnType<typeof setTimeout>;

  constructor(options: ConnectRunnerOptions) {
    const limits = { ...defaultRunnerLimits, ...options.limits };
    this.#options = options;
    this.#writer = new FrameLineWriter(options.process.stdin);
    this.ready = new Promise((resolve, reject) => {
      this.#markReady = resolve;
      this.#failReady = reject;
    });
    this.stopped = new Promise((resolve) => {
      this.#markStopped = resolve;
    });
    this.#heartbeat = new Heartbeat(limits, {
      sendPing: (n) => this.#send({ type: "ping", n }),
      onMissedPong: () => this.#halt({ reason: "unresponsive" }),
      onIdle: () => this.#halt({ reason: "idle" }),
    });
    this.#calls = new CallTable(limits, {
      send: (frame) => this.#send(frame),
      sendCancel: (call) => this.#send({ type: "cancel", call }),
      filter: (text) => removeSecrets(text, options.secrets),
      onGraceOver: () => this.#halt({ reason: "call-deadline" }),
      onBusy: () => this.#heartbeat.duringCall(),
      onIdle: () => {
        if (this.#state === "started") this.#heartbeat.betweenCalls();
      },
    });
    this.#requests = new RequestTable(options.http, this.#calls, limits, {
      send: (frame) => this.#send(frame),
      violation: (detail) => this.#violation(detail),
      onLeakAttempt: (code) => options.onBlocked?.({ kind: "leak-attempt", code }),
    });
    this.#stderr = new StderrLog(limits.maxStderrBytesPerCall, (text) => options.onStderr?.(text));
    this.#readyTimer = setTimeout(
      () => this.#halt({ reason: "unresponsive" }),
      limits.readyTimeoutMs,
    );
    // Nobody may be waiting on `ready` yet when it fails; `stopped` carries the reason too.
    this.ready.catch(() => undefined);
    void this.#readFrames();
    void this.#stderr.pump(options.process.stderr, options.secrets);
    void options.process.exited.then((exit) => this.#halt({ reason: "exited", exit }));
  }

  callTool(name: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<string> {
    if (this.#stop !== undefined) return Promise.reject(new RunnerStoppedError(this.#stop));
    if (!this.#options.tools.includes(name)) {
      return Promise.reject(new Error(`the integration has no tool named "${name}"`));
    }
    this.#stderr.newCall();
    try {
      return this.#calls.start(name, args, signal);
    } catch (error) {
      return Promise.reject(error);
    }
  }

  async close(): Promise<void> {
    this.#halt({ reason: "closed" });
    await this.stopped;
  }

  async #readFrames(): Promise<void> {
    try {
      for await (const value of readFrameLines(this.#options.process.stdout)) {
        if (this.#state === "stopped") return;
        this.#take(value);
      }
    } catch (error) {
      if (error instanceof FrameLineError) this.#violation(error.message);
      // Otherwise stdout itself failed, so nothing more can be read from the runner.
      else this.#halt({ reason: "channel-failed" });
      return;
    }
    // The stream ended: the runner is ending, and `exited` will say how.
  }

  #take(value: unknown): void {
    const parsed = parse(runnerFrame, value);
    if (!parsed.ok) {
      this.#violation("a frame outside the protocol");
    } else if (this.#state === "waiting") {
      this.#takeReady(parsed.value);
    } else {
      this.#dispatch(parsed.value);
    }
  }

  #dispatch(frame: RunnerFrame): void {
    switch (frame.type) {
      case "ready":
        this.#violation("a second ready");
        break;
      case "pong":
        if (!this.#heartbeat.pong(frame.n)) this.#violation("a pong for no ping");
        break;
      case "result":
        if (!this.#calls.settle(frame.call, frame)) {
          this.#violation("a result for a call that isn't running");
        }
        break;
      case "fetch":
        this.#requests.fetch(frame);
        break;
      case "pull":
        this.#requests.pull(frame.body);
        break;
      case "cancel-body":
        this.#requests.cancelBody(frame.body);
        break;
      case "abort":
        this.#requests.abort(frame.id);
        break;
    }
  }

  /** The first frame must be `ready` with this start's nonce (A26, A38). */
  #takeReady(frame: RunnerFrame): void {
    if (frame.type !== "ready") {
      this.#violation("a frame before ready");
      return;
    }
    if (frame.nonce !== this.#options.nonce) {
      this.#violation("ready with the wrong nonce");
      return;
    }
    clearTimeout(this.#readyTimer);
    this.#state = "started";
    this.#send({
      type: "start",
      settings: { ...this.#options.settings },
      tools: [...this.#options.tools],
    });
    this.#heartbeat.betweenCalls();
    this.#markReady();
  }

  /** Sends a frame. A frame too large to send throws to the caller; a broken stdin stops the runner. */
  #send(frame: HalonicFrame): void {
    if (this.#state === "stopped") return;
    this.#writer.write(frame).catch(() => this.#halt({ reason: "channel-failed" }));
  }

  #violation(detail: string): void {
    if (this.#state === "stopped") return;
    this.#options.onBlocked?.({ kind: "protocol", detail });
    this.#halt({ reason: "protocol", detail });
  }

  /** Stops the runner once, for the first reason, and fails everything still waiting. */
  #halt(stop: RunnerStop): void {
    if (this.#stop !== undefined) return;
    this.#stop = stop;
    this.#state = "stopped";
    clearTimeout(this.#readyTimer);
    this.#heartbeat.stop();
    const error = new RunnerStoppedError(stop);
    this.#failReady(error);
    this.#calls.failAll(error);
    this.#requests.closeAll();
    void this.#writer.close();
    // `stopped` waits for the kill, so Take back can wait for every runner to end (HAL-983).
    const markStopped = () => this.#markStopped(stop);
    void this.#options.process.kill().then(markStopped, markStopped);
  }
}
