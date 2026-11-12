import { execFile } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { SandboxPackageManager } from "@halonicjs/ports";
import {
  findHelper,
  HELPER_DIDNT_START,
  listsElevated,
  type RemovalSteps,
  removeThroughHelper,
  type Spawn,
  throughHelper,
} from "./elevate-helper.ts";
import { KeptGrants } from "./kept-grants.ts";
import { findPackageManager } from "./package-manager.ts";
import {
  forgetSandboxParents,
  letSandboxReadParents,
  parentsInProfile,
  sessionTempParents,
} from "./profile-parents.ts";

/**
 * What the sandbox asks of the machine it runs on. A test hands the adapter a
 * fake one; {@link systemMachine} is the real one.
 */
export interface Machine {
  /** The operating system, as Node names it (`linux`, `darwin`, `win32`). */
  platform: NodeJS.Platform;
  /** Whether Halonic itself runs inside a container such as Docker. */
  insideContainer(): Promise<boolean>;
  /** Whether the Linux kernel is WSL 1's, which can't run bubblewrap. */
  isWsl1(): Promise<boolean>;
  /** Whether bubblewrap (`bwrap`) can be started. */
  hasBubblewrap(): Promise<boolean>;
  /**
   * The helpers srt runs next to bubblewrap that can't be started, none when
   * both can: `socat` for the network bridge and ripgrep (`rg`) to find the
   * paths it fences off.
   */
  missingLinuxHelpers(): Promise<LinuxHelper[]>;
  /** Whether `rg` (ripgrep) can be started: srt runs it on macOS too, to find the paths it fences off. */
  hasRipgrep(): Promise<boolean>;
  /**
   * Starts bubblewrap in a new user namespace. Only asked once bubblewrap is
   * there.
   *
   * @returns null when it started, otherwise the first line of what bubblewrap said
   */
  bubblewrapUserNamespaceError(): Promise<string | null>;
  /**
   * Whether AppArmor stops programs without their own profile from creating
   * user namespaces: Ubuntu 24.04 does by default. Bubblewrap's own profile
   * lets it through once it is installed.
   */
  appArmorRestrictsUserNamespaces(): Promise<boolean>;
  /** Whether Apple's `sandbox-exec` is there. */
  hasSeatbelt(): Promise<boolean>;
  /**
   * The package manager that installs bubblewrap, `socat` and ripgrep here:
   * `apt`, `dnf`, `pacman` or `zypper` on Linux, `brew` on macOS, `null` when
   * there is none Halonic knows. Only for the fix a refused check names.
   */
  packageManager(): Promise<SandboxPackageManager | null>;
  /** Whether srt's Windows install is there and usable: the sandbox account, its network filters and a matching setup version. */
  hasWindowsSandbox(): Promise<boolean>;
  /**
   * Runs srt's Windows install (`srt windows-install`): the sandbox account and
   * its network filters, for the whole machine. It asks for an administrator
   * once, unless this process already runs as one. Running it again repairs
   * the install or changes nothing. With Halonic's signed helper next to this
   * program (the agent host in the app folder), the helper runs it from its
   * admin-only copy of srt-win (HAL-1451); without it (the CLI run by Node),
   * srt asks for itself.
   *
   * @returns `cancelled` when the administrator prompt was turned down; nothing changed then
   * @throws {HelperError} with a reason sentence and the helper's code, or with srt's own words, when the install fails
   */
  installWindowsSandbox(): Promise<"installed" | "cancelled">;
  /**
   * Lets srt's sandbox account read the attributes of the folders above
   * `folders` inside the user profile, which srt's grants leave out, so a
   * program can resolve paths to the session's folders there (HAL-5885).
   * Windows only.
   *
   * @throws when the sandbox account is unknown or an access list can't be read or changed
   */
  letSandboxReadParents(folders: readonly string[]): Promise<void>;
  /**
   * Runs srt's Windows uninstall (`srt windows-uninstall`), through the helper
   * as {@link Machine.installWindowsSandbox} does, which also takes away its
   * Installed apps entry. Before that, in this process and only when it runs
   * without administrator rights, it takes back the grants srt kept for this
   * user (HAL-7544, HAL-7585): the sandbox
   * account and its profile, the sandbox group, the network filters, the
   * `HKLM\SOFTWARE\sandbox-runtime` key, and the write grants this user's
   * sessions kept on their folders. It asks for an administrator once, unless
   * this process already runs as one. With nothing installed it changes
   * nothing, so running it again is safe.
   *
   * @returns `grants_kept` when it was removed through the helper but this process, with administrator rights, left the user's grants recorded; `cancelled` when the administrator prompt was turned down; nothing machine-wide changed then
   * @throws {HelperError} or with srt's own words when the uninstall fails, also while a sandboxed program runs
   */
  uninstallWindowsSandbox(): Promise<"removed" | "grants_kept" | "cancelled">;
  /**
   * Removes the sandbox account's entries from the folders above a session's
   * temp folder (`tmp\<run>` in `profileFolder`) inside the user profile, for
   * the uninstaller. The parents of other folders a session was given aren't
   * known after it closes, so their entries stay (HAL-6214). Windows only;
   * nothing to do when srt's sandbox account is gone already.
   *
   * @param profileFolder - Halonic's profile folder, `HALONIC_HOME` or `%LOCALAPPDATA%\halonic`
   * @throws when srt can't be asked for its account or an access list can't be read or changed
   */
  forgetSandboxParents(profileFolder: string): Promise<void>;
}

