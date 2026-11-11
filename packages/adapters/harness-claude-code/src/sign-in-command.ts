import type { HarnessSignIn } from "@halonicjs/ports";
import { claudeProgram } from "./detect.ts";

/**
 * Claude Code's own sign-in for one agent (requirement
 * `harness-claude-code.sign-in-command`): `claude auth login`, pointed at the
 * agent's settings folder through `CLAUDE_CONFIG_DIR`, the variable its runs
 * get. Claude Code keeps a separate sign-in for each config folder, in a
 * file there or in a keychain entry named after the folder, so each agent
 * signs in on its own.
 *
 * @example
 * // CLAUDE_CONFIG_DIR=<agent's settings folder> claude auth login
 * const { program, args, folderVariable } = claudeCodeSignIn;
 */
export const claudeCodeSignIn: HarnessSignIn = {
  program: claudeProgram,
  args: ["auth", "login"],
  folderVariable: "CLAUDE_CONFIG_DIR",
};
