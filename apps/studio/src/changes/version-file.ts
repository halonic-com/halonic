import { KindedError } from "@halonicjs/std";

/** What git said, as the shell's `git` command gives it back. */
export interface VersionFileAnswer {
  readonly code: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

/** A version's full id, as History gives it: never an option or a name git could read otherwise. */
const VERSION_ID = /^[0-9a-f]{40,64}$/;

/**
 * A file as one version has it (`git show <id>:<path>`), for Restore just this; `null` where the
 * version has no such file. Git answers both "no such file in the version" and "no such version"
 * with an error, so a failed `show` asks whether the version is there before it says the file
 * isn't.
 *
 * @param run - runs `git <args>`; `"no-git"` when git isn't on this computer
 * @param reason - why a failed call failed, as one plain sentence
 * @throws when the id isn't a version's full id, the version isn't there, or git isn't
 */
export async function readFileAtVersion(
  run: (args: readonly string[]) => Promise<VersionFileAnswer | "no-git">,
  reason: (answer: VersionFileAnswer) => string,
  versionId: string,
  path: string,
): Promise<string | null> {
  if (!VERSION_ID.test(versionId)) {
    throw new KindedError("invalid_input", "This version can't be read: its id isn't a version's.");
  }
  const shown = await run(["show", `${versionId}:${path}`]);
  if (shown === "no-git") throw noGit();
  if (shown.code === 0) return shown.stdout;
  const version = await run(["rev-parse", "--verify", "--quiet", `${versionId}^{commit}`]);
  if (version === "no-git") throw noGit();
  if (version.code !== 0) throw new KindedError("not_found", reason(shown));
  return null;
}

function noGit(): KindedError {
  return new KindedError("unavailable", "git isn't on this computer.");
}
