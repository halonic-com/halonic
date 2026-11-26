import type { GitHubGet } from "../pr-watcher/github.ts";
import { gitHubGraphql } from "../snapshot/graphql.ts";
import { ToolInputError } from "../task-tools/input.ts";
import {
  allowedLabels,
  draftDocument,
  type PrWrite,
  prWriteRepo,
  readyDocument,
} from "./write-client.ts";

/**
 * The `write_pr` tool and the ready step of `set_next_step` and `finish_run`
 * (HAL-18983, token plan Track B): open or update the caller's own pull
 * request in one call, instead of `gh pr create`, `gh pr edit` and
 * `gh pr ready`. It finds the pull request by branch with the read token, and
 * writes only through the PR write client. Only a branch named for the
 * calling agent (`<agent>/HAL-<n>-<words>`) is written, so an agent can't
 * change a teammate's pull request.
 */

/** The longest title GitHub keeps whole in a squash commit's subject (HAL-4968). */
export const maxTitleLength = 100;

/** The longest body the tool sends; GitHub's own limit is 65,536. */
export const maxBodyLength = 60_000;

/** What `write_pr` asks for. Left-out fields stay as they are on an open pull request. */
export interface WritePrRequest {
  readonly branch: string;
  readonly title: string | undefined;
  readonly body: string | undefined;
  readonly state: "draft" | "ready" | undefined;
  readonly labels: readonly string[];
}

/** What the tool did, for the agent. */
export interface WritePrResult {
  readonly number: number;
  readonly url: string;
  readonly opened: boolean;
  readonly draft: boolean;
  readonly changed: readonly string[];
}

/** The parts of a pull request the tool reads. */
interface PullDetails {
  readonly number: number;
  readonly node_id: string;
  readonly html_url: string;
  readonly draft?: boolean;
  readonly head: { readonly ref: string; readonly repo?: { readonly full_name?: string } | null };
}

/** The writes and reads the tool needs, and who calls it. */
export interface PrWriteDeps {
  readonly get: GitHubGet;
  readonly write: PrWrite;
  /** The calling agent's url key, which its own branches start with. */
  readonly agentKey: string;
}

/** Whether `branch` is the agent's own: `<agent>/HAL-<n>-<words>`, as the PR watcher reads it. */
export function isOwnBranch(branch: string, agentKey: string): boolean {
  const own = new RegExp(`^${agentKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/HAL-\\d+-[\\w.-]+$`);
  return own.test(branch);
}

function optionalText(value: unknown, name: string, max: number): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string" || value.trim() === "" || value.length > max) {
    throw new ToolInputError(`${name} must be a text of 1 to ${max} characters.`);
  }
  return value;
}

/** `write_pr`'s parameters; refuses any label but the built-on ones. */
export function readWritePrParams(params: unknown): WritePrRequest {
  const read = (params ?? {}) as Record<string, unknown>;
  const branch = typeof read["branch"] === "string" ? read["branch"].trim() : "";
  if (branch === "") {
    throw new ToolInputError("branch must be your pushed branch, such as priya/HAL-1-name.");
  }
  const state = read["state"];
  if (state !== undefined && state !== "draft" && state !== "ready") {
    throw new ToolInputError("state must be draft or ready.");
  }
  const labels = read["labels"] ?? [];
  if (!Array.isArray(labels) || labels.some((label) => !allowedLabels.has(label))) {
    throw new ToolInputError(
      `labels may only be ${[...allowedLabels].join(" or ")}: fast-track and the queue's labels stay with the board and the queue session.`,
    );
  }
  return {
    branch,
    title: optionalText(read["title"], "title", maxTitleLength),
    body: optionalText(read["body"], "body", maxBodyLength),
    state,
    labels: labels as string[],
  };
}

/** The body with a `Built-on: paperclip` line at its end unless it names one (HAL-3101). */
export function withBuiltOnLine(body: string): string {
  return /^Built-on: /m.test(body) ? body : `${body.trimEnd()}\n\nBuilt-on: paperclip\n`;
}

/** The caller's open pull request on `branch`, if there is one. */
async function openPull(get: GitHubGet, branch: string): Promise<PullDetails | undefined> {
  const owner = prWriteRepo.split("/")[0];
  const head = encodeURIComponent(`${owner}:${branch}`);
  const pulls = (await get(
    `/repos/${prWriteRepo}/pulls?head=${head}&state=open&per_page=2`,
  )) as PullDetails[];
  return pulls.find(
    (pull) => pull.head.ref === branch && pull.head.repo?.full_name === prWriteRepo,
  );
}

