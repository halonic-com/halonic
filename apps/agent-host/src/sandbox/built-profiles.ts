import { isDeepStrictEqual } from "node:util";
import { addHarnessEnvironment, type SandboxProfile } from "@halonicjs/ports";

/**
 * The sandbox profiles this host built, the only ones it opens a session
 * for. The fence is the host's to set: a caller over loopback names one of
 * these profiles, and may add the harness's own environment variables to it
 * (see `addHarnessEnvironment`), but changes nothing else.
 */
export interface BuiltProfiles {
  /**
   * Takes the profile this host built that `profile` was made from, so a
   * second session can't open with it.
   *
   * @returns false when this host built no such profile, or a session has already taken it
   */
  take(profile: SandboxProfile): boolean;
}

/** A host that builds no profile (it has no profile folder) opens no session. */
export const noBuiltProfiles: BuiltProfiles = { take: () => false };

/**
 * Whether `opened` is `built` with only a harness's variables added: every
 * field but `env` as built, and the built variables all there, unchanged.
 * A variable a harness adds may not share a name with a built one, whatever
 * its case, as `addHarnessEnvironment` requires.
 */
export function isBuiltProfile(built: SandboxProfile, opened: SandboxProfile): boolean {
  const { env: builtEnv, ...builtFence } = built;
  const { env: openedEnv, ...openedFence } = opened;
  // As data: the opened profile came as JSON, which drops a field left `undefined`.
  if (!isDeepStrictEqual(asData(builtFence), asData(openedFence))) return false;
  const added = Object.fromEntries(
    Object.entries(openedEnv).filter(([name]) => !Object.hasOwn(builtEnv, name)),
  );
  try {
    return isDeepStrictEqual(asData(addHarnessEnvironment(builtEnv, added)), asData(openedEnv));
  } catch {
    // A name that differs from a built one only in case.
    return false;
  }
}

/** The value as plain JSON data: no `undefined` fields, plain objects only. */
function asData(value: object): unknown {
  return JSON.parse(JSON.stringify(value));
}
