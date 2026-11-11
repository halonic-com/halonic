// The launcher as a `Sandbox`: it starts programs on this computer without a
// fence, for the runs the user confirmed without the sandbox (HAL-958 design
// 4.3; ADR 2026-11-11-sandbox-without-fence). Its strength is `none` and its
// sessions' fence proof is `off`, so nothing reads it as fenced. It keeps
// everything else a session promises: the profile's variables only, the
// working folder, the time limit, and stopping everything a program started.
//
// Whether a start may come here at all is decided before, from the fenced
// sandbox's check and the user's saved yes (`UnfencedRuns` in `core/app`).

import { resolve, sep } from "node:path";
import { findProgram } from "@halonicjs/adapter-system-node";
import { skillScriptsRefusal, touchesSkillScripts } from "@halonicjs/format";
import type {
  Sandbox,
  SandboxBlockListener,
  SandboxCommand,
  SandboxExit,
  SandboxFence,
  SandboxProcess,
  SandboxProfile,
  SandboxSession,
} from "@halonicjs/ports";
import {
  type HostProgram,
  nodePaths,
  programThatCouldNotStart,
  startHostProgram,
} from "./host-process.ts";

/**
 * The launcher's {@link Sandbox} on Node (requirement `sandbox-host.start`).
 *
 * @example
 * const session = await createHostSandbox().open(profile);
 * const program = await session.start({ program: "/usr/bin/node", args: ["runner.mjs"] });
 */
export function createHostSandbox(): Sandbox {
  return {
    // It answers whether the launcher works, which it always does; whether
    // code may run without the fence is the fenced sandbox's check.
    check: async () => ({ ok: true, reason: null, missing: [] }),
    capabilities: () => ({ files: "shared", strength: "none" }),
    open: async (profile, options = {}) => {
      checkBridge(profile);
      options.signal?.throwIfAborted();
      return new HostSession(profile, options.signal);
    },
  };
}

/** The port's rule for every adapter, though nothing here can hold a program to it. */
function checkBridge(profile: SandboxProfile): void {
  const bridge = profile.network.bridge;
  if (bridge !== null && !["127.0.0.1", "::1", "localhost"].includes(bridge.host)) {
    throw new Error(`the bridge must be a loopback address, not ${bridge.host}`);
  }
}

/** A started program and why it was stopped, if it was. */
interface Started {
  program: HostProgram;
  stopped: boolean;
  timedOut: boolean;
}

class HostSession implements SandboxSession {
  readonly profile: SandboxProfile;
  #fence: SandboxFence = { state: "off" };
  readonly #started = new Set<Started>();
  readonly #timer: NodeJS.Timeout;
  readonly #signal: AbortSignal | undefined;
  readonly #onAbort = () => void this.#shutDown(false);
  #closing: Promise<void> | null = null;

  constructor(profile: SandboxProfile, signal: AbortSignal | undefined) {
    this.profile = profile;
    this.#timer = setTimeout(() => void this.#shutDown(true), profile.timeLimitMs);
    this.#timer.unref();
    this.#signal = signal;
    signal?.addEventListener("abort", this.#onAbort, { once: true });
  }

  get fence(): SandboxFence {
    return this.#fence;
  }

  async start(command: SandboxCommand): Promise<SandboxProcess> {
    if (this.#closing !== null) throw new Error("the sandbox session is closed");
    const cwd = resolve(this.profile.workingFolder, command.cwd ?? ".");
    if (!isInsideOrSame(cwd, resolve(this.profile.workingFolder))) {
      throw new Error(`the program must start inside the working folder, not in ${cwd}`);
    }
    if (
      await touchesSkillScripts({ cwd, program: command.program, args: command.args }, nodePaths)
    ) {
      throw new Error(skillScriptsRefusal);
    }
    // A bare name is found on the program's own PATH, never in its folder.
    const path = await findProgram(command.program, { path: this.profile.env["PATH"] ?? "" });
    // A name that isn't found starts nothing and ends with a non-zero code, as inside the fence.
    const program =
      path === undefined
        ? programThatCouldNotStart()
        : await startHostProgram({ path, args: command.args, cwd, env: this.profile.env });
    const started: Started = { program, stopped: false, timedOut: false };
    this.#started.add(started);
    // The session may have closed while the program was starting.
    if (this.#closing !== null) await this.#stop(started, false);
    const exited = program.ended.then(({ code, signal }): SandboxExit => {
      this.#started.delete(started);
      return { code, signal, reason: exitReason(started) };
    });
    return {
      stdin: program.stdin,
      stdout: program.stdout,
      stderr: program.stderr,
      exited,
      kill: () => this.#stop(started, false),
    };
  }

  /** Nothing is fenced off, so nothing is ever blocked. */
  onBlocked(_listener: SandboxBlockListener): () => void {
    return () => {};
  }

  close(): Promise<void> {
    return this.#shutDown(false);
  }

  #shutDown(timedOut: boolean): Promise<void> {
    this.#closing ??= (async () => {
      // Stopped as soon as it closes, so nobody reads `off` from a session that starts nothing more.
      this.#fence = { state: "stopped" };
      clearTimeout(this.#timer);
      this.#signal?.removeEventListener("abort", this.#onAbort);
      await Promise.all([...this.#started].map((started) => this.#stop(started, timedOut)));
    })();
    return this.#closing;
  }

  async #stop(started: Started, timedOut: boolean): Promise<void> {
    started.stopped = true;
    started.timedOut ||= timedOut;
    started.program.stop();
    await started.program.ended;
  }
}

function exitReason(started: Started): SandboxExit["reason"] {
  if (started.timedOut) return "timeout";
  return started.stopped ? "stopped" : "exited";
}

function isInsideOrSame(path: string, folder: string): boolean {
  return path === folder || path.startsWith(folder.endsWith(sep) ? folder : folder + sep);
}
