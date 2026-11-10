import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, isAbsolute, join, relative, resolve } from "node:path";
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
 * The host's `PATH` without relative entries and without entries the program
 * can write.
 */
function safePath(profile: SandboxProfile, hostPath: string): string {
  const writable = [resolve(profile.workingFolder), resolve(profile.tempFolder)];
  return hostPath
    .split(delimiter)
    .filter(
      (entry) => isAbsolute(entry) && !writable.some((folder) => isInside(folder, resolve(entry))),
    )
    .join(delimiter);
}

/**
 * The environment of the launcher, which runs outside the fence: the safe
 * host `PATH` and the session's temp folder. Nothing from the profile, so
 * nothing the program influences (a planted `bwrap` on the path,
 * `NODE_OPTIONS`, `LD_PRELOAD`) runs before the fence exists.
 */
export function launcherEnv(
  profile: SandboxProfile,
  hostEnv: Record<string, string | undefined> = process.env,
): Record<string, string> {
  const env: Record<string, string> = {};
  const hostPath = hostEnv["PATH"];
  if (hostPath !== undefined) env["PATH"] = safePath(profile, hostPath);
  env["TMPDIR"] = profile.tempFolder;
  return env;
}

/**
 * The variables the program gets, set inside the fence on top of what srt
 * sets there (its proxy variables): the safe host `PATH` when the profile has
 * none, the session's temp folder and the profile's variables. Never the rest
 * of the host's environment, and never a proxy variable of the profile.
 */
export function programEnv(
  profile: SandboxProfile,
  hostEnv: Record<string, string | undefined> = process.env,
): Record<string, string> {
  const env = launcherEnv(profile, hostEnv);
  for (const [name, value] of Object.entries(profile.env)) {
    if (!proxyVariables.has(name)) env[name] = value;
  }
  return env;
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
  readonly #launcherEnv: Record<string, string>;
  readonly #programEnv: Record<string, string>;
  readonly #started = new Set<Started>();
  readonly #listeners = new Set<SandboxBlockListener>();
  readonly #timer: NodeJS.Timeout;
  readonly #detach: () => void;
  #fence: SandboxFence;
  #closing: Promise<void> | null = null;
  #timedOut = false;

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
    this.#launcherEnv = launcherEnv(profile);
    this.#programEnv = programEnv(profile);
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
        launcherEnv: launcherEnv(profile),
        programEnv: programEnv(profile),
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
      launcherEnv: this.#launcherEnv,
      programEnv: this.#programEnv,
    });
    const started: Started = { program, stopped: false, timedOut: false };
    this.#started.add(started);
    // The session may have closed while the program was launching.
    if (this.#closing !== null) await this.#stop(started, this.#timedOut);
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
    this.#timedOut ||= this.#closing === null;
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
