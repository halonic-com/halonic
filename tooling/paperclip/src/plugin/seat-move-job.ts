import type {
  PluginAgentsClient,
  PluginConfigClient,
  PluginDatabaseClient,
  PluginIssuesClient,
  PluginLogger,
  PluginSecretsClient,
  PluginStateClient,
} from "@paperclipai/plugin-sdk";
import { type ApiFetch, paperclipSeatApi } from "../seat-mover/api.ts";
import { type SeatMoverMemory, seatMoverPass } from "../seat-mover/pass.ts";
import { databaseSeatRuns } from "../seat-mover/runs.ts";
import { readSeatMoverSettings } from "../seat-mover/settings.ts";
import { readTaskEffortSettings } from "../task-effort/settings.ts";
import { companyConfig } from "./job.ts";

/**
 * The `seat-move` job's pass for one company (HAL-19354, src/seat-mover/):
 * the plugin context turned into the pass's needs. Paperclip's API goes
 * through Node's own fetch (a private host) with the board key in
 * `paperclipApiKey`, read at call time and never logged or kept.
 */

/** The part of the plugin context the job uses, so tests can fake it. */
export interface SeatMoveApi {
  readonly config: Pick<PluginConfigClient, "get">;
  readonly secrets: Pick<PluginSecretsClient, "resolve">;
  readonly agents: Pick<PluginAgentsClient, "list">;
  readonly issues: Pick<PluginIssuesClient, "get" | "createComment" | "requestWakeup">;
  readonly state: Pick<PluginStateClient, "get" | "set">;
  readonly db: Pick<PluginDatabaseClient, "query">;
  readonly logger: Pick<PluginLogger, "info" | "error">;
}

const memoryKey = (companyId: string) =>
  ({
    scopeKind: "company",
    scopeId: companyId,
    namespace: "seat-mover",
    stateKey: "memory",
  }) as const;

/** Runs one pass for a company; logs once and stops when the settings name no API or key. */
export async function seatMovePass(
  ctx: SeatMoveApi,
  fetch: ApiFetch,
  companyId: string,
  now: Date,
): Promise<void> {
  const config = (await companyConfig(ctx.config as PluginConfigClient, companyId)) ?? {};
  const settings = readSeatMoverSettings(config);
  if (settings.mode === "off") {
    return;
  }
  const { apiUrl, apiKey } = readTaskEffortSettings(config);
  if (apiUrl === undefined || apiKey === undefined || settings.readingsPlugin === undefined) {
    ctx.logger.info(
      "Seat mover: no Paperclip API address, key or seat readings plugin set, so it doesn't run.",
      { companyId },
    );
    return;
  }
  const api = paperclipSeatApi({
    fetch,
    apiUrl,
    companyId,
    readingsPlugin: settings.readingsPlugin,
    key: () => ctx.secrets.resolve(apiKey, { companyId }),
  });
  await seatMoverPass({
    companyId,
    now,
    settings,
    api,
    runs: databaseSeatRuns(ctx.db),
    agents: () => ctx.agents.list({ companyId, limit: 500 }),
    issueStatus: async (issueId) => (await ctx.issues.get(issueId, companyId))?.status,
    wake: async (issueId, idempotencyKey) => {
      await ctx.issues.requestWakeup(issueId, companyId, {
        reason: "seat_mover_release",
        idempotencyKey,
      });
    },
    comment: async (task, body) => {
      const issue = await ctx.issues.get(task, companyId);
      if (issue === null) {
        ctx.logger.error(`Seat mover: no task ${task} to comment on.`, { companyId });
        return;
      }
      await ctx.issues.createComment(issue.id, body, companyId);
    },
    memory: {
      get: async () => ((await ctx.state.get(memoryKey(companyId))) ?? {}) as SeatMoverMemory,
      set: (memory) => ctx.state.set(memoryKey(companyId), memory),
    },
    log: (line, meta) => ctx.logger.info(line, { companyId, ...meta }),
    logError: (line, meta) => ctx.logger.error(line, { companyId, ...meta }),
  });
}
