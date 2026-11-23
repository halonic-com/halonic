import type {
  PluginAgentsClient,
  PluginApiRequestInput,
  PluginApiResponse,
  PluginDataClient,
} from "@paperclipai/plugin-sdk";
import { workerAgentsDataKey } from "../worker-agents/keys.ts";
import { type AgentEntry, type WorkerAgentsPage, workerAgentsPage } from "../worker-agents/page.ts";
import type { WorkerTables } from "../worker-agents/tables.ts";

/**
 * Where the Worker agents page gets its data (HAL-16249): the board-only
 * `worker-agents` route and the page's data key. Both only read. The manifest
 * declares the route `auth: "board"`; this checks again and refuses anyone who
 * isn't a signed-in user before it reads anything, so an agent's key gets
 * nothing even if the route were declared wrong. Paperclip answers the data
 * key only for board users of the company it checked (`assertBoardOrgAccess`).
 * Nothing here is an agent tool, so MCP never sees it.
 */

/** What the page reads, so tests can fake it. */
export interface WorkerAgentsDeps {
  readonly agents: (companyId: string) => Promise<AgentEntry[]>;
  readonly tables: WorkerTables;
  readonly now: () => Date;
}

/** The deps on top of the plugin context: agents through the SDK, the tables through `ctx.db`. */
export function workerAgentsDeps(
  ctx: { readonly agents: Pick<PluginAgentsClient, "list"> },
  tables: WorkerTables,
): WorkerAgentsDeps {
  return {
    agents: async (companyId) => {
      const agents = await ctx.agents.list({ companyId, limit: 500 });
      return agents.map(({ id, name, urlKey, status }) => ({ id, name, urlKey, status }));
    },
    tables,
    now: () => new Date(),
  };
}

async function pageData(companyId: string, deps: WorkerAgentsDeps): Promise<WorkerAgentsPage> {
  return await workerAgentsPage(companyId, await deps.agents(companyId), deps.tables, deps.now());
}

/** Answers the `worker-agents` route: the page's data for a signed-in board user, 403 for anyone else. */
export async function handleWorkerAgentsRequest(
  input: PluginApiRequestInput,
  deps: WorkerAgentsDeps,
): Promise<PluginApiResponse> {
  const userId = input.actor.actorType === "user" ? input.actor.userId : undefined;
  if (typeof userId !== "string" || userId === "") {
    return { status: 403, body: { error: "Only the board can read the Worker agents page." } };
  }
  return { status: 200, body: await pageData(input.companyId, deps) };
}

/** Registers the page's data key; the company is the one Paperclip checked for the board user. */
export function registerWorkerAgentsData(
  ctx: { readonly data: Pick<PluginDataClient, "register"> },
  deps: WorkerAgentsDeps,
): void {
  ctx.data.register(workerAgentsDataKey, async (params) => {
    const companyId = params["companyId"];
    if (typeof companyId !== "string" || companyId === "") {
      throw new Error("The Worker agents page needs a company.");
    }
    return await pageData(companyId, deps);
  });
}
