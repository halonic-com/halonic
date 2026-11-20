import {
  checkPinnedLaunch,
  findRunner,
  type RunnerSearch,
  runnerRefusedError,
} from "@halonicjs/adapter-mcp";
import type { ConnectorFactoryContext, ConnectorPin } from "@halonicjs/ports";
import type { PinnedRunner, StdioConfig } from "./local-tool-launch.ts";

/** A program's pin and the runner found for it; both are absent for a program that isn't a pinned package. */
export interface PinnedStart {
  readonly pin: ConnectorPin | null;
  readonly runner?: PinnedRunner;
}

/**
 * Checks a connector's pin by the pin rules (`checkPinnedLaunch`) and finds
 * the runner for it on this computer. Call it before making any folder, so a
 * refused pin leaves nothing behind.
 *
 * @throws when the pin breaks a rule or no runner for it was found
 */
export async function pinnedStart(
  connectorId: string,
  stdio: StdioConfig,
  secretEnv: Readonly<Record<string, string>>,
  http: ConnectorFactoryContext["http"],
  runners: RunnerSearch,
): Promise<PinnedStart> {
  const checked = await checkPinnedLaunch(stdio, secretEnv, http);
  if (!checked.ok) {
    throw new Error(`Halonic didn't start the connector "${connectorId}": ${checked.error}.`);
  }
  if (checked.value === null) return { pin: null };
  const found = await findRunner(stdio.command, checked.value.registry, runners);
  if ("refused" in found) throw runnerRefusedError(connectorId, found);
  return { pin: checked.value, runner: { found: found.found, platform: runners.platform } };
}
