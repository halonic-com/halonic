import { isIP } from "node:net";
import type {
  Sandbox,
  SandboxCapabilities,
  SandboxCheck,
  SandboxProfile,
  SandboxSession,
  SandboxUnavailableReason,
} from "@halonicjs/ports";
import { type Machine, systemMachine } from "./machine.ts";
import { type Runner, srtRunner } from "./srt-runner.ts";
import { SrtSession } from "./srt-session.ts";

/** One reason the sandbox can't start, with the sentence that says what is missing. */
interface Unavailable {
  reason: SandboxUnavailableReason;
  missing: string;
}

/** What setting up the sandbox gave: done, or why not, in one line. */
export type SandboxSetup = { ok: true } | { ok: false; reason: string };

/**
 * The Sandbox port on sandbox-runtime (srt): bubblewrap on Linux, Seatbelt on
 * macOS, a sandbox user account and network filters on Windows. Windows is
 * refused unless srt's Windows install is there (it is alpha, and needs an
 * administrator once), so `check()` fails closed.
 */
export class SrtSandbox implements Sandbox {
  readonly #machine: Machine;
  readonly #runner: Runner;
  readonly #journalFolder: string | null;

  /**
   * @param journalFolder where each session keeps its `commondir` snapshot so
   *   `recoverGitFolders` can undo it after a host crash. Give a folder only this
   *   user can write (it is created with mode 0700); without one, nothing is kept.
   */
  constructor(
    machine: Machine = systemMachine,
    runner: Runner = srtRunner,
    journalFolder: string | null = null,
  ) {
    this.#machine = machine;
    this.#runner = runner;
    this.#journalFolder = journalFolder;
  }

  /** Whether the sandbox can start here; when it can't, the first reason and one sentence on what is missing. Never throws. */
  async check(): Promise<SandboxCheck> {
    let unavailable: Unavailable | null;
    try {
      unavailable = await this.#firstUnavailable();
    } catch {
      unavailable = { reason: "other", missing: "the machine could not be examined" };
    }
    if (unavailable === null) return { ok: true, reason: null, missing: [] };
    return { ok: false, reason: unavailable.reason, missing: [unavailable.missing] };
  }

  /**
   * The one-time setup the installer runs, as an administrator. On Windows it
   * runs srt's install, without srt's profile read grant, then checks the
   * sandbox, so `ok` means {@link SrtSandbox.check} passes. The install is for
   * the whole machine, so it serves every user, also when an administrator
   * other than the person at the keyboard answered the prompt. Running it
   * again repairs the install or changes nothing. Other systems have no setup
   * step. Never throws.
   */
  async setUp(): Promise<SandboxSetup> {
    const machine = this.#machine;
    if (machine.platform !== "win32") {
      return { ok: false, reason: `only Windows has a sandbox setup, not ${machine.platform}` };
    }
    try {
      if ((await machine.installWindowsSandbox()) === "cancelled") {
        return { ok: false, reason: "the administrator prompt was cancelled; nothing changed" };
      }
    } catch (error) {
      return { ok: false, reason: oneLine(error instanceof Error ? error.message : String(error)) };
    }
    const check = await this.check();
    return check.ok ? { ok: true } : { ok: false, reason: oneLine(check.missing.join("; ")) };
  }

  /** Programs share the working folder, and the fence is the operating system's. */
  capabilities(): SandboxCapabilities {
    return { files: "shared", strength: "os" };
  }

  /**
   * Opens a session whose fence is proven before it returns.
   *
   * @throws when {@link SrtSandbox.check} isn't `ok`, or the profile has a bridge that isn't a loopback address
   */
  async open(profile: SandboxProfile, options?: { signal?: AbortSignal }): Promise<SandboxSession> {
    const check = await this.check();
    if (!check.ok) throw new Error(`the sandbox can't start: ${check.missing.join("; ")}`);
    const { bridge } = profile.network;
    if (bridge !== null && !isLoopback(bridge.host)) {
      throw new Error(`the bridge must be a loopback address, not ${bridge.host}`);
    }
    return SrtSession.open(profile, this.#runner, {
      ...options,
      journalFolder: this.#journalFolder,
    });
  }

  /** The first reason, in the order the port lists them, because its fix comes first. */
  async #firstUnavailable(): Promise<Unavailable | null> {
    const machine = this.#machine;
    if (machine.platform === "win32") {
      return (await machine.hasWindowsSandbox())
        ? null
        : {
            reason: "setup-needed",
            missing:
              "srt's Windows install is missing; run `srt windows-install` once as an administrator",
          };
    }
    if (machine.platform === "darwin") {
      return (await machine.hasSeatbelt())
        ? null
        : { reason: "other", missing: "sandbox-exec is not installed" };
    }
    if (machine.platform !== "linux") {
      return { reason: "other", missing: `${machine.platform} has no sandbox` };
    }
    if (await machine.insideContainer()) {
      return { reason: "container", missing: "Halonic runs inside a container" };
    }
    if (await machine.userNamespacesRestricted()) {
      return {
        reason: "user-namespaces-restricted",
        missing: "the system doesn't let programs create user namespaces",
      };
    }
    if (!(await machine.hasBubblewrap())) {
      return { reason: "bubblewrap-missing", missing: "bubblewrap is not installed" };
    }
    if (!(await machine.hasLinuxHelpers())) {
      return { reason: "linux-tools-missing", missing: "socat or ripgrep is not installed" };
    }
    return null;
  }
}

/** `text` on one line: srt's messages can carry srt-win's output over several. */
function oneLine(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "")
    .join(" ");
}

/** Whether `host` is `localhost` or a loopback address (`127.0.0.0/8`, `::1`). */
function isLoopback(host: string): boolean {
  const bare = host.replace(/^\[|\]$/g, "");
  if (bare === "localhost") return true;
  if (isIP(bare) === 4) return bare.startsWith("127.");
  return bare === "::1";
}
