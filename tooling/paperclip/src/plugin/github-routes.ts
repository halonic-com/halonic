import type {
  PluginApiRequestInput,
  PluginApiResponse,
  PluginConfigClient,
  PluginLogger,
  PluginStateClient,
} from "@paperclipai/plugin-sdk";
import { readMergeSpeedRecord } from "../board-check/merge-speed.ts";
import { agentMergeCounts, readAgentMergeRecord } from "../snapshot/agent-merges.ts";
import { loadDequeueReasons } from "../snapshot/dequeue.ts";
import { loadSnapshot } from "../snapshot/store.ts";
import { githubPull, githubSummary, type SummaryInputs } from "../snapshot/summary.ts";
import { errorCode, stateKey } from "./board-check-api.ts";

/**
 * The board-only `github-summary` and `github-pull` routes (HAL-17604): pull
 * requests and the merge queue for Halonic's `TeamStatus` provider, read
 * from the PR watcher's stored snapshot and the board check's merge-speed
 * record. They read plugin state and settings only and send no request to
 * GitHub or anywhere else: the read-only GitHub token stays with the jobs.
 * The manifest declares them `auth: "board"`; each handler checks again and
 * refuses anyone who isn't a signed-in user before it reads anything.
 */

/** Route keys, as the manifest declares them. */
export const githubSummaryRouteKey = "github-summary";
export const githubPullRouteKey = "github-pull";

/** The part of the plugin context the routes use: no HTTP client on purpose. */
export interface GitHubRoutesApi {
  readonly state: Pick<PluginStateClient, "get">;
  readonly config: Pick<PluginConfigClient, "get">;
  readonly logger: Pick<PluginLogger, "error">;
}

/** A pull request number: a positive integer of at most 9 digits, nothing else. */
const numberPattern = /^[1-9]\d{0,8}$/;

/** Whether the request comes from a signed-in board user. */
export function isBoard(input: PluginApiRequestInput): boolean {
  const userId = input.actor.actorType === "user" ? input.actor.userId : undefined;
  return typeof userId === "string" && userId !== "";
}

function refuse(status: number, message: string): PluginApiResponse {
  return { status, body: { error: message } };
}

async function inputsOf(ctx: GitHubRoutesApi, companyId: string): Promise<SummaryInputs> {
  const config = await ctx.config.get(companyId);
  const login = config["fastTrackLabelAdder"];
  return {
    boardLogin: typeof login === "string" ? login.trim() : "",
    dequeues: await loadDequeueReasons(ctx, companyId),
  };
}

async function snapshotOf(ctx: GitHubRoutesApi, companyId: string) {
  try {
    return { snapshot: await loadSnapshot(ctx, companyId) };
  } catch (error) {
    ctx.logger.error(`GitHub routes: couldn't read the snapshot (${errorCode(error)}).`, {
      companyId,
    });
    return {
      failed: refuse(503, "The stored GitHub snapshot has a shape this plugin can't read."),
    };
  }
}

/** Answers `GET /github/summary`: every watched repository's pull requests and queue. */
export async function handleGitHubSummary(
  input: PluginApiRequestInput,
  ctx: GitHubRoutesApi,
): Promise<PluginApiResponse> {
  if (!isBoard(input)) {
    return refuse(403, "Only the board can read the GitHub summary.");
  }
  const read = await snapshotOf(ctx, input.companyId);
  if (read.failed !== undefined) {
    return read.failed;
  }
  const record = readMergeSpeedRecord(
    await ctx.state.get(stateKey(input.companyId, "merge-speed")),
  );
  const merges = readAgentMergeRecord(
    await ctx.state.get(stateKey(input.companyId, "agent-merges")),
  );
  const mergedByAgent =
    merges === undefined || read.snapshot === undefined
      ? null
      : agentMergeCounts(merges, new Date(read.snapshot.takenAt));
  const inputs = await inputsOf(ctx, input.companyId);
  return { status: 200, body: githubSummary(read.snapshot, record, inputs, mergedByAgent) };
}

/**
 * Answers `GET /github/pr/{number}`: one pull request of the snapshot, by
 * number, in `?repo=` or the first watched repository. The number is only
 * compared with the snapshot's, never put into a path or address.
 */
export async function handleGitHubPull(
  input: PluginApiRequestInput,
  ctx: GitHubRoutesApi,
): Promise<PluginApiResponse> {
  if (!isBoard(input)) {
    return refuse(403, "Only the board can read a pull request's detail.");
  }
  const raw = input.params["number"] ?? "";
  if (!numberPattern.test(raw)) {
    return refuse(404, "No such pull request in the snapshot.");
  }
  const read = await snapshotOf(ctx, input.companyId);
  if (read.failed !== undefined) {
    return read.failed;
  }
  const repoParam = input.query["repo"];
  const repo = typeof repoParam === "string" ? repoParam : read.snapshot?.repos[0]?.repo;
  const detail =
    read.snapshot === undefined || repo === undefined
      ? undefined
      : githubPull(read.snapshot, repo, Number(raw), await inputsOf(ctx, input.companyId));
  if (detail === undefined) {
    return refuse(404, "No such pull request in the snapshot.");
  }
  return { status: 200, body: detail };
}
