// A session on MXC: one box policy, one fresh box folder, and the programs
// started in it. The fence is proven before anything the caller asks runs.

import { win32 } from "node:path";
import type {
  SandboxBlockListener,
  SandboxCommand,
  SandboxFence,
  SandboxProcess,
  SandboxProfile,
  SandboxSession,
} from "@halonicjs/ports";
import { watchBlocks } from "./blocked.ts";
import type { BoxFolder, BoxFolders } from "./box-folders.ts";
import { type BoxPolicy, boxPolicy, boxRequest, isInside } from "./box-policy.ts";
import { BoxProcess } from "./box-process.ts";
import type { MxcDisk } from "./disk.ts";
import { type FenceFiles, fenceFiles } from "./fence-files.ts";
import { proveFence } from "./fence-proof.ts";
import { grantPath } from "./grant-path.ts";
import type { MxcMachine } from "./machine.ts";
import { spawnOptions } from "./mxc-process.ts";

/** What a session needs besides its profile. */
export interface MxcSessionDeps {
  machine: MxcMachine;
  boxes: BoxFolders;
  disk: MxcDisk;
  /** The Node program the fence proof runs as; its folder is readable for the proof only. */
  nodeProgram: string;
}

/**
 * A session on MXC. It owns a box folder, made fresh for it and removed when
 * it closes, that holds the files of its fence proof. The program never gets
 * the folder, except the readable part of it for the proof's own probe.
 */
export class MxcSession implements SandboxSession {
  readonly profile: SandboxProfile;
  readonly #deps: MxcSessionDeps;
  readonly #policy: BoxPolicy;
  readonly #box: BoxFolder;
  readonly #files: FenceFiles;
  readonly #startedAt: number;
  readonly #started = new Set<BoxProcess>();
  readonly #listeners = new Set<SandboxBlockListener>();
  readonly #timer: NodeJS.Timeout;
  readonly #detach: () => void;
  #fence: SandboxFence = { state: "not-fenced", reason: "the fence proof hasn't run" };
  #closing: Promise<void> | null = null;
  #timedOut = false;

  private constructor(
    profile: SandboxProfile,
    policy: BoxPolicy,
    box: BoxFolder,
    deps: MxcSessionDeps,
    startedAt: number,
    signal: AbortSignal | undefined,
  ) {
    this.profile = profile;
    this.#policy = policy;
    this.#box = box;
    this.#deps = deps;
    this.#files = fenceFiles(box.path);
    this.#startedAt = startedAt;
    this.#timer = setTimeout(() => void this.#expire(), this.#remainingMs());
    this.#timer.unref();
    // Nobody awaits the abort handler, so a failed close has no caller to reach there.
    const abort = () => void this.close().catch(() => undefined);
    signal?.addEventListener("abort", abort, { once: true });
    this.#detach = () => signal?.removeEventListener("abort", abort);
    if (signal?.aborted) abort();
  }