function json(value: unknown): string {
  return JSON.stringify(value);
}

/** Turns the pull request to a draft or marks it ready, when it isn't already. */
async function setDraft(write: PrWrite, pull: PullDetails, draft: boolean): Promise<boolean> {
  if (pull.draft === draft) {
    return false;
  }
  await write({
    url: gitHubGraphql,
    method: "POST",
    body: json({
      query: draft ? draftDocument : readyDocument,
      variables: { pullRequestId: pull.node_id },
    }),
  });
  return true;
}

async function addLabels(write: PrWrite, number: number, labels: readonly string[]) {
  if (labels.length > 0) {
    await write({
      url: `https://api.github.com/repos/${prWriteRepo}/issues/${number}/labels`,
      method: "POST",
      body: json({ labels: [...new Set(labels)] }),
    });
  }
}

function refuseOthersBranch(branch: string, agentKey: string): void {
  if (!isOwnBranch(branch, agentKey)) {
    throw new ToolInputError(
      `${JSON.stringify(branch)} isn't your branch: only ${agentKey}/HAL-<n>-<words> is written.`,
    );
  }
}

/** Opens a draft (unless `ready`) with the built-on label and line. */
async function open(deps: PrWriteDeps, request: WritePrRequest): Promise<WritePrResult> {
  if (request.title === undefined || request.body === undefined) {
    throw new ToolInputError(
      "no open pull request on this branch: opening one needs title and body.",
    );
  }
  const pull = (await deps.write({
    url: `https://api.github.com/repos/${prWriteRepo}/pulls`,
    method: "POST",
    body: json({
      title: request.title,
      body: withBuiltOnLine(request.body),
      head: request.branch,
      base: "main",
      draft: request.state !== "ready",
    }),
  })) as PullDetails;
  await addLabels(deps.write, pull.number, ["built-on:paperclip", ...request.labels]);
  return {
    number: pull.number,
    url: pull.html_url,
    opened: true,
    draft: request.state !== "ready",
    changed: ["opened", "label"],
  };
}

/** Changes only what the request names on an open pull request. */
async function update(
  deps: PrWriteDeps,
  pull: PullDetails,
  request: WritePrRequest,
): Promise<WritePrResult> {
  const changed: string[] = [];
  const edit = {
    ...(request.title === undefined ? {} : { title: request.title }),
    ...(request.body === undefined ? {} : { body: withBuiltOnLine(request.body) }),
  };
  if (Object.keys(edit).length > 0) {
    await deps.write({
      url: `https://api.github.com/repos/${prWriteRepo}/pulls/${pull.number}`,
      method: "PATCH",
      body: json(edit),
    });
    changed.push(...Object.keys(edit));
  }
  await addLabels(deps.write, pull.number, request.labels);
  if (request.labels.length > 0) {
    changed.push("label");
  }
  const draft = request.state === undefined ? pull.draft === true : request.state === "draft";
  if (await setDraft(deps.write, pull, draft)) {
    changed.push(draft ? "draft" : "ready");
  }
  return { number: pull.number, url: pull.html_url, opened: false, draft, changed };
}

/** Opens the branch's pull request, or updates the open one. */
export async function writePr(deps: PrWriteDeps, request: WritePrRequest): Promise<WritePrResult> {
  refuseOthersBranch(request.branch, deps.agentKey);
  const pull = await openPull(deps.get, request.branch);
  return pull === undefined ? open(deps, request) : update(deps, pull, request);
}

/** Marks the caller's own pull request `number` ready, the closing call's GitHub step. */
export async function markReady(deps: PrWriteDeps, number: number): Promise<string> {
  const pull = (await deps.get(`/repos/${prWriteRepo}/pulls/${number}`)) as PullDetails & {
    readonly state?: string;
  };
  refuseOthersBranch(pull.head.ref, deps.agentKey);
  if (pull.state !== "open" || pull.head.repo?.full_name !== prWriteRepo) {
    throw new ToolInputError(
      `#${number} isn't an open pull request on ${prWriteRepo}'s own branch.`,
    );
  }
  return (await setDraft(deps.write, pull, false))
    ? `#${number} is marked ready.`
    : `#${number} was already ready.`;
}

/** The answer an agent reads. */
export function writePrText(result: WritePrResult): string {
  const what = result.opened ? "Opened" : "Updated";
  const changed = result.changed.length === 0 ? "nothing to change" : result.changed.join(", ");
  return `${what} #${result.number} (${result.draft ? "draft" : "ready"}): ${changed}. ${result.url}`;
}
