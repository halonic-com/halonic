import { mkdir } from "node:fs/promises";
import { isIP } from "node:net";
import { isAbsolute } from "node:path";
import { NetworkConfigSchema } from "@anthropic-ai/sandbox-runtime";
import type {
  Sandbox,
  SandboxCapabilities,
  SandboxCheck,
  SandboxFix,
  SandboxNetwork,
  SandboxProfile,
  SandboxSession,
  SandboxUnavailableReason,
} from "@halonicjs/ports";
import { HelperError } from "./elevate-helper.ts";
import { describeForgetFailures, type ForgetResult, KeptGrants } from "./kept-grants.ts";
import { type Machine, systemMachine } from "./machine.ts";
import { appArmorFix, installFix } from "./package-manager.ts";
import { startSmallestSandbox } from "./ready-check.ts";
import { assertSrtDeniesKeychain, bridgeNetwork } from "./srt-config.ts";
import { type Runner, srtRunner } from "./srt-runner.ts";
import { SrtSession } from "./srt-session.ts";

/**
 * One reason the sandbox can't start, with the sentence that says what is
 * missing and, when this machine has one, the fix as data.
 */
interface Unavailable {
  reason: SandboxUnavailableReason;
  missing: string;
  fix?: SandboxFix;
}

/**
 * The ready check for each runner. A pass is kept for the rest of the process:
 * what the machine can run doesn't change while Halonic runs, and `open()`
 * checks too. A failure is dropped once it is known, so the next check asks
 * again: one timeout under load mustn't leave a long-running host "not ready"
 * until it restarts. Checks that come while one is running share it.
 */
const readyChecks = new WeakMap<Runner, Promise<string | null>>();

/**
 * What setting up the sandbox gave: done, or how it ended and why not, in one
 * line. `cancelled`: the administrator prompt was turned down. `failed`: the
 * setup didn't happen. `check_failed`: it happened, but the check doesn't
 * pass. These are the installer finish page's outcomes, which Studio and
 * `halonic sandbox setup --json` show too (HAL-1415, 2 point 4). `code` is
 * the helper's exit code, shown after the reason in small text.
 */
export type SandboxSetup =
  | { ok: true }
  | { ok: false; outcome: "cancelled" | "failed" | "check_failed"; reason: string; code?: number };

