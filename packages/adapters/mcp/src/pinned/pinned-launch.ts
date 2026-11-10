import {
  checkPackageRunnerLaunch,
  checkResolvedVersion,
  pinnedRunnerArgs,
  type StdioTransport,
} from "@halonicjs/app";
import type { ConnectorPin, HttpClient } from "@halonicjs/ports";
import { err, ok, type Result } from "@halonicjs/std";
import type { ProgramLaunch } from "../stdio/program.ts";
import type { FoundRunner } from "./find-runner.ts";
import { pinnedEnv, withFoldersFirst } from "./pinned-env.ts";
import { lookUpPinnedPackage } from "./registry-lookup.ts";

/**
 * Checks a stdio connector before anything starts, in this order: the
 * launch itself with `checkPackageRunnerLaunch`, then, for a pin, the
 * version at the pin's registry, asked only at `registryUrl`, against the
 * pin with `checkResolvedVersion`. A variable `secretEnv` sets counts as
 * set by the connector's `env`: only its name is checked, no secret is read.
 *
 * @returns the pin to start, `null` for a program without one, or the reason to refuse
 */
export async function checkPinnedLaunch(
  transport: StdioTransport,
  secretEnv: Readonly<Record<string, string>>,
  http: HttpClient,
): Promise<Result<ConnectorPin | null, string>> {
  const secretNames = Object.fromEntries(Object.keys(secretEnv).map((name) => [name, ""]));
  const launch = checkPackageRunnerLaunch({
    ...transport,
    env: { ...transport.env, ...secretNames },
  });
  if (!launch.ok || launch.value === null) return launch;
  const pin = launch.value;
  const listed = await lookUpPinnedPackage(pin, http);
  if (!listed.ok) return listed;
  const same = checkResolvedVersion(pin, listed.value);
  return same.ok ? ok(pin) : err(same.error);
}

/** Where a pinned launch starts and the runner it starts, as the runner lookup found it. */
export interface PinnedPlace {
  /** The new empty launch folder, which the program starts in instead of its `cwd`. */
  readonly folder: string;
  readonly runner: FoundRunner;
  /** The platform the runner was found on, for how its `PATH` is written. */
  readonly platform: NodeJS.Platform;
}

/**
 * What a pinned connector starts, before its secrets: the runner found on
 * this computer (`mcp.runner-lookup`), with the pin's version added to the
 * runner's arguments (`app.pinned-runner-args`), in the launch folder,
 * with the environment of {@link pinnedEnv} and the runner's folders first
 * on its `PATH`.
 */
export function pinnedLaunch(
  transport: StdioTransport,
  pin: ConnectorPin,
  inheritedEnv: Readonly<Record<string, string>>,
  place: PinnedPlace,
): ProgramLaunch {
  const { folder, runner, platform } = place;
  const env = pinnedEnv(pin, inheritedEnv, transport.env, folder, platform);
  return {
    program: runner.program,
    args: [...runner.leadingArgs, ...pinnedRunnerArgs(pin, transport.command, transport.args)],
    env: withFoldersFirst(env, runner.pathFolders, platform),
    cwd: folder,
  };
}
