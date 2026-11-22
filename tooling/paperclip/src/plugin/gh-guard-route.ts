import type {
  PluginAgentsClient,
  PluginApiRequestInput,
  PluginApiResponse,
  PluginConfigClient,
} from "@paperclipai/plugin-sdk";
import { type GuardedCommand, guardedCommands } from "../gh-guard/match.ts";
import { type MetricsApi, writeMetrics } from "./metrics.ts";

/**
 * The `gh-guard` route (HAL-16401): the `gh` wrapper on the runner asks it
 * about each status read on `halonic` it sees. The route counts the read as
 * `tools.gh_redirected` and says whether to answer it with the tool call
 * (the setting `redirectGhStatusCalls`). It is off by default: the wrapper
 * then lets `gh` run, and the count shows how often the guard would fire.
 */

/** The part of the plugin context the route uses, so tests can fake it. */
export interface GhGuardApi extends MetricsApi {
  readonly agents: Pick<PluginAgentsClient, "get">;
  readonly config: PluginConfigClient;
}

/** The guard's settings, read from the company's plugin settings. */
export interface GhGuardSettings {
  readonly redirect: boolean;
  /** Agents (by url key) whose status reads always pass, such as one that runs the merge queue. */
  readonly exempt: readonly string[];
}

export function readGhGuardSettings(config: Readonly<Record<string, unknown>>): GhGuardSettings {
  const exempt = config["ghGuardExemptAgents"];
  return {
    redirect: config["redirectGhStatusCalls"] === true,
    exempt: Array.isArray(exempt)
      ? exempt.filter((key): key is string => typeof key === "string")
      : [],
  };
}

/** What the guard did with one read; the metric's `mode` tag. */
type GuardMode = "redirected" | "dry-run" | "exempt";

/** Answers the wrapper. Only an agent's run may ask, for one of the guarded commands. */
export async function handleGhGuard(
  input: PluginApiRequestInput,
  ctx: GhGuardApi,
): Promise<PluginApiResponse> {
  const agentId = input.actor.actorType === "agent" ? input.actor.agentId : undefined;
  if (typeof agentId !== "string" || agentId === "") {
    return refuse(403, "Only an agent's run asks the gh guard.");
  }
  const subcommand = (input.body as { subcommand?: unknown } | null)?.subcommand;
  if (!guardedCommands.includes(subcommand as GuardedCommand)) {
    return refuse(400, `subcommand must be one of: ${guardedCommands.join(", ")}.`);
  }
  const settings = readGhGuardSettings(await ctx.config.get(input.companyId));
  const agent = await ctx.agents.get(agentId, input.companyId);
  // The url key is the agent's name in branches; an unknown agent is still counted.
  const agentKey = agent?.urlKey ?? "unknown";
  const mode = guardMode(settings, agentKey);
  await writeMetrics(
    ctx,
    { "tools.gh_redirected": 1 },
    { companyId: input.companyId, subcommand: subcommand as string, agent: agentKey, mode },
  );
  return { status: 200, body: { redirect: mode === "redirected" } };
}

function guardMode(settings: GhGuardSettings, agentKey: string): GuardMode {
  if (settings.exempt.includes(agentKey)) return "exempt";
  return settings.redirect ? "redirected" : "dry-run";
}

function refuse(status: number, message: string): PluginApiResponse {
  return { status, body: { error: message } };
}
