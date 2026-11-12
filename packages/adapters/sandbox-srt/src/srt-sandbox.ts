import { mkdir } from "node:fs/promises";
import { isIP } from "node:net";
import type {
  Sandbox,
  SandboxCapabilities,
  SandboxCheck,
  SandboxProfile,
  SandboxSession,
  SandboxUnavailableReason,
} from "@halonicjs/ports";
import { describeForgetFailures, type ForgetResult, KeptGrants } from "./kept-grants.ts";
import { type Machine, systemMachine } from "./machine.ts";
import { startSmallestSandbox } from "./ready-check.ts";
import { type Runner, srtRunner } from "./srt-runner.ts";
import { SrtSession } from "./srt-session.ts";

/** One reason the sandbox can't start, with the sentence that says what is missing. */
interface Unavailable {
  reason: SandboxUnavailableReason;
  missing: string;
}

/**
 * The ready check's answer for each runner, asked once per process: what the
 * machine can run doesn't change while Halonic runs, and `open()` checks too.
 */
const readyChecks = new WeakMap<Runner, Promise<string | null>>();

/** What setting up the sandbox gave: done, or why not, in one line. */
export type SandboxSetup = { ok: true } | { ok: false; reason: string };

/** What removing the sandbox gave: done, or why not, in one line. */
export type SandboxRemoval = SandboxSetup;

