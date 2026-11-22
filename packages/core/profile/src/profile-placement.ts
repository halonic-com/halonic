// Where the profile folder may be, seen from a workspace (HAL-15201). A
// profile inside a workspace that git tracks comes and goes with a pull, and
// with it the trust records and the yes to run without the sandbox. So a
// profile the person or their setup moved there is refused. The built-in
// default stays allowed: it lands in a workspace only when the home folder
// is the workspace, and the file fence keeps it out of reach there (HAL-7039).

import { segmentAsOpened } from "@halonicjs/ports";
import { isAbsolutePath, type ProfilePlatform } from "./native-path.ts";
import { type ProfileEnvironment, type ProfileFolder, profileFolder } from "./profile-folder.ts";

/** The setting that put the profile where it is, when it isn't the built-in default. */
export type ProfileMover = "HALONIC_HOME" | "XDG_DATA_HOME" | "LOCALAPPDATA";

/**
 * The profile folder as it would be with no variables set: the home folder
 * and the platform's own data folder. Only a profile somewhere else can be
 * refused for its place.
 *
 * @example
 * builtInProfileFolder({ platform: "linux", homeFolder: "/srv/ann", variables: { HALONIC_HOME: "/srv/x" } });
 * // { platform: "linux", root: "/srv/ann/.local/share/halonic" }
 */
export function builtInProfileFolder(environment: ProfileEnvironment): ProfileFolder {
  return profileFolder({ ...environment, variables: {} });
}

/**
 * The variable {@link profileFolder} took the profile's place from, so a
 * refusal names the one to change: `HALONIC_HOME` when it is set, else
 * `LOCALAPPDATA` on Windows or `XDG_DATA_HOME` on Linux when it is set and
 * absolute; `null` when the profile is in its built-in place.
 *
 * @example
 * profileMover({ platform: "linux", homeFolder: "/srv/ann", variables: { XDG_DATA_HOME: "/srv/ann/repo/.data" } });
 * // "XDG_DATA_HOME"
 */
export function profileMover(environment: ProfileEnvironment): ProfileMover | null {
  const { platform, variables } = environment;
  const isSet = (name: string) => {
    const value = variables[name];
    return value !== undefined && value !== "" && isAbsolutePath(platform, value);
  };
  if ((variables["HALONIC_HOME"] ?? "") !== "") return "HALONIC_HOME";
  if (platform === "windows" && isSet("LOCALAPPDATA")) return "LOCALAPPDATA";
  if (platform === "linux" && isSet("XDG_DATA_HOME")) return "XDG_DATA_HOME";
  return null;
}

/** Why a workspace can't be opened with this profile. */
export type ProfileRefusal =
  /** The profile is the workspace or inside it, and a setting put it there. */
  | { readonly code: "profile-in-workspace"; readonly movedBy: ProfileMover }
  /** The workspace is the profile or inside it, wherever the profile is. */
  | { readonly code: "workspace-in-profile" };

/** The real paths {@link profileRefusal} compares, worked out by the adapter. */
export interface ProfilePlaces {
  readonly platform: ProfilePlatform;
  /** The workspace's root. */
  readonly workspace: string;
  /** The profile folder, as far as it exists. */
  readonly profile: string;
  /** The built-in profile folder, from {@link builtInProfileFolder}, as far as it exists. */
  readonly builtIn: string;
  /** What put the profile where it is, from {@link profileMover}. */
  readonly movedBy: ProfileMover | null;
}

/**
 * Whether a workspace may be opened with this profile (HAL-15201): a
 * workspace inside the profile never; a profile inside the workspace only
 * when it is the built-in default. Names are compared as a file system that
 * folds case might open them, as the shell's `Fence` compares them.
 *
 * @returns the refusal, or `null` when the two are apart or the profile is the built-in one
 *
 * @example
 * profileRefusal({ platform: "linux", workspace: "/srv/acme", profile: "/srv/acme/.profile",
 *   builtIn: "/srv/ann/.local/share/halonic", movedBy: "HALONIC_HOME" });
 * // { code: "profile-in-workspace", movedBy: "HALONIC_HOME" }
 */
export function profileRefusal(places: ProfilePlaces): ProfileRefusal | null {
  const workspace = partsOf(places.platform, places.workspace);
  const profile = partsOf(places.platform, places.profile);
  const builtIn = partsOf(places.platform, places.builtIn);
  const { movedBy } = places;
  if (movedBy !== null && !sameParts(profile, builtIn) && startsWith(profile, workspace)) {
    return { code: "profile-in-workspace", movedBy };
  }
  if (startsWith(workspace, profile)) {
    return { code: "workspace-in-profile" };
  }
  return null;
}

/** A path's names, without the separators, as `segmentAsOpened` gives them. */
function partsOf(platform: ProfilePlatform, path: string): string[] {
  const separators = platform === "windows" ? /[\\/]+/u : /\/+/u;
  return path
    .split(separators)
    .filter((name) => name !== "")
    .map(segmentAsOpened);
}

function startsWith(parts: readonly string[], prefix: readonly string[]): boolean {
  return prefix.length <= parts.length && prefix.every((part, index) => parts[index] === part);
}

function sameParts(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && startsWith(a, b);
}
