import thisComputer from "node:path";
import {
  diskSettingsFolder,
  type OwnSandboxCheck,
  ownSandboxCheck,
  type SettingsFolderWriter,
} from "@halonicjs/adapter-harness-kit";
import type { Harness, ProgramProbe } from "@halonicjs/ports";
import { claudeCodeWebHarness } from "./web-harness.ts";

/** What the Claude Code harness is made with. */
export interface ClaudeCodeHarnessOptions {
  /** Finds `claude` on this computer and asks it for its version and sign-in. */
  probe: ProgramProbe;
  /** Writes the agent's settings folder; this computer's disk when absent. */
  settings?: SettingsFolderWriter;
  /** Whether Claude Code's own sandbox works here; checked on this computer with `probe` when absent. */
  ownSandbox?: OwnSandboxCheck;
}

/**
 * Claude Code as a {@link Harness}: an agent whose file says
 * `harness: claude-code` runs in Claude Code, inside Halonic's sandbox and
 * behind the run's bridge. Its files are named under this computer's own
 * path rules, `node:path` itself.
 *
 * @example
 * const claudeCode = claudeCodeHarness({ probe });
 * const run = claudeCode.start(task, session, bridge);
 * for await (const event of run) record(event);
 */
export function claudeCodeHarness(options: ClaudeCodeHarnessOptions): Harness {
  return claudeCodeWebHarness({
    probe: options.probe,
    settings: options.settings ?? diskSettingsFolder,
    // Claude Code's sandbox needs socat on Linux, for its network proxy.
    ownSandbox:
      options.ownSandbox ?? ownSandboxCheck({ probe: options.probe, linuxNeeds: ["socat"] }),
    paths: thisComputer,
  });
}
