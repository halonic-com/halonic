import type {
  PluginAgentsClient,
  PluginApiRequestInput,
  PluginApiResponse,
  PluginConfigClient,
  PluginIssuesClient,
  PluginLogger,
  PluginSecretsClient,
  PluginStateClient,
} from "@paperclipai/plugin-sdk";
import { type ApiFetch, paperclipSeatApi, type SeatApi } from "../seat-mover/api.ts";
import { parseConnections, parseSeatReadings } from "../seat-mover/readings.ts";
import {
  agentsOnSeat,
  findSeat,
  type MarkOutcome,
  markReset,
  recentResets,
  type SeatResets,
} from "../seat-mover/reset.ts";
import { readSeatMoverSettings } from "../seat-mover/settings.ts";
import { readTaskEffortSettings } from "../task-effort/settings.ts";
import { companyConfig } from "./job.ts";

/**
 * The board-only "seat was reset" route (HAL-19490):
 * `POST /seat-mover/seat-reset?companyId=…` with `{ "seat": "<name or connection id>" }`.
 * The board's seat-reset step calls it right after resetting a seat by hand.
 * It marks the reset on every agent on that seat through Paperclip's API with
 * the board key the seat mover uses (the server patch then ignores the seat's
 * older limit failures and releases the agents' parked runs), and keeps the
 * reset time for the seat mover. It works in every seat mover mode: it moves
 * nobody.
 */

/** Route key, as the manifest declares it. */
export const seatResetRouteKey = "seat-reset";

/** The part of the plugin context the route uses, so tests can fake it. */
export interface SeatResetRouteApi {
  readonly config: Pick<PluginConfigClient, "get">;
  readonly secrets: Pick<PluginSecretsClient, "resolve">;
  readonly agents: Pick<PluginAgentsClient, "list">;
  readonly issues: Pick<PluginIssuesClient, "get" | "createComment">;
  readonly state: Pick<PluginStateClient, "get" | "set">;
  readonly logger: Pick<PluginLogger, "info" | "error">;
}

const resetsKey = (companyId: string) =>
  ({
    scopeKind: "company",
    scopeId: companyId,
    namespace: "seat-mover",
    stateKey: "resets",
  }) as const;

/** The seat resets kept in plugin state, read by the route and the `seat-move` job. */
export function seatResetsState(state: Pick<PluginStateClient, "get" | "set">, companyId: string) {
  return {
    get: async (): Promise<SeatResets> =>
      ((await state.get(resetsKey(companyId))) ?? {}) as SeatResets,
    set: (resets: SeatResets) => state.set(resetsKey(companyId), resets),
  };
}

function refuse(status: number, message: string): PluginApiResponse {
  return { status, body: { error: message } };
}

function seatOf(body: unknown): string | undefined {
  const seat = (body as { seat?: unknown } | null)?.seat;
  return typeof seat === "string" && seat.trim() !== "" ? seat : undefined;
}

/** Answers `POST /seat-mover/seat-reset`. */
export async function handleSeatReset(
  input: PluginApiRequestInput,
  ctx: SeatResetRouteApi,
  fetch: ApiFetch,
  now: Date,
): Promise<PluginApiResponse> {
  const userId = input.actor.actorType === "user" ? input.actor.userId : undefined;
  if (typeof userId !== "string" || userId === "") {
    return refuse(403, "Only the board can report a seat reset.");
  }
  const seat = seatOf(input.body);
  if (seat === undefined) {
    return refuse(400, 'Send { "seat": "<seat name or connection id>" }.');
  }
  const companyId = input.companyId;
  const config = (await companyConfig(ctx.config as PluginConfigClient, companyId)) ?? {};
  const settings = readSeatMoverSettings(config);
  const { apiUrl, apiKey } = readTaskEffortSettings(config);
  if (apiUrl === undefined || apiKey === undefined) {
    return refuse(503, "Set the Paperclip API address and key in the Agent tools settings first.");
  }
  const api = paperclipSeatApi({
    fetch,
    apiUrl,
    companyId,
    readingsPlugin: settings.readingsPlugin ?? "",
    key: () => ctx.secrets.resolve(apiKey, { companyId }),
  });
  const connections = parseConnections(await api.connections());
  const readings =
    settings.readingsPlugin === undefined ? [] : parseSeatReadings(await api.seatReadings());
  const found = findSeat(seat, connections, readings);
  if (found === undefined) {
    return refuse(404, `No seat or AI connection named ${seat}.`);
  }
  const at = now.toISOString();
  const resets = seatResetsState(ctx.state, companyId);
  await resets.set({ ...recentResets(await resets.get(), now), [found.connectionId]: at });
  const agents = agentsOnSeat(await ctx.agents.list({ companyId, limit: 500 }), found.connectionId);
  const outcomes = await markAll(api, agents, found.connectionId, at, ctx.logger);
  const marked = outcomes.filter((entry) => entry.outcome.startsWith("marked"));
  const line = `Seat mover: the board reset the ${found.name} seat; marked ${
    marked.map((entry) => entry.name).join(", ") || "nobody"
  }.`;
  ctx.logger.info(line, { companyId, connectionId: found.connectionId });
  if (settings.logTask !== undefined) {
    await logComment(ctx, companyId, settings.logTask, line);
  }
  return {
    status: 200,
    body: { seat: found.name, connectionId: found.connectionId, at, agents: outcomes },
  };
}

interface AgentOutcome {
  readonly name: string;
  readonly outcome: MarkOutcome | "failed";
}

/** Marks each agent; one that fails is logged and reported, and the rest still go ahead. */
async function markAll(
  api: SeatApi,
  agents: readonly { readonly id: string; readonly name: string }[],
  connectionId: string,
  at: string,
  logger: Pick<PluginLogger, "error">,
): Promise<AgentOutcome[]> {
  const outcomes: AgentOutcome[] = [];
  for (const agent of agents) {
    try {
      outcomes.push({
        name: agent.name,
        outcome: await markReset(api, agent.id, connectionId, at),
      });
    } catch (error) {
      logger.error(`Seat mover: couldn't mark ${agent.name}: ${(error as Error).message}`);
      outcomes.push({ name: agent.name, outcome: "failed" });
    }
  }
  return outcomes;
}

async function logComment(ctx: SeatResetRouteApi, companyId: string, task: string, line: string) {
  const issue = await ctx.issues.get(task, companyId);
  if (issue === null) {
    ctx.logger.error(`Seat mover: no task ${task} to comment on.`, { companyId });
    return;
  }
  await ctx.issues.createComment(issue.id, line, companyId);
}
