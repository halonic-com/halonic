import { type Fetch, gitHubApi } from "../pr-watcher/github.ts";
import { gitHubGraphql } from "../snapshot/graphql.ts";
import { autoLabel } from "./state.ts";

/**
 * Merge control's one way to change GitHub, with the queue credential only
 * (ADR on HAL-17700): the two merge-queue mutations, a workflow run's rerun,
 * rerun of its failed jobs and cancel, a comment on a pull request,
 * closing and reopening one for the label-noop self-fix (HAL-18470), and
 * adding `built-on:paperclip` and no other label (HAL-18506), all
 * to `https://api.github.com` and only on the configured repositories.
 * Every request is checked against that list before it is sent; anything
 * else is refused and nothing goes out. The token is asked for at each send,
 * after the check, and never kept, logged or put in an error. Only the
 * merge-control job builds this client: no agent tool imports it.
 */

/** One write merge control may make. */
export type QueueWrite =
  | {
      readonly kind: "enqueue";
      readonly pullId: string;
      /** GitHub refuses the enqueue when the head moved since the pass read it. */
      readonly head: string;
      readonly jump: boolean;
    }
  | { readonly kind: "dequeue" | "close" | "reopen"; readonly pullId: string }
  | {
      readonly kind: "rerun" | "rerun-failed-jobs" | "cancel-run";
      readonly repo: string;
      readonly runId: number;
    }
  | {
      readonly kind: "comment";
      readonly repo: string;
      readonly number: number;
      readonly body: string;
    }
  | {
      readonly kind: "add-label";
      readonly repo: string;
      readonly number: number;
      readonly label: typeof autoLabel;
    };

/** The enqueue mutation, the only document of its kind the client sends. */
export const enqueueDocument =
  "mutation Enqueue($pullRequestId: ID!, $expectedHeadOid: GitObjectID!, $jump: Boolean!) { enqueuePullRequest(input: { pullRequestId: $pullRequestId, expectedHeadOid: $expectedHeadOid, jump: $jump }) { mergeQueueEntry { position } } }";

/** The dequeue mutation. */
export const dequeueDocument =
  "mutation Dequeue($id: ID!) { dequeuePullRequest(input: { id: $id }) { mergeQueueEntry { position } } }";

/** Closes a pull request, right before `reopenDocument` (HAL-18470). */
export const closeDocument =
  "mutation Close($id: ID!) { closePullRequest(input: { pullRequestId: $id }) { pullRequest { state } } }";

/** Reopens a pull request. */
export const reopenDocument =
  "mutation Reopen($id: ID!) { reopenPullRequest(input: { pullRequestId: $id }) { pullRequest { state } } }";

/** Each allowed GraphQL document with the variables it takes, no others. */
const documents: ReadonlyMap<string, readonly string[]> = new Map([
  [enqueueDocument, ["expectedHeadOid", "jump", "pullRequestId"]],
  [dequeueDocument, ["id"]],
  [closeDocument, ["id"]],
  [reopenDocument, ["id"]],
]);

/** Adding labels: only with the body `autoLabel` gives, see `labelsReason`. */
const labelsPath = /^\/issues\/[1-9]\d*\/labels$/;

/** The REST paths a POST may go to, after `/repos/<owner>/<name>`. */
const restPaths = [
  /^\/actions\/runs\/[1-9]\d*\/rerun$/,
  /^\/actions\/runs\/[1-9]\d*\/rerun-failed-jobs$/,
  /^\/actions\/runs\/[1-9]\d*\/cancel$/,
  /^\/issues\/[1-9]\d*\/comments$/,
  labelsPath,
];

/** A request as the client would send it, for the check. */
export interface WriteRequest {
  readonly url: string;
  readonly method: string;
  readonly body?: string;
}

function graphqlReason(body: string | undefined): string | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body ?? "");
  } catch {
    return "a GraphQL body that isn't JSON";
  }
  const { query, variables, ...other } = (parsed ?? {}) as Record<string, unknown>;
  const allowed = typeof query === "string" ? documents.get(query) : undefined;
  if (allowed === undefined || Object.keys(other).length > 0) {
    return "a GraphQL document that isn't the enqueue, dequeue, close or reopen mutation";
  }
  const names = Object.keys((variables ?? {}) as object).sort();
  if (names.join(",") !== allowed.join(",")) {
    return "GraphQL variables the mutation doesn't take";
  }
  return undefined;
}

/** Why a labels body isn't exactly `{"labels":["built-on:paperclip"]}`, or undefined. */
function labelsReason(body: string | undefined): string | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body ?? "");
  } catch {
    return "a labels body that isn't JSON";
  }
  const { labels, ...other } = (parsed ?? {}) as Record<string, unknown>;
  const only =
    Array.isArray(labels) &&
    labels.length === 1 &&
    labels[0] === autoLabel &&
    Object.keys(other).length === 0;
  return only ? undefined : `a label other than ${autoLabel}`;
}

