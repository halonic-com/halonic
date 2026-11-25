import type { HarnessDetection, ProgramProbe, ProgramProbeResult } from "@halonicjs/ports";
import { formatVersion, readVersion } from "@halonicjs/std";

/** The program's name, as the launcher finds it. */
export const opencodeProgram = "opencode";

/**
 * The OpenCode versions Halonic runs: exactly these, not a floor
 * (docs/adr/2026-11-24-opencode-harness-program.md). Each one passed the
 * egress test, the marker test and the tool-list test; adding one is its own
 * security pull request with the version-bump checklist.
 */
export const testedVersions: readonly string[] = ["2.3.0"];

/** The supported versions as Studio shows them: the one to install. */
export const supportedVersions = testedVersions.join(", ");

/** The word OpenCode prints before its version: `opencode v2.3.0`. */
const versionPrefix = "opencode";

/**
 * Finds OpenCode on this machine and checks that its version is one Halonic
 * tested (requirement `harness-opencode.detect`). Never throws: every answer
 * of the probe becomes a {@link HarnessDetection}.
 *
 * OpenCode has no sign-in in Halonic: its model calls go through the bridge,
 * with a key Halonic keeps. So a tested version is `ready`.
 *
 * @example
 * const found = await detectOpenCode(probe);
 * if (found.status === "unsupported") show(`Install OpenCode ${found.supported}`);
 */
export async function detectOpenCode(probe: ProgramProbe): Promise<HarnessDetection> {
  const answer = await probe.ask(opencodeProgram, ["--version"]);
  if (answer.status === "missing") return { status: "missing" };
  const found = readVersionAnswer(answer);
  if ("error" in found) return { status: "failed", error: found.error };
  if (!testedVersions.includes(found.version)) {
    return { status: "unsupported", version: found.version, supported: supportedVersions };
  }
  return { status: "ready", version: found.version };
}

/**
 * The version in `opencode --version`'s answer, or why there is none, in a
 * sentence a person can act on. The program's own output stays out of it.
 */
function readVersionAnswer(
  answer: Exclude<ProgramProbeResult, { status: "missing" }>,
): { version: string } | { error: string } {
  if (answer.status === "failed") return { error: answer.error };
  if (answer.code === null)
    return { error: "`opencode --version` was stopped before it answered." };
  if (answer.code !== 0) return { error: `\`opencode --version\` ended with code ${answer.code}.` };
  const version = readOpenCodeVersion(answer.stdout);
  if (version === undefined) return { error: "`opencode --version` didn't print a version." };
  return { version };
}

/**
 * Reads the version from the first line OpenCode prints, which is `opencode`
 * and the version after a `v`, such as "opencode v2.3.0". Any other first
 * line gives `undefined`: Halonic doesn't guess which word is the version.
 */
function readOpenCodeVersion(output: string): string | undefined {
  const firstLine = output.trim().split("\n", 1)[0] ?? "";
  const words = firstLine.trim().split(/\s+/);
  if (words.length !== 2 || words[0] !== versionPrefix || !words[1]?.startsWith("v")) {
    return undefined;
  }
  const version = readVersion(words[1].slice(1));
  return version === undefined ? undefined : formatVersion(version);
}
