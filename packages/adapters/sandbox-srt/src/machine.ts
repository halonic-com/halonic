import { execFile } from "node:child_process";
import { access, readFile } from "node:fs/promises";

/**
 * What the sandbox asks of the machine it runs on. A test hands the adapter a
 * fake one; {@link systemMachine} is the real one.
 */
export interface Machine {
  /** The operating system, as Node names it (`linux`, `darwin`, `win32`). */
  platform: NodeJS.Platform;
  /** Whether Halonic itself runs inside a container such as Docker. */
  insideContainer(): Promise<boolean>;
  /** Whether bubblewrap (`bwrap`) can be started. */
  hasBubblewrap(): Promise<boolean>;
  /**
   * Whether `socat` and `rg` (ripgrep) can be started: srt runs both on Linux,
   * `socat` for the network bridge and `rg` to find the paths it fences off.
   */
  hasLinuxHelpers(): Promise<boolean>;
  /**
   * Whether the system stops programs from creating user namespaces, which
   * bubblewrap needs: Ubuntu 24.04 does by default.
   */
  userNamespacesRestricted(): Promise<boolean>;
  /** Whether Apple's `sandbox-exec` is there. */
  hasSeatbelt(): Promise<boolean>;
  /** Whether srt's Windows install is there and usable: the sandbox account, its network filters and a matching setup version. */
  hasWindowsSandbox(): Promise<boolean>;
  /**
   * Runs srt's Windows install (`srt windows-install`): the sandbox account and
   * its network filters, for the whole machine. It asks for an administrator
   * once, unless this process already runs as one. Running it again repairs
   * the install or changes nothing.
   *
   * @returns `cancelled` when the administrator prompt was turned down; nothing changed then
   * @throws with srt's own words when the install fails
   */
  installWindowsSandbox(): Promise<"installed" | "cancelled">;
}

/** The sysctl that restricts user namespaces on Ubuntu 24.04 and later. */
const restrictSetting = "/proc/sys/kernel/apparmor_restrict_unprivileged_userns";

/** Runs a program and says whether it exited with code 0. Never rejects. */
function succeeds(file: string, args: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    execFile(file, args, { timeout: 5000 }, (error) => resolve(error === null));
  });
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

/** Asked once, like bubblewrap: the helpers srt starts next to it do not come and go while we run. */
let linuxHelpersProbe: Promise<boolean> | undefined;
function linuxHelpersStart(): Promise<boolean> {
  linuxHelpersProbe ??= Promise.all([
    succeeds("socat", ["-V"]),
    succeeds("rg", ["--version"]),
  ]).then(([socat, rg]) => socat && rg);
  return linuxHelpersProbe;
}

/** The machine this process runs on. */
export const systemMachine: Machine = {
  platform: process.platform,
  async insideContainer() {
    if ((await exists("/.dockerenv")) || (await exists("/run/.containerenv"))) return true;
    return cgroupNamesContainer(await readOrEmpty("/proc/1/cgroup"));
  },
  hasBubblewrap: bubblewrapStarts,
  hasLinuxHelpers: linuxHelpersStart,
  async userNamespacesRestricted() {
    // With bubblewrap there, ask it: it knows better than the setting (Ubuntu 24.04
    // lets bubblewrap through its own profile). Its new root is empty, so give it ours.
    if (await bubblewrapStarts()) {
      return !(await succeeds("bwrap", ["--ro-bind", "/", "/", "--unshare-user", "--", "true"]));
    }
    return (await readOrEmpty(restrictSetting)).trim() === "1";
  },
  hasSeatbelt: () => exists("/usr/bin/sandbox-exec"),
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
};
