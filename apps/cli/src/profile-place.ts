// Whether a workspace may be opened with this computer's profile folder
// (HAL-15201). A profile a variable moved into the workspace is refused: git
// could carry trust records and the yes to run without the sandbox into it.
// So is a workspace inside the profile, where file writes would land in the
// profile. The built-in profile in a home folder workspace stays allowed;
// the workspace's files fence it off (HAL-7039).

import { resolveRealPath } from "@halonicjs/adapter-fs-node";
import type { ProfileProblem } from "@halonicjs/app";
import {
  builtInProfileFolder,
  type ProfileEnvironment,
  type ProfileRefusal,
  profileFolder,
  profileMover,
  profileRefusal,
  withHomeAsTilde,
} from "@halonicjs/profile";
import { KindedError } from "@halonicjs/std";
import { plainText } from "./messages/phrase.ts";
import { workspaceMessages } from "./messages/workspace.ts";
import { nodeProfileEnvironment } from "./workspace-runs.ts";

/**
 * Refuses a workspace whose folder holds a moved profile, or that is inside
 * the profile. A relative `HALONIC_HOME` or home folder finds no profile to
 * compare with; the commands that use the profile refuse it themselves.
 *
 * @param root - the workspace folder, which may not exist yet
 * @param environment - where the profile is; this process's by default
 * @throws ProfilePlaceError when the two overlap as described
 */
export async function checkProfilePlace(
  root: string,
  environment: ProfileEnvironment = nodeProfileEnvironment(),
): Promise<void> {
  const found = await profileOverlap(root, environment);
  if (found !== null) throw new ProfilePlaceError(found.refusal, found.shownProfile);
}

/**
 * How the workspace in `root` and the profile overlap, for `doctor`'s
 * Profile line, which says what every other command refuses with; `null`
 * when they don't, or when no profile can be found.
 *
 * @param root - the workspace folder
 * @param environment - where the profile is; this process's by default
 */
export async function profileProblem(
  root: string,
  environment: ProfileEnvironment = nodeProfileEnvironment(),
): Promise<ProfileProblem | null> {
  const found = await profileOverlap(root, environment);
  if (found === null) return null;
  return found.refusal.code === "profile-in-workspace"
    ? {
        problem: "profile-in-workspace",
        movedBy: found.refusal.movedBy,
        profile: found.shownProfile,
      }
    : { problem: "workspace-in-profile", profile: found.shownProfile };
}

/** The overlap, with the profile as the person would read it, or `null`. */
async function profileOverlap(
  root: string,
  environment: ProfileEnvironment,
): Promise<{ refusal: ProfileRefusal; shownProfile: string } | null> {
  let profile: string;
  try {
    profile = profileFolder(environment).root;
  } catch (error) {
    if (error instanceof RangeError) return null;
    throw error;
  }
  const workspace = await realAsFarAsItExists(root);
  const real = await realAsFarAsItExists(profile);
  const builtIn = await realAsFarAsItExists(builtInProfileFolder(environment).root);
  const refusal = profileRefusal({
    platform: environment.platform,
    workspace,
    profile: real,
    builtIn,
    movedBy: profileMover(environment),
  });
  if (refusal === null) return null;
  return {
    refusal,
    shownProfile: withHomeAsTilde(environment.platform, environment.homeFolder, profile),
  };
}

/**
 * The workspace and the profile overlap: `invalid_input`, so exit 2. Its
 * code says which way round.
 */
export class ProfilePlaceError extends KindedError {
  /** The detailed code on line 3 and in `--json`. */
  readonly code: ProfileRefusal["code"];

  /**
   * @param refusal - which way round they overlap, and what moved the profile
   * @param shownProfile - the profile folder as the person would read it
   */
  constructor(refusal: ProfileRefusal, shownProfile: string) {
    const [reason, fix] =
      refusal.code === "profile-in-workspace"
        ? [
            workspaceMessages.profileInWorkspace(shownProfile),
            workspaceMessages.profileInWorkspaceFix(refusal.movedBy),
          ]
        : [
            workspaceMessages.workspaceInProfile(shownProfile),
            workspaceMessages.workspaceInProfileFix(),
          ];
    super("invalid_input", plainText(reason.phrase), { fix: plainText(fix.phrase) });
    this.code = refusal.code;
  }
}

/** The real path as far as it exists, so a profile not made yet, or one through a link, still compares. */
async function realAsFarAsItExists(path: string): Promise<string> {
  return (await resolveRealPath(path))?.real ?? path;
}
