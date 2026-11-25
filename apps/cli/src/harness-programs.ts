// The harness programs Halonic can start on this computer, other than its
// own loop: `halonic doctor` shows what each `detect()` finds, and
// `halonic run --harness` checks the one it was given before a run starts.

import { claudeCodeSignIn, detectClaudeCode } from "@halonicjs/adapter-harness-claude-code";
import { codexSignIn, detectCodex } from "@halonicjs/adapter-harness-codex";
import { detectOpenCode } from "@halonicjs/adapter-harness-opencode";
import { createProgramProbe } from "@halonicjs/adapter-sandbox-host";
import type { Harness } from "@halonicjs/ports";

/** A harness program, as far as finding it on this computer and signing in an agent go. */
export type HarnessProgram = Pick<Harness, "id" | "name" | "detect" | "signIn">;

/** Claude Code, Codex and OpenCode, as `PATH` and their usual install folders find them. */
export function nodeHarnessPrograms(): HarnessProgram[] {
  const programs = createProgramProbe();
  return [
    {
      id: "claude-code",
      name: "Claude Code",
      detect: (options) => detectClaudeCode(programs, options),
      signIn: claudeCodeSignIn,
    },
    {
      id: "codex",
      name: "Codex",
      detect: (options) => detectCodex(programs, options),
      signIn: codexSignIn,
    },
    {
      // No sign-in: the bridge holds the provider's key.
      id: "opencode",
      name: "OpenCode",
      detect: () => detectOpenCode(programs),
    },
  ];
}
