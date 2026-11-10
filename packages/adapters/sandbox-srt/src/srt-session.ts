import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import type {
  SandboxBlockListener,
  SandboxCommand,
  SandboxExit,
  SandboxFence,
  SandboxProcess,
  SandboxProfile,
  SandboxSession,
} from "@halonicjs/ports";
import { proveFence } from "./fence-proof.ts";
import { buildSrtConfig } from "./srt-config.ts";
import type { Runner, RunningProgram } from "./srt-runner.ts";

/**
 * Variables sandbox-runtime reads from its own environment to find a parent
 * proxy. For that traffic it skips the check against private and loopback
 * addresses, so the launcher never gets them, whoever set them.
 */
const proxyVariables = new Set(
  ["http_proxy", "https_proxy", "all_proxy", "no_proxy", "grpc_proxy"].flatMap((name) => [
    name,
    name.toUpperCase(),
  ]),
);

/**
 * The environment of the launcher, and so of the program: the profile's
 * variables, a `PATH` to find the sandbox tools when the profile has none,
 * and the session's temp folder. Never the host's own environment, and never
 * a proxy variable.
 */
export function launcherEnv(
  profile: SandboxProfile,
  { PATH: hostPath }: Record<string, string | undefined> = process.env,
): Record<string, string> {
  const env = new Map<string, string>();
  if (hostPath !== undefined) env.set("PATH", hostPath);
  env.set("TMPDIR", profile.tempFolder);
  for (const [name, value] of Object.entries(profile.env)) {
    if (!proxyVariables.has(name)) env.set(name, value);
  }
  return Object.fromEntries(env);
}

/** Whether `child` is `parent` or inside it. */
function isInside(parent: string, child: string): boolean {
  const path = relative(parent, child);
  return path === "" || (!path.startsWith("..") && !isAbsolute(path));
}

/** One started program: what the session tracks to stop it and to say why it ended. */
interface Started {
  program: RunningProgram;
  stopped: boolean;
  timedOut: boolean;
}

function exitReason(started: Started): SandboxExit["reason"] {
  if (started.timedOut) return "timeout";
  return started.stopped ? "stopped" : "exited";
}

/**
 * A sandbox-runtime session. It owns a private folder (the settings file and
 * the canary of the fence proof) that the program can't read, removed when
 * the session closes.
 */
export class SrtSession implements SandboxSession {
  readonly profile: SandboxProfile;
  readonly #runner: Runner;
  readonly #folder: string;
  readonly #settingsPath: string;
  readonly #env: Record<string, string>;
  readonly #started = new Set<Started>();
  readonly #listeners = new Set<SandboxBlockListener>();
  readonly #timer: NodeJS.Timeout;
  readonly #detach: () => void;
  #fence: SandboxFence;
  #closing: Promise<void> | null = null;

  private constructor(
    profile: SandboxProfile,
    runner: Runner,
    folder: string,
    settingsPath: string,
    fence: SandboxFence,
    signal: AbortSignal | undefined,
  ) {
    this.profile = profile;
    this.#runner = runner;
    this.#folder = folder;
    this.#settingsPath = settingsPath;
    this.#fence = fence;
    this.#env = launcherEnv(profile);
    this.#timer = setTimeout(() => void this.#expire(), profile.timeLimitMs);
    this.#timer.unref();
    const abort = () => void this.close();
    signal?.addEventListener("abort", abort, { once: true });
    this.#detach = () => signal?.removeEventListener("abort", abort);
    if (signal?.aborted) abort();
  }

  /**
   * Opens a session: writes its settings, proves the fence and returns. The
   * proof is settled before any program the caller starts. The time limit
   * counts from `startedAt`.
   */
  static async open(
    profile: SandboxProfile,
    runner: Runner,
    options: { signal?: AbortSignal } = {},
  ): Promise<SrtSession> {
    const startedAt = Date.now();
    await mkdir(profile.tempFolder, { recursive: true });
    const folder = await mkdtemp(join(tmpdir(), "halonic-srt-"));
    try {
      const settingsPath = join(folder, "settings.json");
      const config = buildSrtConfig(profile, [folder]);
      await writeFile(settingsPath, JSON.stringify(config), { mode: 0o600 });
      const fence = await proveFence({
        runner,
        settingsPath,
        canaryFolder: join(folder, "canary"),
        tempFolder: profile.tempFolder,
        workingFolder: profile.workingFolder,
        env: launcherEnv(profile),
      });
      const remaining = {
        ...profile,
        timeLimitMs: Math.max(0, profile.timeLimitMs - (Date.now() - startedAt)),
      };
      const session = new SrtSession(
        remaining,
        runner,
        folder,
        settingsPath,
        fence,
        options.signal,
      );
      return session;
    } catch (error) {
      await rm(folder, { recursive: true, force: true });
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
    const cwd = resolve(this.profile.workingFolder, command.cwd ?? ".");
    if (!isInside(resolve(this.profile.workingFolder), cwd)) {
      throw new Error(`the program must start inside the working folder, not in ${cwd}`);
    }
    const program = await this.#runner.run({
      settingsPath: this.#settingsPath,
      program: command.program,
      args: command.args,
      cwd,
      env: this.#env,
    });
    const started: Started = { program, stopped: false, timedOut: false };
    this.#started.add(started);
    // The session may have closed while the program was launching.
    if (this.#closing !== null) await this.#stop(started);
    const exited: Promise<SandboxExit> = program.ended.then(({ code, signal }) => {
      this.#started.delete(started);
      return { code, signal, reason: exitReason(started) };
    });
    return {
      stdin: program.stdin,
      stdout: program.stdout,
      stderr: program.stderr,
      exited,
      kill: async () => {
        await this.#stop(started);
      },
    };
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

  async #expire(): Promise<void> {
    this.#closing ??= this.#shutDown(true);
    await this.#closing;
  }

  async #shutDown(timedOut: boolean): Promise<void> {
    clearTimeout(this.#timer);
    this.#detach();
    await Promise.all([...this.#started].map((started) => this.#stop(started, timedOut)));
    this.#fence = { state: "stopped" };
    this.#listeners.clear();
    await rm(this.#folder, { recursive: true, force: true });
  }

  async #stop(started: Started, timedOut = false): Promise<void> {
    started.stopped = true;
    started.timedOut ||= timedOut;
    started.program.killTree();
    await started.program.ended;
  }
}
