import { type Fetch, gitHubApi } from "../pr-watcher/github.ts";
import { gitHubGraphql } from "../snapshot/graphql.ts";

/**
 * The only GitHub writes of the PR tools (HAL-18983, the board's OK of
 * 26 Nov): open a pull request, change its title or body, add a
 * `built-on:` label, and turn it to a draft or mark it ready. The credential
 * is the PR write credential, `pull_requests: write` on halonic-com/halonic
 * only, kept apart from the read token, the queue credential and the branch
 * credential. It can't push, merge, approve, queue, close or change `main`.
 *
 * Every request goes through `refusal` before it is sent, so a wrong caller
 * can't widen it: one repository, these paths and methods, these body fields
 * and two GraphQL documents. Labels other than `built-on:` ones are refused,
 * so `fast-track` and the queue's labels stay with the board and the queue
 * session. The token is resolved per write, after the check, and taken out
 * of any error. Widening it needs the board's OK again
 * (`paperclip.pr-write-scope`).
 */

/** The one repository the credential may write to. */
export const prWriteRepo = "halonic-com/halonic";

/** The labels it may add: the built-on marks (HAL-3101), nothing else. */
export const allowedLabels: ReadonlySet<string> = new Set([
  "built-on:paperclip",
  "built-on:halonic",
]);

/** The GraphQL documents it may send, each with only `pullRequestId`. */
export const readyDocument =
  "mutation MarkReady($pullRequestId: ID!) { markPullRequestReadyForReview(input: { pullRequestId: $pullRequestId }) { pullRequest { number isDraft } } }";
export const draftDocument =
  "mutation MarkDraft($pullRequestId: ID!) { convertPullRequestToDraft(input: { pullRequestId: $pullRequestId }) { pullRequest { number isDraft } } }";

/** A request as the client would send it, for the check. */
export interface WriteRequest {
  readonly url: string;
  readonly method: string;
  readonly body: string;
}

const pullsUrl = `${gitHubApi}/repos/${prWriteRepo}/pulls`;
const pullPattern = new RegExp(`^${pullsUrl}/(\\d+)$`);
const labelsPattern = new RegExp(`^${gitHubApi}/repos/${prWriteRepo}/issues/(\\d+)/labels$`);

/** The body as an object of its own fields, or undefined when it isn't one. */
function fields(body: string): Record<string, unknown> | undefined {
  try {
    const parsed: unknown = JSON.parse(body);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

/** Whether every key of `body` is one of `allowed`. */
function onlyKeys(body: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(body).every((key) => allowed.includes(key));
}

/** Why a GraphQL request isn't one of the two documents, or undefined when it is. */
function graphqlRefusal(body: Record<string, unknown>): string | undefined {
  const { query, variables, ...other } = body;
  if ((query !== readyDocument && query !== draftDocument) || Object.keys(other).length > 0) {
    return "a document that isn't marking ready or draft";
  }
  const names = Object.keys((variables ?? {}) as object);
  return names.join(",") === "pullRequestId" ? undefined : "variables the mutation doesn't take";
}

/** Why a labels request adds more than the built-on labels, or undefined when it doesn't. */
function labelsRefusal(body: Record<string, unknown>): string | undefined {
  const { labels } = body;
  if (!onlyKeys(body, ["labels"]) || !Array.isArray(labels) || labels.length === 0) {
    return "a labels body that isn't a list of labels";
  }
  const other = labels.find((label) => typeof label !== "string" || !allowedLabels.has(label));
  return other === undefined ? undefined : `the label ${JSON.stringify(other)}`;
}

/** Why a request isn't one of the allowed writes, or undefined when it is. */
export function refusal(request: WriteRequest): string | undefined {
  const body = fields(request.body);
  if (body === undefined) {
    return "a body that isn't a JSON object";
  }
  if (request.method === "POST" && request.url === gitHubGraphql) {
    return graphqlRefusal(body);
  }
  if (request.method === "POST" && request.url === pullsUrl) {
    return onlyKeys(body, ["title", "body", "head", "base", "draft"]) && body["base"] === "main"
      ? undefined
      : "a pull request that isn't against main, or with other fields";
  }
  if (request.method === "PATCH" && pullPattern.test(request.url)) {
    return onlyKeys(body, ["title", "body"]) ? undefined : "a change of more than title and body";
  }
  if (request.method === "POST" && labelsPattern.test(request.url)) {
    return labelsRefusal(body);
  }
  return `a ${request.method} request to ${request.url}`;
}

/** The text with the token taken out, should GitHub or the network ever echo it. */
function scrubbed(text: string, token: string): string {
  return token === "" ? text : text.replaceAll(token, "[token]");
}

/** Sends one allowed write and returns GitHub's answer; throws with the token taken out. */
export type PrWrite = (request: WriteRequest) => Promise<unknown>;

/**
 * The writer. `token` is called once per write, only after `refusal` let it
 * through. A refused request throws before anything is sent.
 */
export function prWriter(options: {
  readonly fetch: Fetch;
  readonly token: () => Promise<string>;
}): PrWrite {
  return async (request) => {
    const refused = refusal(request);
    if (refused !== undefined) {
      throw new Error(`the PR write client refuses ${refused}.`);
    }
    const token = await options.token();
    let response: Awaited<ReturnType<Fetch>>;
    try {
      response = await options.fetch(request.url, {
        method: request.method,
        headers: {
          accept: "application/vnd.github+json",
          "content-type": "application/json",
          "x-github-api-version": "2022-11-28",
          "user-agent": "halonic-agent-tools",
          authorization: `Bearer ${token}`,
        },
        body: request.body,
      });
    } catch (error) {
      throw new Error(scrubbed(`GitHub: ${(error as Error).message}`, token));
    }
    const answer = (await response.json().catch(() => null)) as {
      message?: unknown;
      errors?: readonly { message?: unknown }[];
    } | null;
    const message = answer?.errors?.[0]?.message ?? answer?.message;
    if (!response.ok || (request.url === gitHubGraphql && answer?.errors !== undefined)) {
      const reason =
        typeof message === "string" ? `: ${scrubbed(message, token).slice(0, 200)}` : "";
      throw new Error(`GitHub answered ${response.status}${reason}.`);
    }
    return answer;
  };
}