  /**
   * Opens a session: builds the policy, makes the session's own box folder
   * and proves the fence. The proof is settled before this returns, and its
   * time counts against the limit. A fence that isn't proven is not an error
   * here: the session opens `not-fenced`, and `start` throws.
   *
   * @throws when the profile can't be applied (see {@link boxPolicy}) or the box folder can't be made
   */
  static async open(
    profile: SandboxProfile,
    deps: MxcSessionDeps,
    options: { signal?: AbortSignal } = {},
  ): Promise<MxcSession> {
    const startedAt = Date.now();
    const policy = await boxPolicy(profile, deps.disk);
    const box = await deps.boxes.create();
    let session: MxcSession | null = null;
    try {
      session = new MxcSession(profile, policy, box, deps, startedAt, options.signal);
      const fence = await session.#prove();
      // A session that closed during the proof (an aborted signal) stays stopped.
      if (session.#closing === null) session.#fence = fence;
      return session;
    } catch (error) {
      if (session === null) await box.remove();
      else await session.close().catch(() => undefined);
      throw error;
    }
  }

  get fence(): SandboxFence {
    return this.#fence;
  }

  async start(command: SandboxCommand): Promise<SandboxProcess> {
    if (this.#closing !== null) throw new Error("the sandbox session is closed");
    if (this.#fence.state !== "fenced") {
      const why = this.#fence.state === "not-fenced" ? this.#fence.reason : "the session is closed";
      throw new Error(`the sandbox fence is not proven: ${why}`);
    }
    const program = await this.#launch(command, this.#policy);
    // The program's own error output tells what was refused: one branch for the caller, one for us.
    const [forCaller, forWatching] = program.stderr.tee();
    void watchBlocks(forWatching, (block) => {
      for (const listener of this.#listeners) listener(block);
    });
    return program.asSandboxProcess(forCaller);
  }

  /**
   * Starts one of the adapter's own probe programs in the box, whether or not
   * the fence is proven, so the trust-check canary can say what leaked when
   * the proof failed. Never for a caller's program: only {@link MxcCanary}
   * calls it, and only with the probe programs.
   */
  async startProbe(command: SandboxCommand): Promise<SandboxProcess> {
    if (this.#closing !== null) throw new Error("the sandbox session is closed");
    return (await this.#launch(command, this.#policy)).asSandboxProcess();
  }

  onBlocked(listener: SandboxBlockListener): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  close(): Promise<void> {
    this.#closing ??= this.#shutDown(false);
    return this.#closing;
  }

  /** The time left of the limit, which counts from the start of `open`. */
  #remainingMs(): number {
    return Math.max(0, this.profile.timeLimitMs - (Date.now() - this.#startedAt));
  }

  /** Proves the fence under the real policy, with the proof's own folder and the Node folder readable for the probe only. */
  async #prove(): Promise<SandboxFence> {
    try {
      const files = this.#files;
      const policy = this.#policy;
      if (policy.deniedPaths.some((denied) => isInside(denied, grantPath(files.readable)))) {
        return {
          state: "not-fenced",
          reason: `the session's box folder is inside a denied path, so the proof's control file can't be read (${files.folder})`,
        };
      }
      const proofPolicy: BoxPolicy = {
        ...policy,
        readOnlyFolders: [
          ...new Set([
            ...policy.readOnlyFolders,
            grantPath(files.readable),
            grantPath(win32.dirname(this.#deps.nodeProgram)),
          ]),
        ],
        deniedPaths: [...new Set([...policy.deniedPaths, grantPath(files.denied)])],
      };
      return await proveFence({
        disk: this.#deps.disk,
        files,
        nodeProgram: this.#deps.nodeProgram,
        launch: async (command) => (await this.#launch(command, proofPolicy)).asSandboxProcess(),
      });
    } catch (error) {
      const why = error instanceof Error ? error.message : String(error);
      return { state: "not-fenced", reason: `the fence probe could not run: ${why}` };
    }
  }

  async #launch(command: SandboxCommand, policy: BoxPolicy): Promise<BoxProcess> {
    const request = boxRequest(policy, command, this.#remainingMs());
    const program = new BoxProcess(await this.#deps.machine.spawn(request, spawnOptions));
    this.#started.add(program);
    void program.exited.then(() => this.#started.delete(program));
    // The session may have closed while the program was launching.
    if (this.#closing !== null) await program.stop(this.#timedOut);
    return program;
  }

  async #expire(): Promise<void> {
    this.#timedOut ||= this.#closing === null;
    this.#closing ??= this.#shutDown(true);
    // Nobody awaits the timer, so a failed close has no caller to reach there: `close()` reports it.
    await this.#closing.catch(() => undefined);
  }

  async #shutDown(timedOut: boolean): Promise<void> {
    clearTimeout(this.#timer);
    this.#detach();
    try {
      await Promise.all([...this.#started].map((program) => program.stop(timedOut)));
    } finally {
      this.#fence = { state: "stopped" };
      this.#listeners.clear();
      await this.#box.remove();
    }
  }
}
