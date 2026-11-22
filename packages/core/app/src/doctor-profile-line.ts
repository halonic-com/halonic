// The Profile line of `halonic doctor`, without the words: whether the
// workspace and this computer's profile folder overlap (HAL-15201). Every
// other command refuses such a workspace; `doctor` says so on a line instead,
// so the person learns it from the command meant for that.

import type { DoctorLine } from "./doctor-checks.ts";

/**
 * How the workspace and the profile folder overlap, as the host found it:
 *
 * - `profile-in-workspace`: a variable put the profile in the workspace;
 *   `movedBy` is that variable, such as `HALONIC_HOME` or `XDG_DATA_HOME`.
 * - `workspace-in-profile`: the workspace is inside the profile.
 *
 * Both carry `profile`, the profile's path as the person reads it, such as
 * `~/.local/share/halonic`.
 */
export type ProfileProblem =
  | { problem: "profile-in-workspace"; movedBy: string; profile: string }
  | { problem: "workspace-in-profile"; profile: string };

/** The Profile line: shown only when the host found a {@link ProfileProblem}. */
export type ProfileLine = DoctorLine & {
  check: "profile";
  /** Failed: every other command refuses this workspace until it moves. */
  status: "failed";
} & ProfileProblem;

/**
 * The Profile line of `halonic doctor` (requirement `app.doctor-profile`):
 * failed with the overlap the host found, or no line without one.
 *
 * @example
 * profileLine({ problem: "profile-in-workspace", movedBy: "HALONIC_HOME", profile: "~/acme/.profile" });
 * // { check: "profile", status: "failed", problem: "profile-in-workspace", movedBy: "HALONIC_HOME", profile: "~/acme/.profile" }
 * profileLine(null); // undefined
 */
export function profileLine(problem: ProfileProblem | null): ProfileLine | undefined {
  if (problem === null) return undefined;
  return { check: "profile", status: "failed", ...problem };
}
