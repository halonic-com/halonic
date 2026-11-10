import { lstatSync, realpathSync } from "node:fs";
import { isIP } from "node:net";
import { basename, dirname, join } from "node:path";
import type { SandboxRuntimeConfig } from "@anthropic-ai/sandbox-runtime";
import type { SandboxProfile } from "@halonicjs/ports";

/** A path the way sandbox-runtime wants a plain path: marked literal, so a `*` in it is never read as a pattern. */
function literalPath(path: string): { path: string; literal: true } {
  return { path, literal: true };
}

/**
 * The real path of `path`, also when it doesn't exist yet: the nearest existing
 * parent is resolved and the rest is added back. On macOS `/var` and `/tmp` are
 * symlinks, and Seatbelt matches the real path, so a deny entry for a file that
 * isn't there yet (`.npmrc`) would never match if it stayed `/var/...`.
 */
export function resolveRealPath(path: string): string {
  // srt doesn't run on Windows, and a POSIX path there would gain a drive letter and add a second entry.
  if (process.platform === "win32") return path;
  const missing: string[] = [];
  let existing = path;
  for (;;) {
    try {
      return join(realpathSync(existing), ...missing.reverse());
    } catch {
      const parent = dirname(existing);
      if (parent === existing) {
        return path;
      }
      missing.push(basename(existing));
      existing = parent;
    }
  }
}

/** A git worktree's `.git` is a file pointing at the real git folder; rewriting it redirects git (and its hooks). */
function worktreeGitFile(workingFolder: string): string[] {
  const dotGit = join(workingFolder, ".git");
  try {
    return lstatSync(dotGit).isFile() ? [dotGit] : [];
  } catch {
    return [];
  }
}

/** Both spellings of each path (as given and resolved), without repeats. */
function withResolved(paths: string[]): string[] {
  return [...new Set(paths.flatMap((path) => [path, resolveRealPath(path)]))];
}

/** The bridge as srt wants a host and port: an IPv6 host goes in brackets (`[::1]:4100`). */
function bridgeDomain(host: string, port: number): string {
  return isIP(host) === 6 ? `[${host}]:${port}` : `${host}:${port}`;
}

/**
 * Private and shared address space an allowed site may not resolve to:
 * RFC 1918, carrier-grade NAT and IPv6 unique local addresses. srt itself
 * already refuses a name that resolves to loopback, link-local, cloud metadata
 * or this computer's own addresses; these ranges it leaves to us.
 */
export const DENIED_RESOLVED_ADDRESSES: readonly string[] = [
  "10.0.0.0/8",
  "172.16.0.0/12",
  "192.168.0.0/16",
  "100.64.0.0/10",
  "fc00::/7",
];

/**
 * Files and folders inside the working folder that other tools read as
 * instructions or hooks. The program may write the working folder, but not
 * these, so it can't plant a hook that runs outside the fence later.
 * sandbox-runtime applies a similar list only at the command's own folder, so
 * this list repeats those entries for the working folder's root and adds more.
 *
 * Denying `.git/hooks` and `.git/config` when there is no `.git` yet makes
 * `.git` a read-only empty folder, so `git init` fails inside the fence. That
 * is on purpose: the program can't create a repository with its own hooks.
 *
 * The list covers only what runs without the user choosing to run project
 * code. It does not cover a git repository the program creates in a subfolder
 * during the session, or project scripts the user runs later (`npm test`,
 * `make`, a build file). Such a repository still runs its settings on the
 * user's `git status` once the program adds it to the index (HAL-3493).
 *
 * The session adds the git files only it can find at start, such as each
 * submodule's settings (see `gitPathsToDeny`).
 */
const toolSettingsInWorkingFolder = [
  join(".claude", "settings.json"),
  join(".claude", "settings.local.json"),
  join(".claude", "commands"),
  join(".claude", "agents"),
  join(".claude", "skills"),
  join(".claude", "hooks"),
  ".codex",
  ".cursor",
  // Shell start-up files, read when someone opens a shell in the folder.
  ".bashrc",
  ".bash_profile",
  ".bash_login",
  ".profile",
  ".zshrc",
  ".zshenv",
  ".zprofile",
  ".envrc",
  // Git runs these, or what they point to, on the user's next commit or fetch.
  join(".git", "hooks"),
  join(".git", "config"),
  ".gitconfig",
  ".ripgreprc",
  ".gitmodules",
  ".husky",
  // Package manager settings, which can point installs at another registry or run scripts.
  ".npmrc",
  ".yarnrc",
  ".yarnrc.yml",
  ".pnpmfile.cjs",
  join(".yarn", "releases"),
  join(".yarn", "plugins"),
  // Tool version managers, which can fetch and run another binary.
  "mise.toml",
  ".mise.toml",
  ".tool-versions",
  // Editor settings and tasks that run when the folder is opened.
  ".vscode",
  ".idea",
  ".mcp.json",
];

/**
 * Builds the sandbox-runtime settings for one session from the profile.
 *
 * The profile's `deniedPaths` become `denyRead` and `denyWrite`. Halonic works
 * out the deny list before the session opens (everything in its data folder
 * except the session's own settings folder), so nothing here has to allow a
 * path inside a denied one. Read-only paths are denied for writing only. The
 * tool settings in the working folder are denied for writing as well.
 *
 * `hiddenPaths` are paths the session adds to hide from the program, such as
 * its own settings and canary folder. `gitPaths` are the git files the session
 * found in the working folder at start (see `gitPathsToDeny`), relative to it,
 * denied for writing like the tool settings.
 *
 * Only the bridge and the allowed sites are reachable, and an allowed site is
 * refused when its name resolves to a local or private address (such as
 * `127.0.0.1.nip.io`). The bridge is an address with its port, so a name that
 * resolves to it reaches only the bridge. A profile without a bridge allows
 * the sites alone; with no sites either, the list is empty, which srt reads
 * as "no network at all".
 */
export function buildSrtConfig(
  profile: SandboxProfile,
  hiddenPaths: string[] = [],
  gitPaths: string[] = [],
): SandboxRuntimeConfig {
  const hidden = [...profile.deniedPaths, ...hiddenPaths];
  const toolSettings = [
    ...[...toolSettingsInWorkingFolder, ...gitPaths].map((path) =>
      join(profile.workingFolder, path),
    ),
    ...worktreeGitFile(profile.workingFolder),
  ];
  const writableFolders = [profile.workingFolder, profile.tempFolder];
  if (profile.settingsFolder !== null) {
    writableFolders.push(profile.settingsFolder);
  }
  const { bridge, allowedSites } = profile.network;
  const bridgeDomains = bridge === null ? [] : [bridgeDomain(bridge.host, bridge.port)];
  return {
    network: {
      allowedDomains: [...bridgeDomains, ...allowedSites],
      deniedDomains: [],
      deniedResolvedAddresses: [...DENIED_RESOLVED_ADDRESSES],
      strictAllowlist: true,
    },
    filesystem: {
      denyRead: withResolved(hidden).map(literalPath),
      allowWrite: withResolved(writableFolders).map(literalPath),
      denyWrite: withResolved([...hidden, ...profile.readOnlyPaths, ...toolSettings]).map(
        literalPath,
      ),
    },
  };
}
