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

/**
 * The Sandbox port on sandbox-runtime (srt): bubblewrap on Linux, Seatbelt on
 * macOS. Plain Windows is refused here until its mode is reviewed.
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

  capabilities(): SandboxCapabilities {
    return { files: "shared", strength: "os" };
  }

  async open(profile: SandboxProfile, options?: { signal?: AbortSignal }): Promise<SandboxSession> {
    const check = await this.check();
    if (!check.ok) throw new Error(`the sandbox can't start: ${check.missing.join("; ")}`);
    if (!isLoopback(profile.network.bridge.host)) {
      throw new Error(`the bridge must be a loopback address, not ${profile.network.bridge.host}`);
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
      return { reason: "windows", missing: "plain Windows has no sandbox yet; WSL2 does" };
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
    return null;
  }
}

/** Whether `host` is `localhost` or a loopback address (`127.0.0.0/8`, `::1`). */
function isLoopback(host: string): boolean {
  const bare = host.replace(/^\[|\]$/g, "");
  if (bare === "localhost") return true;
  if (isIP(bare) === 4) return bare.startsWith("127.");
  return bare === "::1";
}
