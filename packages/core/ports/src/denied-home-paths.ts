// The paths in a person's home folder that a harness run's sandbox denies,
// by group (threat model 4.6): their SSH keys, cloud sign-ins, browser data,
// password stores, package registry tokens, shell histories and their own
// Claude Code and Codex settings. One list, so the sandbox's profile and a
// plugin's copy (`app.plugin-add`) leave out the same paths.

import type { DeniedPathGroupCode } from "@halonicjs/events";
import { segmentAsOpened } from "./definition-store.ts";

/** The systems a harness runs on, as Node names them. */
export type HomePlatform = "linux" | "darwin" | "win32";

/** Paths in the home folder, with `/` between their names: on every system, and on one only. */
export interface HomePaths {
  readonly everywhere: readonly string[];
  readonly only?: Readonly<Partial<Record<HomePlatform, readonly string[]>>>;
}

/** The denied groups found in the home folder; `halonic-data` is the data folder's own. */
export type HomeDeniedGroupCode = Exclude<DeniedPathGroupCode, "halonic-data">;

/** The denied paths in the home folder, by group. */
export const deniedHomePaths: Readonly<Record<HomeDeniedGroupCode, HomePaths>> = {
  "ssh-keys": { everywhere: [".ssh"] },
  "cloud-sign-ins": {
    everywhere: [
      ".aws",
      ".azure",
      ".config/gcloud",
      ".kube",
      ".docker",
      ".config/gh",
      ".netrc",
      ".git-credentials",
    ],
    only: { win32: ["AppData/Roaming/gcloud", "AppData/Roaming/GitHub CLI"] },
  },
  "browser-data": {
    everywhere: [],
    only: {
      linux: [".config/google-chrome", ".config/chromium", ".config/BraveSoftware", ".mozilla"],
      darwin: [
        "Library/Application Support/Google/Chrome",
        "Library/Application Support/Chromium",
        "Library/Application Support/BraveSoftware",
        "Library/Application Support/Microsoft Edge",
        "Library/Application Support/Firefox",
        "Library/Safari",
        "Library/Cookies",
      ],
      win32: [
        "AppData/Local/Google/Chrome/User Data",
        "AppData/Local/Chromium/User Data",
        "AppData/Local/BraveSoftware",
        "AppData/Local/Microsoft/Edge/User Data",
        "AppData/Roaming/Mozilla",
      ],
    },
  },
  "password-stores": {
    everywhere: [".gnupg", ".password-store"],
    only: {
      linux: [".local/share/keyrings"],
      darwin: ["Library/Keychains"],
      win32: [
        "AppData/Roaming/Microsoft/Credentials",
        "AppData/Local/Microsoft/Credentials",
        "AppData/Roaming/Microsoft/Protect",
      ],
    },
  },
  "registry-tokens": {
    everywhere: [
      ".npmrc",
      ".yarnrc",
      ".yarnrc.yml",
      ".config/pnpm/rc",
      ".pypirc",
      ".cargo/credentials",
      ".cargo/credentials.toml",
      ".gem/credentials",
      ".composer/auth.json",
      ".m2/settings.xml",
      ".gradle/gradle.properties",
      ".terraform.d/credentials.tfrc.json",
      ".vault-token",
      ".config/op",
      ".config/doctl",
    ],
    only: {
      win32: [
        "AppData/Roaming/pnpm/config/rc",
        "AppData/Roaming/terraform.d/credentials.tfrc.json",
      ],
    },
  },
  "shell-history": {
    everywhere: [
      ".bash_history",
      ".zsh_history",
      ".zsh_sessions",
      ".local/share/fish/fish_history",
      ".python_history",
      ".node_repl_history",
      ".psql_history",
      ".mysql_history",
    ],
    only: { win32: ["AppData/Roaming/Microsoft/Windows/PowerShell/PSReadLine"] },
  },
  "agent-settings": { everywhere: [".claude", ".claude.json", ".codex"] },
};

/**
 * The denied paths of one group on `platform`, or on every system when it
 * is `undefined`.
 */
export function homePathsOf(paths: HomePaths, platform?: HomePlatform): readonly string[] {
  if (platform !== undefined) return [...paths.everywhere, ...(paths.only?.[platform] ?? [])];
  return [...paths.everywhere, ...Object.values(paths.only ?? {}).flat()];
}

/** Every denied home path on every system, each as its names as a system opens them. */
const everyDeniedPath: readonly (readonly string[])[] = Object.values(deniedHomePaths).flatMap(
  (paths) => homePathsOf(paths).map((path) => path.split("/").map(segmentAsOpened)),
);

/**
 * Whether a path, `/` separated and relative to any folder, is or lies in
 * a path the sandbox denies in a home folder, at any depth and for any
 * system's list: `.ssh/id_ed25519`, `keys/.aws/credentials` and
 * `x/.config/gcloud` are; `.config/app.json` isn't. Names are compared as
 * Windows and macOS would open them (see `segmentAsOpened`), so `.SSH` is
 * denied too. A folder copied from a home folder, on any system, then
 * holds none of them.
 *
 * @example
 * isDeniedHomePath("vendor/.ssh/id_ed25519"); // true
 * isDeniedHomePath(".config/gcloud"); // true
 * isDeniedHomePath(".config"); // false: only the way to a denied path
 */
export function isDeniedHomePath(path: string): boolean {
  const names = path.split("/").map(segmentAsOpened);
  return names.some((_, start) =>
    everyDeniedPath.some(
      (denied) =>
        start + denied.length <= names.length &&
        denied.every((name, index) => names[start + index] === name),
    ),
  );
}
