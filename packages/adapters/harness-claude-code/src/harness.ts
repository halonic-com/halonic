import type { Harness, ProgramProbe } from "@halonicjs/ports";
import { detectClaudeCode } from "./detect.ts";
import { claudeCodeEnvironment } from "./environment.ts";
import { ClaudeCodeRun } from "./run.ts";
import { diskSettingsFolder, type SettingsFolderWriter } from "./settings.ts";

/** What the Claude Code harness is made with. */
export interface ClaudeCodeHarnessOptions {
  /** Finds `claude` on this computer and asks it for its version and sign-in. */
  probe: ProgramProbe;
  /** Writes the agent's settings folder; this computer's disk when absent. */
  settings?: SettingsFolderWriter;
}

/**
 * Claude Code as a {@link Harness}: an agent whose file says
 * `harness: claude-code` runs in Claude Code, inside Halonic's sandbox and
 * behind the run's bridge.
 *
 * @example
 * const claudeCode = claudeCodeHarness({ probe });
 * const run = claudeCode.start(task, session, bridge);
 * for await (const event of run) record(event);
 */
export function claudeCodeHarness(options: ClaudeCodeHarnessOptions): Harness {
  const settings = options.settings ?? diskSettingsFolder;
  return {
    id: "claude-code",
    name: "Claude Code",
    detect: () => detectClaudeCode(options.probe),
    environment: claudeCodeEnvironment,
    start: (task, session, bridge) => new ClaudeCodeRun(task, session, bridge, { settings }),
  };
}
