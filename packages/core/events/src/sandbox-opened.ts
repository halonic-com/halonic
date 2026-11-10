import { shortenHome } from "./home-path.ts";

/**
 * How strong a sandbox's fence is, as the `Sandbox` port's `capabilities()`
 * gives it: `os` (the operating system confines the program), `vm` (a
 * micro-VM) or `remote` (another machine).
 */
export type SandboxStrength = "os" | "vm" | "remote";

/**
 * The codes of the groups of paths a sandbox denies: the person's SSH keys,
 * their cloud sign-ins, browser data, password stores, Halonic's own data and
 * other agents' settings (such as `~/.claude`). One list, so the profile
 * builder, the run log and the screens name the same groups. Screens word
 * each code through the message catalogue.
 */
export const deniedPathGroupCodes = [
  "ssh-keys",
  "cloud-sign-ins",
  "browser-data",
  "password-stores",
  "halonic-data",
  "agent-settings",
] as const;

/** A group of denied paths: one of {@link deniedPathGroupCodes}. */
export type DeniedPathGroupCode = (typeof deniedPathGroupCodes)[number];

/**
 * What a sandboxed step can do, as a `sandbox.opened` event records it. It is
 * a display copy of the step's sandbox profile, made by
 * {@link sandboxOpenedView}, so a finished run still shows it. It never holds
 * the profile's environment variables or any field not named here.
 */
export interface SandboxOpenedView {
  /** How strong the fence is. */
  strength: SandboxStrength;
  /**
   * The step's working folder. Paths in the person's home folder start with
   * `~`. Its own temp folder and settings folder are writable too, but the
   * screens never show their paths, so the view leaves them out.
   */
  workingFolder: string;
  /** Paths the step may read but not change. */
  readOnlyPaths: string[];
  /** The codes of the groups of denied paths, in the order the groups were given. */
  deniedGroups: DeniedPathGroupCode[];
  /** The denied paths that are in no group: the ones the person added. */
  deniedPaths: string[];
  /** The sites the step may reach besides the Halonic bridge. */
  allowedSites: string[];
  /** How long the step may last, in milliseconds. */
  timeLimitMs: number;
}

/**
 * The parts of a sandbox profile that {@link sandboxOpenedView} reads. The
 * `Sandbox` port's `SandboxProfile` fits it; its other fields, such as `env`,
 * are never read.
 */
export interface ShownSandboxProfile {
  workingFolder: string;
  readOnlyPaths: readonly string[];
  deniedPaths: readonly string[];
  network: { allowedSites: readonly string[] };
  timeLimitMs: number;
}

/** A named group of denied paths, such as the person's SSH keys. */
export interface DeniedPathGroup {
  /** Which group it is. Screens show it through the message catalogue. */
  code: DeniedPathGroupCode;
  /** The paths of the group, absolute, as they are in the profile. */
  paths: readonly string[];
}

/** What {@link sandboxOpenedView} needs besides the profile. */
export interface SandboxOpenedOptions {
  /** The sandbox's strength, from its `capabilities()`. */
  strength: SandboxStrength;
  /** The person's home folder, or `null` when it is unknown. Paths in it are shortened to `~`. */
  home: string | null;
  /** The groups the profile's denied paths were built from. */
  deniedGroups: readonly DeniedPathGroup[];
}

/**
 * Makes the display copy of a sandbox profile that a `sandbox.opened` event
 * carries (requirement `events.sandbox-opened`). It copies a fixed list of
 * fields and nothing else, so the profile's `env`, its temp and settings
 * folders and any field added later never reach the run log. A group is named when it has paths and all of them
 * are denied, so a group with no paths never claims something was blocked;
 * the denied paths outside the named groups are listed one by one. Paths in
 * the person's home folder start with `~`.
 *
 * @param profile - the step's sandbox profile
 * @param options - the sandbox's strength, the home folder and the groups of denied paths
 * @returns the view for the event
 *
 * @example
 * sandboxOpenedView(profile, {
 *   strength: "os",
 *   home: "<home>",
 *   deniedGroups: [{ code: "ssh-keys", paths: ["<home>/.ssh"] }],
 * });
 * // => { strength: "os", workingFolder: "~/work", deniedGroups: ["ssh-keys"], ... }
 */
export function sandboxOpenedView(
  profile: ShownSandboxProfile,
  options: SandboxOpenedOptions,
): SandboxOpenedView {
  const shorten = (path: string): string => shortenHome(path, options.home);
  const denied = new Set(profile.deniedPaths);
  const named = options.deniedGroups.filter(
    (group) => group.paths.length > 0 && group.paths.every((path) => denied.has(path)),
  );
  const inNamedGroup = new Set(named.flatMap((group) => group.paths));
  return {
    strength: options.strength,
    workingFolder: shorten(profile.workingFolder),
    readOnlyPaths: profile.readOnlyPaths.map(shorten),
    deniedGroups: named.map((group) => group.code),
    deniedPaths: [...denied].filter((path) => !inNamedGroup.has(path)).map(shorten),
    allowedSites: [...profile.network.allowedSites],
    timeLimitMs: profile.timeLimitMs,
  };
}
