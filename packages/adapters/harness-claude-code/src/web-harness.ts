import type {
  HostPaths,
  OwnSandboxCheck,
  SettingsFolderWriter,
} from "@halonicjs/adapter-harness-kit/web";
import type { Harness, ProgramProbe } from "@halonicjs/ports";
import { detectClaudeCode } from "./detect.ts";
import { claudeCodeEnvironment } from "./environment.ts";
import { ClaudeCodeRun } from "./run.ts";
import { claudeCodeSignIn } from "./sign-in-command.ts";

/**
 * What the Claude Code harness is made with where there is no Node, such as
 * the Cloudflare Worker. Every part is given: nothing falls back to this
 * computer's disk or path rules.
 */
export interface ClaudeCodeWebHarnessOptions {
  /** Finds `claude` where it runs and asks it for its version and sign-in. */
  probe: ProgramProbe;
  /** Writes the agent's settings folder where Claude Code runs. */
  settings: SettingsFolderWriter;
  /** Whether Claude Code's own sandbox works where it runs. */
  ownSandbox: OwnSandboxCheck;
  /** The path rules of the machine Claude Code runs on. */
  paths: HostPaths;
}

/**
 * Claude Code as a {@link Harness}, with every part given. The desktop's
 * `claudeCodeHarness` builds this on this computer's disk and `node:path`.
 *
 * @example
 * const claudeCode = claudeCodeWebHarness({ probe, settings, ownSandbox, paths: posixPath });
 */
export function claudeCodeWebHarness(options: ClaudeCodeWebHarnessOptions): Harness {
  const { probe, settings, ownSandbox, paths } = options;
  return {
    id: "claude-code",
    name: "Claude Code",
    detect: (detectOptions) => detectClaudeCode(probe, detectOptions),
    environment: claudeCodeEnvironment,
    start: (task, session, bridge) =>
      new ClaudeCodeRun(task, session, bridge, { settings, ownSandbox, paths }),
    signIn: claudeCodeSignIn,
  };
}
