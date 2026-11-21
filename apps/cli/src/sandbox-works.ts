// Whether this computer's sandbox works, for the trust check: a program's
// sites are shown only where a sandbox keeps the program to them, and a
// plugin's programs say whether they can run here.

import { SrtSandbox } from "@halonicjs/adapter-sandbox-srt";
import {
  type LocalToolState,
  localToolStateOf,
  type RunnerFence,
  runnerFence,
} from "@halonicjs/app";
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

/**
 * Whether a plugin's backend would run in the sandbox here, as its start's gate decides
 * (`cli.open-plugin-backend`): the same platform and srt check. The command holds no yes to run
 * without it (`cli.no-unfenced-run-yes`), so `not-fenced` means the backend doesn't start.
 *
 * @throws RangeError when `HALONIC_HOME` or the home folder isn't absolute
 */
export async function nodePluginCodeFence(): Promise<RunnerFence> {
  return runnerFence({ platform: process.platform, check: await nodeSandbox().check() });
}

/** The srt sandbox the CLI starts programs in, with its crash journals in the profile. */
function nodeSandbox(): SrtSandbox {
  const profile = profileFolder(nodeProfileEnvironment());
  return new SrtSandbox(undefined, undefined, privateJournalFolder(profile));
}
