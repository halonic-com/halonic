import { diskSettingsFolder, type SettingsFolderWriter } from "@halonicjs/adapter-harness-kit";
import type { Harness, ProgramProbe } from "@halonicjs/ports";
import { detectOpenCode } from "./detect.ts";
import { opencodeEnvironment } from "./environment.ts";
import { opencodeFiles } from "./files.ts";
import { OpenCodeRun } from "./run.ts";

/** What the OpenCode harness is made with. */
export interface OpenCodeHarnessOptions {
  /** Finds `opencode` on this computer and asks it for its version. */
  probe: ProgramProbe;
  /** Resets the agent's settings folder; this computer's disk when absent. */
  settings?: SettingsFolderWriter;
  /** The computer's platform, as Node's `process.platform` names it; this one's when absent. */
  platform?: string;
}

/**
 * OpenCode as a {@link Harness} (requirement `harness-opencode.harness`): an
 * agent whose file says `harness: opencode` runs in `opencode run`, inside
 * Halonic's sandbox and behind the run's bridge. It has no sign-in of its
 * own: the bridge holds the provider's key.
 *
 * @example
 * const opencode = opencodeHarness({ probe });
 * const run = opencode.start(task, session, bridge);
 * for await (const event of run) record(event);
 */
export function opencodeHarness(options: OpenCodeHarnessOptions): Harness {
  const settings = options.settings ?? diskSettingsFolder;
  const platform = options.platform ?? process.platform;
  return {
    id: "opencode",
    name: "OpenCode",
    detect: () => detectOpenCode(options.probe),
    environment: (bridge, folders, model) =>
      opencodeEnvironment(bridge, model ?? {}, opencodeFiles(folders)),
    start: (task, session, bridge) =>
      new OpenCodeRun(task, session, bridge, { settings, platform }),
  };
}
