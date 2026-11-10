import type { HarnessDetection, ProgramProbe, ProgramProbeResult } from "@halonicjs/ports";
import { formatVersion, isAtLeast, type Version } from "@halonicjs/std";
import { saysSignedOut } from "./sign-in.ts";
import { readLeadingVersion } from "./version.ts";

/** The program's name, as the launcher finds it. */
export const claudeProgram = "claude";

/**
 * The oldest Claude Code Halonic supports: the stable release channel on
 * 9 Nov 2026 (2.1.311; latest was 2.1.321). Halonic is tested against these
 * releases only, and needs features of recent ones (`claude auth status`,
 * `CLAUDE_CODE_TMPDIR`), so the floor moves with what the adapter is tested
 * against.
 */
export const oldestSupportedVersion: Version = { major: 2, minor: 1, patch: 311, prerelease: [] };

/** The supported versions as Studio shows them. */
export const supportedVersions = `>=${formatVersion(oldestSupportedVersion)}`;

/**
 * Finds Claude Code on this machine, checks its version and whether someone
 * is signed in to it (requirement `harness-claude-code.detect`). Never
 * throws: every answer of the probe becomes a {@link HarnessDetection}.
 *
 * It asks `claude --version` first; only a supported version is asked
 * `claude auth status`, whose exit code says signed in or out.
 *
 * @example
 * const found = await detectClaudeCode(probe);
 * if (found.status === "signed-out") show(`Found Claude Code ${found.version} · not signed in`);
 */
export async function detectClaudeCode(probe: ProgramProbe): Promise<HarnessDetection> {
  const answer = await probe.ask(claudeProgram, ["--version"]);
  if (answer.status === "missing") return { status: "missing" };
  const found = readVersionAnswer(answer);
  if ("error" in found) return { status: "failed", error: found.error };

  const version = formatVersion(found.version);
  if (!isAtLeast(found.version, oldestSupportedVersion)) {
    return { status: "unsupported", version, supported: supportedVersions };
  }
  const signIn = await probe.ask(claudeProgram, ["auth", "status"]);
  return saysSignedOut(signIn) ? { status: "signed-out", version } : { status: "ready", version };
}

/**
 * The version in `claude --version`'s answer, or why there is none, in a
 * sentence a person can act on. The program's own output stays out of the
 * sentence: it isn't Halonic's to show.
 */
function readVersionAnswer(
  answer: Exclude<ProgramProbeResult, { status: "missing" }>,
): { version: Version } | { error: string } {
  if (answer.status === "failed") return { error: answer.error };
  if (answer.code === null) return { error: "`claude --version` was stopped before it answered." };
  if (answer.code !== 0) return { error: `\`claude --version\` ended with code ${answer.code}.` };
  const version = readLeadingVersion(answer.stdout);
  if (version === undefined) return { error: "`claude --version` didn't print a version." };
  return { version };
}
