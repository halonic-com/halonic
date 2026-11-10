import type { HarnessDetection, ProgramProbe, ProgramProbeResult } from "@halonicjs/ports";
import { formatVersion, isAtLeast, readVersion, type Version } from "@halonicjs/std";
import { saysSignedOut } from "./sign-in.ts";

/** The program's name, as the launcher finds it. */
export const codexProgram = "codex";

/**
 * The oldest Codex Halonic supports: 0.166.0, the release checked by hand
 * on 10 Nov 2026 (latest was 0.167.0). Halonic is tested against these
 * releases only, so the floor moves with what the adapter is tested
 * against. A pre-release of a newer version, such as 0.167.0-alpha.6, is
 * newer than the floor; a pre-release of the floor itself is not.
 */
export const oldestSupportedVersion: Version = { major: 0, minor: 166, patch: 0, prerelease: [] };

/** The supported versions as Studio shows them. */
export const supportedVersions = `>=${formatVersion(oldestSupportedVersion)}`;

/** The word Codex prints before its version: `codex-cli 0.166.0`. */
const versionPrefix = "codex-cli";

/**
 * Finds Codex on this machine, checks its version and whether someone is
 * signed in to it (requirement `harness-codex.detect`). Never throws: every
 * answer of the probe becomes a {@link HarnessDetection}.
 *
 * It asks `codex --version` first; only a supported version is asked
 * `codex login status`, whose exit code and message say signed in or out.
 *
 * @example
 * const found = await detectCodex(probe);
 * if (found.status === "signed-out") show(`Found Codex ${found.version} · not signed in`);
 */
export async function detectCodex(probe: ProgramProbe): Promise<HarnessDetection> {
  const answer = await probe.ask(codexProgram, ["--version"]);
  if (answer.status === "missing") return { status: "missing" };
  const found = readVersionAnswer(answer);
  if ("error" in found) return { status: "failed", error: found.error };

  const version = formatVersion(found.version);
  if (!isAtLeast(found.version, oldestSupportedVersion)) {
    return { status: "unsupported", version, supported: supportedVersions };
  }
  const signIn = await probe.ask(codexProgram, ["login", "status"]);
  return saysSignedOut(signIn) ? { status: "signed-out", version } : { status: "ready", version };
}

/**
 * The version in `codex --version`'s answer, or why there is none, in a
 * sentence a person can act on. The program's own output stays out of the
 * sentence: it isn't Halonic's to show.
 */
function readVersionAnswer(
  answer: Exclude<ProgramProbeResult, { status: "missing" }>,
): { version: Version } | { error: string } {
  if (answer.status === "failed") return { error: answer.error };
  if (answer.code === null) return { error: "`codex --version` was stopped before it answered." };
  if (answer.code !== 0) return { error: `\`codex --version\` ended with code ${answer.code}.` };
  const version = readCodexVersion(answer.stdout);
  if (version === undefined) return { error: "`codex --version` didn't print a version." };
  return { version };
}

/**
 * Reads the version from the first line Codex prints, which is
 * `codex-cli` and the version, such as "codex-cli 0.169.0-alpha.6". Any
 * other first line gives `undefined`: Halonic doesn't guess which word is
 * the version.
 */
function readCodexVersion(output: string): Version | undefined {
  const firstLine = output.trim().split("\n", 1)[0] ?? "";
  const words = firstLine.trim().split(/\s+/);
  if (words.length !== 2 || words[0] !== versionPrefix) return undefined;
  return readVersion(words[1] ?? "");
}
