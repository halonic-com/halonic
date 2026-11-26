import type {
  PluginAgentsClient,
  PluginDataClient,
  PluginIssuesClient,
  PluginLogger,
} from "@paperclipai/plugin-sdk";
import { prStatus } from "../pr-tools/pr-status.ts";
import { ciOk } from "../pr-watcher/github.ts";
import { loadSnapshot } from "../snapshot/store.ts";
import { type PacketAnswer, type PacketDeps, statePacket } from "../state-packet/build.ts";
import { freshLines } from "../state-packet/fresh-store.ts";
import { newestComments, type PacketComment } from "../state-packet/packet.ts";
import { type MetricsApi, writeMetrics } from "./metrics.ts";
import { companyGitHub, type ToolsApi } from "./tools.ts";

/**
 * The state packet's data key (HAL-17402). The server's patch asks it just
 * before an `issue_monitor_due` run starts, with the company, the task and
 * the wake reason, and adds a packet it gets to the run's prompt. With the
 * `statePacket` setting off (the default) the answer is always no packet.
 * Paperclip also answers a data key for the board's own users; it only
 * reads, so that is harmless. Nothing here is an agent tool.
 */

/** The data key the server's patch asks. */
export const statePacketDataKey = "state-packet";

/** The part of the plugin context the packet reads. */
export interface StatePacketApi
  extends MetricsApi,
    Pick<ToolsApi, "config" | "secrets" | "http" | "state"> {
  readonly data: Pick<PluginDataClient, "register">;
  readonly issues: Pick<PluginIssuesClient, "get" | "listComments">;
  readonly agents: Pick<PluginAgentsClient, "get">;
  readonly logger: Pick<PluginLogger, "info">;
}

/** The task's newest comments with their authors' names: an agent's name, or `a person`. */
async function namedComments(
  ctx: StatePacketApi,
  issueId: string,
  companyId: string,
): Promise<PacketComment[]> {
  const all = await ctx.issues.listComments(issueId, companyId);
  const newest = [...all]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, newestComments);
  return await Promise.all(
    newest.map(async (comment) => {
      const agent =
        comment.authorAgentId === null
          ? null
          : await ctx.agents.get(comment.authorAgentId, companyId);
      const author = comment.authorAgentId === null ? "a person" : (agent?.name ?? "an agent");
      return { author, createdAt: new Date(comment.createdAt).toISOString(), body: comment.body };
    }),
  );
}

/** The packet's reads on top of the plugin context. */
export function statePacketDeps(ctx: StatePacketApi): PacketDeps {
  return {
    enabled: async (companyId) => (await ctx.config.get(companyId))["statePacket"] === true,
    taskIdentifier: async (issueId, companyId) =>
      (await ctx.issues.get(issueId, companyId))?.identifier ?? undefined,
    snapshot: (companyId) => loadSnapshot(ctx, companyId),
    fresh: freshLines(ctx),
    github: async (companyId) => {
      const { get } = await companyGitHub(ctx, companyId);
      return {
        status: (repo, number) => prStatus(get, repo, number),
        ciOk: (repo, commit) => ciOk(get, repo, commit),
      };
    },
    comments: (issueId, companyId) => namedComments(ctx, issueId, companyId),
    now: () => new Date(),
  };
}

/** One request's packet, logged and counted, so the trial can be measured. */
export async function answerStatePacket(
  ctx: StatePacketApi,
  params: Record<string, unknown>,
  deps: PacketDeps = statePacketDeps(ctx),
): Promise<PacketAnswer> {
  const { companyId, issueId, wakeReason } = params;
  if (
    typeof companyId !== "string" ||
    typeof issueId !== "string" ||
    typeof wakeReason !== "string"
  ) {
    return { packet: null, reason: "companyId, issueId and wakeReason are required" };
  }
  const answer = await statePacket({ companyId, issueId, wakeReason }, deps);
  if (answer.packet === null) {
    ctx.logger.info(`State packet: none for ${issueId}: ${answer.reason}`);
  }
  await writeMetrics(
    ctx,
    { [answer.packet === null ? "state_packet.none" : "state_packet.built"]: 1 },
    { companyId },
  );
  return answer;
}

/**
 * Registers the data key. The wake gate measures each wake after the packet
 * is answered (HAL-18985), so it reads the lines the packet just kept and
 * never delays the run.
 */
export function registerStatePacket(
  ctx: StatePacketApi,
  measure: (params: Record<string, unknown>) => Promise<unknown> = () => Promise.resolve(),
): void {
  ctx.data.register(statePacketDataKey, async (params) => {
    const answer = await answerStatePacket(ctx, params);
    void measure(params);
    return answer;
  });
}