/** What removing the sandbox gave: done, or how it ended and why not, in one line. */
export type SandboxRemoval =
  | { ok: true }
  | { ok: false; outcome: "cancelled" | "failed"; reason: string; code?: number };

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
    const { reason, missing, fix } = unavailable;
    return { ok: false, reason, missing: [missing], ...(fix === undefined ? {} : { fix }) };
  }

  /**
   * The one-time setup that Studio's Settings, `halonic sandbox setup` and the
   * installer run. On Windows it runs srt's install through Halonic's signed
   * helper, with one administrator prompt, without srt's profile read grant
   * (see {@link Machine.installWindowsSandbox}), then checks the
   * sandbox, so `ok` means {@link SrtSandbox.check} passes. The install is for
   * the whole machine, so it serves every user, also when an administrator
   * other than the person at the keyboard answered the prompt. Running it
   * again repairs the install or changes nothing. Other systems have no setup
   * step. Never throws.
   */
  async setUp(): Promise<SandboxSetup> {
    const machine = this.#machine;
    if (machine.platform !== "win32") {
      const reason = `only Windows has a sandbox setup, not ${machine.platform}`;
      return { ok: false, outcome: "failed", reason };
    }
    try {
      if ((await machine.installWindowsSandbox()) === "cancelled") {
        return { ok: false, outcome: "cancelled", reason: promptCancelled };
      }
    } catch (error) {
      return { ok: false, outcome: "failed", ...failure(error) };
    }
    const check = await this.check();
    if (check.ok) return { ok: true };
    return { ok: false, outcome: "check_failed", reason: oneLine(check.missing.join("; ")) };
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
        return { ok: false, outcome: "cancelled", reason: promptCancelled };
      }
    } catch (error) {
      return { ok: false, outcome: "failed", ...failure(error) };
    }
    return { ok: true };
  }

  /**
   * Whether another program may use this sandbox too, for the warning before
   * {@link SrtSandbox.remove} (HAL-7414, S-7): on Windows, the folders srt
   * keeps write access to for this user outside `known`, the folders Halonic
   * itself works in. `unknown` is true when srt's status can't be read.
   * Other systems, with nothing to remove, give none. Never rejects.
   */
  async otherUse(known: readonly string[]): Promise<{ folders: string[]; unknown: boolean }> {
    if (this.#machine.platform !== "win32") return { folders: [], unknown: false };
    return this.#grants.foreignRoots(known);
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
  async cleanUp(profileFolder: string): Promise<{ ok: true } | { ok: false; reason: string }> {
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
   * @throws when {@link SrtSandbox.check} isn't `ok`, the profile's bridge is neither a loopback address nor a
   *   host name on an absolute socket path no longer than {@link MAX_SOCKET_PATH_BYTES} allows here, or it
   *   denies the key store and srt would drop that deny
   */
  async open(profile: SandboxProfile, options?: { signal?: AbortSignal }): Promise<SandboxSession> {
    const check = await this.check();
    if (!check.ok) throw new Error(`the sandbox can't start: ${check.missing.join("; ")}`);
    checkBridge(profile.network.bridge, this.#machine.platform);
    await assertSrtDeniesKeychain(profile);
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
      if (await machine.hasRipgrep()) return null;
      return {
        reason: "ripgrep-missing",
        missing: "ripgrep is not installed",
        fix: installFix(await machine.packageManager(), ["ripgrep"]),
      };
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
      // profile for bubblewrap lets it through once it is installed. The fix
      // installs the helpers too, so one command does it.
      const helpers = await machine.missingLinuxHelpers();
      return {
        reason: "bubblewrap-missing",
        missing: "bubblewrap is not installed",
        fix: installFix(await machine.packageManager(), ["bubblewrap", ...helpers]),
      };
    }
    const bubblewrapError = await machine.bubblewrapUserNamespaceError();
    if (bubblewrapError !== null && (await machine.appArmorRestrictsUserNamespaces())) {
      return {
        reason: "user-namespaces-restricted",
        missing: "the system doesn't let programs create user namespaces",
        fix: appArmorFix(),
      };
    }
    const helpers = await machine.missingLinuxHelpers();
    if (helpers.length > 0) {
      return {
        reason: "linux-tools-missing",
        missing: `${helpers.join(" and ")} ${helpers.length === 1 ? "is" : "are"} not installed`,
        fix: installFix(await machine.packageManager(), helpers),
      };
    }
    if (bubblewrapError !== null) {
      return { reason: "other", missing: `bubblewrap can't start: ${bubblewrapError}` };
    }
    // Bubblewrap starting proves the user namespace, not srt's network
    // namespace and bridge: start what a session starts. A pass is kept;
    // a failure is asked again on the next check.
    const runner = this.#runner;
    let ready = readyChecks.get(runner);
    if (ready === undefined) {
      ready = startSmallestSandbox(runner);
      readyChecks.set(runner, ready);
      void ready.then((error) => {
        if (error !== null && readyChecks.get(runner) === ready) readyChecks.delete(runner);
      });
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

/** A failed setup's or removal's reason, with the helper's code when the helper gave one. */
function failure(error: unknown): { reason: string; code?: number } {
  const reason = errorLine(error);
  return error instanceof HelperError ? { reason, code: error.code } : { reason };
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

/**
 * The longest Unix socket path each system takes, without the closing zero:
 * `sun_path` holds 108 bytes on Linux and 104 on macOS. A longer path fails
 * `listen` (EINVAL on Linux).
 */
export const MAX_SOCKET_PATH_BYTES: Readonly<Partial<Record<NodeJS.Platform, number>>> = {
  linux: 107,
  darwin: 103,
};

/**
 * Refuses a bridge srt can't serve as the only way to Halonic: a loopback
 * address, or a host name on a socket. The name must be one srt accepts in
 * both its allowed list and its `mitmProxy` list, and not one the program
 * dials directly (`localhost` or an address, which srt puts in NO_PROXY).
 */
function checkBridge(bridge: SandboxNetwork["bridge"], platform: NodeJS.Platform): void {
  if (bridge === null) return;
  if (bridge.kind !== "socket") {
    if (!isLoopback(bridge.host)) {
      throw new Error(`the bridge must be a loopback address, not ${bridge.host}`);
    }
    return;
  }
  const { name, socketPath } = bridge;
  if (!isAbsolute(socketPath)) {
    throw new Error(`the bridge's socket path must be absolute, not ${socketPath}`);
  }
  const bytes = Buffer.byteLength(socketPath);
  const limit = MAX_SOCKET_PATH_BYTES[platform] ?? MAX_SOCKET_PATH_BYTES.darwin ?? 0;
  if (bytes > limit) {
    throw new Error(
      `the bridge's socket path is ${bytes} bytes, more than the ${limit} a Unix socket allows on ${platform}: ${socketPath}`,
    );
  }
  const parsed = NetworkConfigSchema.safeParse({ ...bridgeNetwork(bridge), deniedDomains: [] });
  if (
    name.includes("*") ||
    isLoopback(name) ||
    isIP(name.replace(/^\[|\]$/g, "")) !== 0 ||
    !parsed.success
  ) {
    throw new Error(`the bridge's name must be a plain host name, not ${name}`);
  }
}

/** Whether `host` is `localhost` or a loopback address (`127.0.0.0/8`, `::1`). */
function isLoopback(host: string): boolean {
  const bare = host.replace(/^\[|\]$/g, "");
  if (bare === "localhost") return true;
  if (isIP(bare) === 4) return bare.startsWith("127.");
  return bare === "::1";
}
