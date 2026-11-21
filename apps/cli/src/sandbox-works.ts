// Whether this computer's sandbox works, for the trust check: a program's
// sites are shown only where a sandbox keeps the program to them, and a
// plugin's programs say whether they can run here.

import { SrtSandbox } from "@halonicjs/adapter-sandbox-srt";
import { type LocalToolState, localToolStateOf } from "@halonicjs/app";
import { profileFolder } from "@halonicjs/profile";
import { privateJournalFolder } from "./sandbox-journals.ts";
import { nodeProfileEnvironment } from "./workspace-runs.ts";

/**
 * Asks this computer's sandbox whether it works. The answer is the same
 * one a connector's start gets (`Sandbox.check`), so the prompt and the start agree.
 *
 * @throws RangeError when `HALONIC_HOME` or the home folder isn't absolute
 */
export async function nodeSandboxWorks(): Promise<boolean> {
  const check = await nodeSandbox().check();
  return check.ok;
}

/**
 * Whether a plugin's programs can run on this computer, as
 * `PluginLocalTools.state()` says for the sandbox a run starts them in.
 *
 * @throws RangeError when `HALONIC_HOME` or the home folder isn't absolute
 */
export function nodeLocalToolState(): Promise<LocalToolState> {
  return localToolStateOf(nodeSandbox());
}

/** The srt sandbox the CLI starts programs in, with its crash journals in the profile. */
function nodeSandbox(): SrtSandbox {
  const profile = profileFolder(nodeProfileEnvironment());
  return new SrtSandbox(undefined, undefined, privateJournalFolder(profile));
}
