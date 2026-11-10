import {
  checkPackageRunnerLaunch,
  checkResolvedVersion,
  pinnedRunnerArgs,
  type StdioTransport,
} from "@halonicjs/app";
import type { ConnectorPin, HttpClient } from "@halonicjs/ports";
import { err, ok, type Result } from "@halonicjs/std";
import type { ProgramLaunch } from "../stdio/program.ts";
import { pinnedEnv } from "./pinned-env.ts";
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

/**
 * What a pinned connector starts, before its secrets: its runner with the
 * pin's version added to its arguments (`app.pinned-runner-args`), in
 * `folder` instead of its `cwd`, with the environment of {@link pinnedEnv}.
 */
export function pinnedLaunch(
  transport: StdioTransport,
  pin: ConnectorPin,
  inheritedEnv: Readonly<Record<string, string>>,
  folder: string,
): ProgramLaunch {
  return {
    program: transport.command,
    args: pinnedRunnerArgs(pin, transport.command, transport.args),
    env: pinnedEnv(pin, inheritedEnv, transport.env, folder),
    cwd: folder,
  };
}