/** A helper srt runs next to bubblewrap on Linux. */
export type LinuxHelper = "socat" | "ripgrep";

/** The sysctl that restricts user namespaces on Ubuntu 24.04 and later. */
const restrictSetting = "/proc/sys/kernel/apparmor_restrict_unprivileged_userns";

/** Runs a program and says whether it exited with code 0. Never rejects. */
async function succeeds(file: string, args: string[]): Promise<boolean> {
  return (await failure(file, args)) === null;
}

/**
 * Runs a program. Never rejects.
 *
 * @returns null when it exited with code 0, otherwise the first line it wrote to stderr, or Node's error when it wrote none
 */
function failure(file: string, args: string[]): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(file, args, { timeout: 5000 }, (error, _stdout, stderr) => {
      if (error === null) resolve(null);
      else resolve(firstLine(String(stderr ?? "")) ?? firstLine(error.message) ?? "it failed");
    });
  });
}

/** The first line of `text` with something on it, trimmed; undefined when there is none. */
function firstLine(text: string): string | undefined {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line !== "");
}

/**
 * True when `/proc/version` names WSL 1's kernel. Its release ends in
 * `-Microsoft` (`4.4.0-19041-Microsoft`); WSL 2's kernels say
 * `microsoft-standard`, in small letters, with `-WSL2` after it since 5.10.
 */
export function procVersionIsWsl1(procVersion: string): boolean {
  return /^Linux version \S+-Microsoft\s/.test(procVersion);
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function readOrEmpty(path: string): Promise<string> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return "";
  }
}

/** True when the control-group file names a container runtime. */
export function cgroupNamesContainer(cgroup: string): boolean {
  return /\/(docker|containerd|kubepods|libpod|lxc)\b/.test(cgroup);
}

/** Asked once: whether the machine has bubblewrap does not change while we run. */
let bubblewrapProbe: Promise<boolean> | undefined;
function bubblewrapStarts(): Promise<boolean> {
  bubblewrapProbe ??= succeeds("bwrap", ["--version"]);
  return bubblewrapProbe;
}

/** Asked once, like bubblewrap: ripgrep does not come and go while we run. */
let ripgrepProbe: Promise<boolean> | undefined;
function ripgrepStarts(): Promise<boolean> {
  ripgrepProbe ??= succeeds("rg", ["--version"]);
  return ripgrepProbe;
}

/** Asked once, like bubblewrap: the helpers srt starts next to it do not come and go while we run. */
let linuxHelpersProbe: Promise<LinuxHelper[]> | undefined;
function linuxHelpersMissing(): Promise<LinuxHelper[]> {
  linuxHelpersProbe ??= Promise.all([succeeds("socat", ["-V"]), ripgrepStarts()]).then(
    ([socat, rg]) => [...(socat ? [] : ["socat" as const]), ...(rg ? [] : ["ripgrep" as const])],
  );
  return linuxHelpersProbe;
}

/** Runs a program and gives its exit code and stderr, for the sandbox helper. Never rejects. */
const spawnHelper: Spawn = (file, args) =>
  new Promise((resolve) => {
    execFile(file, args, { windowsHide: true }, (error, _stdout, stderr) => {
      if (error === null) {
        resolve({ code: 0, stderr: String(stderr ?? "") });
        return;
      }
      const code = typeof error.code === "number" ? error.code : HELPER_DIDNT_START;
      resolve({ code, stderr: String(stderr ?? "") || error.message });
    });
  });

/** This process's groups, as `whoami /groups` lists them, or null when they can't be read. */
const whoamiGroups = (): Promise<string | null> =>
  new Promise((resolve) => {
    const root = process.env["SystemRoot"];
    if (root === undefined) {
      resolve(null);
      return;
    }
    const whoami = join(root, "System32", "whoami.exe");
    const args = ["/groups", "/fo", "csv", "/nh"];
    execFile(whoami, args, { windowsHide: true, encoding: "utf8" }, (error, stdout) => {
      resolve(error === null ? stdout : null);
    });
  });