/**
 * Why a request is outside the list, or undefined when it is allowed: a POST
 * to the GraphQL endpoint with one of the four mutations, or a POST to one of
 * the REST paths on one of `repos`; to the labels path only with
 * `built-on:paperclip` as the one label.
 */
export function refusal(request: WriteRequest, repos: readonly string[]): string | undefined {
  let url: URL;
  try {
    url = new URL(request.url);
  } catch {
    return "an address that isn't a URL";
  }
  if (url.origin !== gitHubApi || url.username !== "" || url.password !== "") {
    return `another host (${url.origin})`;
  }
  if (request.method !== "POST") {
    return `a ${request.method} request`;
  }
  if (url.search !== "" || url.hash !== "") {
    return "a query string";
  }
  if (url.href === gitHubGraphql) {
    return graphqlReason(request.body);
  }
  const repo = repos.find((name) => url.pathname.startsWith(`/repos/${name}/`));
  if (repo === undefined) {
    return "a repository merge control doesn't act on";
  }
  const path = url.pathname.slice(`/repos/${repo}`.length);
  if (!restPaths.some((pattern) => pattern.test(path))) {
    return `the path ${url.pathname}`;
  }
  return labelsPath.test(path) ? labelsReason(request.body) : undefined;
}

/** Sends merge control's writes. */
export interface QueueWriteClient {
  send(write: QueueWrite): Promise<void>;
}

const mutations = { dequeue: dequeueDocument, close: closeDocument, reopen: reopenDocument };

function requestOf(write: QueueWrite): WriteRequest {
  switch (write.kind) {
    case "enqueue":
      return {
        url: gitHubGraphql,
        method: "POST",
        body: JSON.stringify({
          query: enqueueDocument,
          variables: { pullRequestId: write.pullId, expectedHeadOid: write.head, jump: write.jump },
        }),
      };
    case "dequeue":
    case "close":
    case "reopen":
      return {
        url: gitHubGraphql,
        method: "POST",
        body: JSON.stringify({ query: mutations[write.kind], variables: { id: write.pullId } }),
      };
    case "rerun":
    case "rerun-failed-jobs":
    case "cancel-run": {
      const action = write.kind === "cancel-run" ? "cancel" : write.kind;
      return {
        url: `${gitHubApi}/repos/${write.repo}/actions/runs/${write.runId}/${action}`,
        method: "POST",
      };
    }
    case "comment":
      return {
        url: `${gitHubApi}/repos/${write.repo}/issues/${write.number}/comments`,
        method: "POST",
        body: JSON.stringify({ body: write.body }),
      };
    case "add-label":
      return {
        url: `${gitHubApi}/repos/${write.repo}/issues/${write.number}/labels`,
        method: "POST",
        body: JSON.stringify({ labels: [write.label] }),
      };
  }
}

/** GitHub's own reason for a refusal, its `message` or first GraphQL error, cut short. */
async function reasonOf(response: Pick<Response, "json">): Promise<string> {
  try {
    const body = (await response.json()) as {
      message?: unknown;
      errors?: readonly { message?: unknown }[];
    } | null;
    const message = body?.errors?.[0]?.message ?? body?.message;
    return typeof message === "string" ? `: ${message.slice(0, 200)}` : "";
  } catch {
    return "";
  }
}

/**
 * Why a write failed, or empty: a status other than 2xx, or for GraphQL a
 * 200 with `errors`, which is how GitHub answers a refused mutation.
 */
async function failureOf(
  response: Pick<Response, "ok" | "status" | "json">,
  graphql: boolean,
): Promise<string> {
  if (!response.ok || graphql) {
    const reason = await reasonOf(response);
    return response.ok && reason === "" ? "" : `answered ${response.status}${reason}`;
  }
  return "";
}

/**
 * The queue client. `token` is called once per send, after the request
 * passed the check; a failed send throws an error with GitHub's status and
 * reason, with the token taken out should GitHub ever echo it.
 */
export function queueWriteClient(options: {
  fetch: Fetch;
  token: () => Promise<string>;
  repos: readonly string[];
}): QueueWriteClient {
  return {
    async send(write) {
      const request = requestOf(write);
      const refused = refusal(request, options.repos);
      if (refused !== undefined) {
        throw new Error(`Merge control: refused a ${write.kind} write to ${refused}.`);
      }
      const token = await options.token();
      const response = await options.fetch(request.url, {
        method: request.method,
        headers: {
          accept: "application/vnd.github+json",
          "content-type": "application/json",
          "x-github-api-version": "2022-11-28",
          "user-agent": "halonic-agent-tools",
          authorization: `Bearer ${token}`,
        },
        // A redirect would carry the token to an address the check never saw.
        redirect: "manual",
        ...(request.body === undefined ? {} : { body: request.body }),
      });
      const failure = await failureOf(response, request.url === gitHubGraphql);
      if (failure !== "") {
        const safe = token === "" ? failure : failure.replaceAll(token, "[token]");
        throw new Error(`Merge control: the ${write.kind} write ${safe}.`);
      }
    },
  };
}
