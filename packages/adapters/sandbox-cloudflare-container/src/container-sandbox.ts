import type {
  Sandbox,
  SandboxCapabilities,
  SandboxCheck,
  SandboxCommand,
  SandboxExit,
  SandboxFence,
  SandboxProcess,
  SandboxProfile,
  SandboxSession,
} from "@halonicjs/ports";
import { type Clock, systemClock } from "@halonicjs/std";
import type { ContainerProcess, RunContainer } from "./run-container-types.ts";

/** The signal {@link SandboxProcess.kill} sends. */
const killSignal = 9;

/**
 * Whether the container path `child` is `parent` or lies inside it. A path
 * with a `.` or `..` part is never inside: the container's paths are POSIX,
 * and nothing here resolves them.
 */
function insidePosix(parent: string, child: string): boolean {
  if (child.split("/").some((part) => part === "." || part === "..")) {
    return false;
  }
  return child === parent || child.startsWith(parent.endsWith("/") ? parent : `${parent}/`);
}

/** What {@link ContainerSandbox} needs. */
export interface ContainerSandboxOptions {
  /** The run this sandbox serves. Its container object is the one named after it. */
  runId: string;
  /** Gets the container object named `runId`, such as `namespace.get(namespace.idFromName(runId))`. */
  containerFor(runId: string): RunContainer;
  /** The time the deadline is counted from. */
  clock?: Clock;
}

/**
 * The `Sandbox` port on a Cloudflare Container, one container per run. The
 * container has its own machine (`remote`) and file system (`copied`). Its
 * internet is off, and the platform lets out only what an intercept names:
 * the bridge and the profile's allowed sites.
 *
 * The bridge must be the `socket` kind: the program calls its `name`, and the
 * intercept, outside the container, sends that name to the bridge route, as
 * the proxy does for a local sandbox. Its `socketPath` has no meaning here.
 */
export class ContainerSandbox implements Sandbox {
  readonly #options: ContainerSandboxOptions;

  constructor(options: ContainerSandboxOptions) {
    this.#options = options;
  }

  /** Always `ok`: whether the container starts is only known when it does. */
  check(): Promise<SandboxCheck> {
    return Promise.resolve({ ok: true, reason: null, missing: [] });
  }

  /** Copied files, on another machine. */
  capabilities(): SandboxCapabilities {
    return { files: "copied", strength: "remote" };
  }

  /** Starts the run's container. A second open for the same run is refused by the container object. */
  async open(profile: SandboxProfile, options?: { signal?: AbortSignal }): Promise<SandboxSession> {
    const bridge = profile.network.bridge;
    if (bridge !== null && bridge.kind !== "socket") {
      throw new Error("A Cloudflare container reaches the bridge only by name (the socket kind).");
    }
    const { runId, containerFor, clock = systemClock } = this.#options;
    const deadlineMs = clock.now().getTime() + profile.timeLimitMs;
    const container = containerFor(runId);
    await container.begin({
      runId,
      deadlineMs,
      env: { ...profile.env },
      bridgeHost: bridge === null ? null : bridge.name,
      allowedSites: [...profile.network.allowedSites],
    });
    const session = new ContainerSession(
      profile,
      runId,
      container,
      () => clock.now().getTime() >= deadlineMs,
    );
    const signal = options?.signal;
    if (signal?.aborted) {
      await session.close();
    } else {
      signal?.addEventListener("abort", () => void session.close(), { once: true });
    }
    return session;
  }
}

/** One run's session in its container. */
class ContainerSession implements SandboxSession {
  readonly profile: SandboxProfile;
  #fence: SandboxFence = { state: "fenced" };
  #closing: Promise<void> | null = null;
  readonly #runId: string;
  readonly #container: RunContainer;
  readonly #pastDeadline: () => boolean;

  constructor(
    profile: SandboxProfile,
    runId: string,
    container: RunContainer,
    pastDeadline: () => boolean,
  ) {
    this.profile = profile;
    this.#runId = runId;
    this.#container = container;
    this.#pastDeadline = pastDeadline;
  }

  get fence(): SandboxFence {
    return this.#fence;
  }

  async start(command: SandboxCommand): Promise<SandboxProcess> {
    if (this.#closing !== null) {
      throw new Error("The sandbox session is closed.");
    }
    const cwd = command.cwd ?? this.profile.workingFolder;
    if (!this.#mayStartIn(cwd)) {
      throw new Error(
        `A program can't start in ${cwd}: it is outside the working folder and the read-only paths.`,
      );
    }
    const started = await this.#container.exec(this.#runId, {
      program: command.program,
      args: command.args,
      cwd,
    });
    return this.#wrap(started);
  }

  onBlocked(): () => void {
    // The container reports no blocked access yet: the platform drops it before Halonic sees it.
    return () => undefined;
  }

  close(): Promise<void> {
    this.#closing ??= this.#container.end(this.#runId).finally(() => {
      this.#fence = { state: "stopped" };
    });
    return this.#closing;
  }

  #mayStartIn(cwd: string): boolean {
    const { workingFolder, readOnlyPaths, deniedPaths, reopenedPaths = [] } = this.profile;
    const allowed = [workingFolder, ...readOnlyPaths].some((root) => insidePosix(root, cwd));
    const denied = deniedPaths.some((root) => insidePosix(root, cwd));
    const reopened = reopenedPaths.some((root) => insidePosix(root, cwd));
    return allowed && (!denied || reopened);
  }

  #wrap(started: ContainerProcess): SandboxProcess {
    let killed = false;
    const exited = started.exitCode.then(
      (code): SandboxExit => ({ code, signal: null, reason: this.#exitReason(killed) }),
      (): SandboxExit => ({ code: null, signal: "SIGKILL", reason: this.#exitReason(killed) }),
    );
    return {
      stdin: started.stdin ?? new WritableStream(),
      stdout: started.stdout ?? new ReadableStream({ start: (controller) => controller.close() }),
      stderr: started.stderr ?? new ReadableStream({ start: (controller) => controller.close() }),
      exited,
      kill: async () => {
        killed = true;
        started.kill(killSignal);
        await exited;
      },
    };
  }

  #exitReason(killed: boolean): SandboxExit["reason"] {
    if (this.#pastDeadline()) {
      return "timeout";
    }
    return killed || this.#closing !== null ? "stopped" : "exited";
  }
}