/** What a removal through the helper asks of this process (HAL-7544, HAL-7585). */
const removalSteps: RemovalSteps = {
  elevated: async () => listsElevated(await whoamiGroups()),
  forgetAll: () => new KeptGrants().forgetAll(),
};

/** The machine this process runs on. */
export const systemMachine: Machine = {
  platform: process.platform,
  async insideContainer() {
    if ((await exists("/.dockerenv")) || (await exists("/run/.containerenv"))) return true;
    return cgroupNamesContainer(await readOrEmpty("/proc/1/cgroup"));
  },
  isWsl1: async () => procVersionIsWsl1(await readOrEmpty("/proc/version")),
  hasBubblewrap: bubblewrapStarts,
  missingLinuxHelpers: linuxHelpersMissing,
  hasRipgrep: ripgrepStarts,
  // Its new root is empty, so give it ours.
  bubblewrapUserNamespaceError: () =>
    failure("bwrap", ["--ro-bind", "/", "/", "--unshare-user", "--", "true"]),
  appArmorRestrictsUserNamespaces: async () => (await readOrEmpty(restrictSetting)).trim() === "1",
  hasSeatbelt: () => exists("/usr/bin/sandbox-exec"),
  packageManager: () => findPackageManager(process.platform, process.env["PATH"] ?? ""),
  async hasWindowsSandbox() {
    if (process.platform !== "win32") return false;
    try {
      const { checkWindowsDependenciesAsync, resolveSrtWin, VENDORED_SRT_WIN_EXE } = await import(
        "@anthropic-ai/sandbox-runtime"
      );
      const check = await checkWindowsDependenciesAsync({
        srtWin: resolveSrtWin({ path: VENDORED_SRT_WIN_EXE }),
      });
      return check.errors.length === 0;
    } catch {
      return false; // No srt-win, or it did not answer: not installed, as far as we can tell.
    }
  },
  async installWindowsSandbox() {
    const helper = findHelper("setup");
    if (helper !== null) {
      return (await throughHelper(helper, "setup", spawnHelper)) === "done"
        ? "installed"
        : "cancelled";
    }
    const { installWindowsSandboxAsync, resolveSrtWin, VENDORED_SRT_WIN_EXE } = await import(
      "@anthropic-ai/sandbox-runtime"
    );
    const install = await installWindowsSandboxAsync({
      srtWin: resolveSrtWin({ path: VENDORED_SRT_WIN_EXE }),
      // srt's profile read grant would let every sandboxed program on the
      // machine read the user's profile, with files that can hold tokens
      // (.npmrc, .gitconfig). A session reads only the folders its profile names.
      skipProfileGrant: true,
    });
    return install.cancelled === true ? "cancelled" : "installed";
  },
  async letSandboxReadParents(folders) {
    const parents = parentsInProfile(folders, homedir());
    if (parents.length === 0) return;
    const { getWindowsSandboxUserStatusAsync, resolveSrtWin, VENDORED_SRT_WIN_EXE } = await import(
      "@anthropic-ai/sandbox-runtime"
    );
    const { sid } = await getWindowsSandboxUserStatusAsync({
      srtWin: resolveSrtWin({ path: VENDORED_SRT_WIN_EXE }),
    });
    if (sid === undefined) throw new Error("srt's sandbox account is not set up");
    await letSandboxReadParents(parents, sid);
  },
  async uninstallWindowsSandbox() {
    const helper = findHelper("remove");
    if (helper !== null) return removeThroughHelper(helper, spawnHelper, removalSteps);
    const { uninstallWindowsSandbox, resolveSrtWin, VENDORED_SRT_WIN_EXE } = await import(
      "@anthropic-ai/sandbox-runtime"
    );
    // srt has only a synchronous uninstall; it blocks while the prompt is up,
    // which is fine for the one-shot command that runs it.
    const uninstall = uninstallWindowsSandbox({
      srtWin: resolveSrtWin({ path: VENDORED_SRT_WIN_EXE }),
    });
    return uninstall.cancelled === true ? "cancelled" : "removed";
  },
  async forgetSandboxParents(profileFolder) {
    const parents = sessionTempParents(profileFolder, homedir());
    if (parents.length === 0) return;
    const { getWindowsSandboxUserStatusAsync, resolveSrtWin, VENDORED_SRT_WIN_EXE } = await import(
      "@anthropic-ai/sandbox-runtime"
    );
    const { sid } = await getWindowsSandboxUserStatusAsync({
      srtWin: resolveSrtWin({ path: VENDORED_SRT_WIN_EXE }),
    });
    if (sid === undefined) return;
    await forgetSandboxParents(parents, sid);
  },
};
