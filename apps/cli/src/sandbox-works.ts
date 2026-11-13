// Whether this computer's sandbox works, for the trust check: a program's
// sites are shown only where a sandbox keeps the program to them.

import { SrtSandbox } from "@halonicjs/adapter-sandbox-srt";
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
  const profile = profileFolder(nodeProfileEnvironment());
  const check = await new SrtSandbox(undefined, undefined, privateJournalFolder(profile)).check();
  return check.ok;
}