/** Why a setup or a removal didn't happen when the administrator prompt was turned down. */
const promptCancelled = "the administrator prompt was cancelled; nothing changed";

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
  readonly #grants: KeptGrants;
  readonly #sweepRoots: readonly string[];
  readonly #warn: (message: string) => void;
  #swept: Promise<void> | null = null;
  readonly #sharedFolders: readonly string[];

  /**
   * @param journalFolder where each session keeps its `commondir` snapshot so
   *   `recoverGitFolders` can undo it after a host crash. Give a folder only this
   *   user can write (it is created with mode 0700); without one, nothing is kept.
   * @param options.sweepRoots on Windows, the folders that hold the sessions'
   *   working and temp folders: the sweep takes back the kept grants inside
   *   them that no live session holds (sessions that crashed before they
   *   closed). Give them only to the one host that holds the profile's lock.
   * @param options.grants takes back srt's kept Windows grants; a test passes a fake
   * @param options.warn where a failure that no caller can get is logged; stderr by default
   * @param options.sharedFolders folders other sessions work in too, such as
   *   `WSL_SHARED_FOLDERS` in Halonic's WSL distro (`srt-wsl`). Each session
   *   denies them for reading as a whole, except its own folders inside, and
   *   doesn't open when one is missing.
   */
  constructor(
    machine: Machine = systemMachine,
    runner: Runner = srtRunner,
    journalFolder: string | null = null,
    options: {
      sweepRoots?: readonly string[];
      grants?: KeptGrants;
      warn?: (message: string) => void;
      sharedFolders?: readonly string[];
    } = {},
  ) {
    this.#machine = machine;
    this.#runner = runner;
    this.#journalFolder = journalFolder;
    this.#grants = options.grants ?? new KeptGrants();
    this.#sweepRoots = options.sweepRoots ?? [];
    this.#warn = options.warn ?? ((message) => void process.stderr.write(`${message}\n`));
    this.#sharedFolders = options.sharedFolders ?? [];
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
        return { ok: false, reason: promptCancelled };
      }
    } catch (error) {
      return { ok: false, reason: errorLine(error) };
    }
    const check = await this.check();
    return check.ok ? { ok: true } : { ok: false, reason: oneLine(check.missing.join("; ")) };
  }

  /**
   * Removes what {@link SrtSandbox.setUp} left on this machine, for the
   * uninstaller, as an administrator. On Windows it runs srt's uninstall: the
   * sandbox account, its group, the network filters, srt's machine key, and
   * the write grants kept by this user's sessions. It is `ok` when nothing
   * was set up, and when run again. srt refuses, and nothing is removed,
   * while a sandboxed program runs. Other systems have nothing to remove.
   * Never throws.
   */
  async remove(): Promise<SandboxRemoval> {
    if (this.#machine.platform !== "win32") return { ok: true };
    try {
      if ((await this.#machine.uninstallWindowsSandbox()) === "cancelled") {
        return { ok: false, reason: promptCancelled };
      }
    } catch (error) {
      return { ok: false, reason: errorLine(error) };
    }
    return { ok: true };
  }

  /**
   * What the uninstaller runs, as the user: removes the entries
   * {@link SrtSandbox.open} gave srt's sandbox account on the folders above
   * the session folders in the user profile, so none stay in the user's
   * access lists. srt's own install is {@link SrtSandbox.remove}'s.
   * Other systems have nothing to remove. Never throws.
   *
   * @param profileFolder - Halonic's profile folder, which holds the sessions' temp folders
   */
  async cleanUp(profileFolder: string): Promise<SandboxSetup> {
    if (this.#machine.platform !== "win32") return { ok: true };
    try {
      await this.#machine.forgetSandboxParents(profileFolder);
      return { ok: true };
    } catch (error) {
      return { ok: false, reason: errorLine(error) };
    }
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
    const windows = this.#machine.platform === "win32";
    if (windows) {
      this.#grants.assertSupported();
      await this.sweepOnce();
      // The temp folder's parents are only there once it is.
      await mkdir(profile.tempFolder, { recursive: true });
      await this.#machine.letSandboxReadParents(grantedPaths(profile));
    }
    return SrtSession.open(profile, this.#runner, {
      ...options,
      journalFolder: this.#journalFolder,
      grants: windows ? this.#grants : null,
      warn: this.#warn,
      sharedFolders: this.#sharedFolders,
    });
  }

  /**
   * Runs the sweep of kept grants once: the host starts it as soon as it holds
   * the profile's lock, and the first `open` waits for it. A failure is
   * logged, never thrown.
   */
  sweepOnce(): Promise<void> {
    this.#swept ??= this.sweepKeptGrants().then((result) => {
      if (result.failed.length > 0) this.#warn(describeForgetFailures(result.failed));
    });
    return this.#swept;
  }

  /**
   * On Windows, forgets the kept grants inside the sweep roots that no live
   * session holds. Elsewhere, or without a root, it does nothing.
   * Never rejects.
   */
  async sweepKeptGrants(): Promise<ForgetResult> {
    if (this.#machine.platform !== "win32") return { heldByOthers: [], failed: [] };
    return this.#grants.sweep(this.#sweepRoots);
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
      if (!(await machine.hasSeatbelt())) {
        return { reason: "other", missing: "sandbox-exec is not installed" };
      }
      return (await machine.hasRipgrep())
        ? null
        : { reason: "ripgrep-missing", missing: "ripgrep is not installed" };
    }
    if (machine.platform !== "linux") {
      return { reason: "other", missing: `${machine.platform} has no sandbox` };
    }
    return this.#firstLinuxUnavailable();
  }

  /**
   * {@link SrtSandbox.#firstUnavailable} on Linux. A reason Halonic can only
   * know once bubblewrap is there is not asked without it.
   */
  async #firstLinuxUnavailable(): Promise<Unavailable | null> {
    const machine = this.#machine;
    if (await machine.insideContainer()) {
      return { reason: "container", missing: "Halonic runs inside a container" };
    }
    if (await machine.isWsl1()) {
      return {
        reason: "not-supported",
        missing: "WSL 1 can't run bubblewrap; switch the distro to WSL 2",
      };
    }
    if (!(await machine.hasBubblewrap())) {
      // Without bubblewrap, the AppArmor setting says nothing: Ubuntu 24.04's
      // profile for bubblewrap lets it through once it is installed.
      return { reason: "bubblewrap-missing", missing: "bubblewrap is not installed" };
    }
    const bubblewrapError = await machine.bubblewrapUserNamespaceError();
    if (bubblewrapError !== null && (await machine.appArmorRestrictsUserNamespaces())) {
      return {
        reason: "user-namespaces-restricted",
        missing: "the system doesn't let programs create user namespaces",
      };
    }
    const helpers = await machine.missingLinuxHelpers();
    if (helpers.length > 0) {
      return {
        reason: "linux-tools-missing",
        missing: `${helpers.join(" and ")} ${helpers.length === 1 ? "is" : "are"} not installed`,
      };
    }
    if (bubblewrapError !== null) {
      return { reason: "other", missing: `bubblewrap can't start: ${bubblewrapError}` };
    }
    // Bubblewrap starting proves the user namespace, not srt's network
    // namespace and bridge: start what a session starts, once.
    const runner = this.#runner;
    let ready = readyChecks.get(runner);
    if (ready === undefined) {
      ready = startSmallestSandbox(runner);
      readyChecks.set(runner, ready);
    }
    const srtError = await ready;
    return srtError === null
      ? null
      : { reason: "other", missing: `srt can't start a sandbox: ${srtError}` };
  }
}

/** The paths srt grants the session, whose parents a program inside must be able to look at. */
function grantedPaths(profile: SandboxProfile): string[] {
  const { workingFolder, tempFolder, settingsFolder, readOnlyPaths } = profile;
  return [
    workingFolder,
    tempFolder,
    ...(settingsFolder === null ? [] : [settingsFolder]),
    ...readOnlyPaths,
  ];
}

/** What `error` says, on one line. */
function errorLine(error: unknown): string {
  return oneLine(error instanceof Error ? error.message : String(error));
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
