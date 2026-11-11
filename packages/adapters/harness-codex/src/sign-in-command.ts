import type { HarnessSignIn } from "@halonicjs/ports";
import { codexFolderVariable, codexProgram } from "./detect.ts";

/**
 * Codex's own sign-in for one agent (requirement
 * `harness-codex.sign-in-command`): `codex login`, pointed at the agent's
 * settings folder through `CODEX_HOME`, the variable its runs get. Codex
 * keeps its sign-in there (`auth.json` by default), so each agent signs in
 * on its own.
 *
 * @example
 * // CODEX_HOME=<agent's settings folder> codex login
 * const { program, args, folderVariable } = codexSignIn;
 */
export const codexSignIn: HarnessSignIn = {
  program: codexProgram,
  args: ["login"],
  folderVariable: codexFolderVariable,
};
