import type { Fetch, GitHubGet } from "../pr-watcher/github.ts";
import { gitHubGraphql } from "../snapshot/graphql.ts";

/**
 * The PR watcher's one way to change a branch (HAL-18031, Julian's OK on
 * HAL-18035): GitHub's `updatePullRequestBranch` mutation with the rebase
 * method, which replays a pull request's commits on its own base branch. It
 * can't push other content, merge, delete or touch `main`. The credential is
 * the branch credential of the merge-control ADR, kept apart from the read
 * token and the queue credential.
 *
 * The caller names only the repository, the pull request and the head it
 * read. The client reads the rest from GitHub with the read token, so a
 * wrong caller can't steer it: the pull request must be open, its head
 * branch in the same repository (never a fork), still at that head, and
 * not `main` or a protected or ruled branch. Then it sends the one document,
 * with `updateMethod: REBASE` in its text, and resolves the token only then.
 * Widening it to `MERGE`, or adding a second mutation here, needs Julian's
 * OK again (`paperclip.branch-update-write-scope`).
 */

/** The only document the client sends. */
export const rebaseDocument =
  "mutation RebaseBranch($pullRequestId: ID!, $expectedHeadOid: GitObjectID!) { updatePullRequestBranch(input: { pullRequestId: $pullRequestId, expectedHeadOid: $expectedHeadOid, updateMethod: REBASE }) { pullRequest { number } } }";

/** The variables it takes, sorted. */
const rebaseVariables = ["expectedHeadOid", "pullRequestId"];

/** The rebase a caller asks for: the pull request and the head it read. */
export interface BranchRebase {
  readonly repo: string;
  readonly number: number;
  readonly head: string;
}

/**
 * What came of it. `rebased`: GitHub took it; the rebase runs on its side, so
 * the new head shows on a later read. `refused`: nothing changed, for the
 * reason given (GitHub's, or the client's own check).
 */
export type RebaseOutcome =
  | { readonly kind: "rebased" }
  | { readonly kind: "refused"; readonly reason: string };

/** Rebases one pull request's branch on its base. */
export interface BranchUpdateClient {
  rebase(request: BranchRebase): Promise<RebaseOutcome>;
}

/** A request as the client would send it, for the check. */
export interface WriteRequest {
  readonly url: string;
  readonly method: string;
  readonly body?: string;
}

/** Why a request isn't the one allowed mutation, or undefined when it is. */
export function refusal(request: WriteRequest): string | undefined {
  if (request.url !== gitHubGraphql) {
    return `the address ${request.url}`;
  }
  if (request.method !== "POST") {
    return `a ${request.method} request`;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(request.body ?? "");
  } catch {
    return "a body that isn't JSON";
  }
  const { query, variables, ...other } = (parsed ?? {}) as Record<string, unknown>;
  if (query !== rebaseDocument || Object.keys(other).length > 0) {
    return "a document that isn't the rebase mutation";
  }
  const names = Object.keys((variables ?? {}) as object).sort();
  return names.join(",") === rebaseVariables.join(",")
    ? undefined
    : "variables the mutation doesn't take";
}

/** The pull request as the REST API returns it, the fields the check reads. */
interface PullDetails {
  readonly node_id?: string;
  readonly state?: string;
  readonly head?: {
    readonly sha?: string;
    readonly ref?: string;
    readonly repo?: { readonly full_name?: string } | null;
  };
}

/**
 * Why this branch may not be rebased, or the pull request's node id when it
 * may. Every read goes through the read token; a failed read refuses.
 */
async function checked(
  get: GitHubGet,
  repos: readonly string[],
  { repo, number, head }: BranchRebase,
): Promise<{ readonly id: string } | { readonly refused: string }> {
  if (!repos.includes(repo)) {
    return { refused: `${repo} isn't a repository it may write to` };
  }
  const pull = (await get(`/repos/${repo}/pulls/${number}`)) as PullDetails;
  const ref = pull.head?.ref ?? "";
  if (pull.state !== "open" || pull.node_id === undefined) {
    return { refused: "the pull request isn't open" };
  }
  if (pull.head?.repo?.full_name !== repo) {
    return { refused: "its head branch is in another repository" };
  }
  if (pull.head.sha !== head) {
    return { refused: "its head moved since it was read" };
  }
  if (ref === "" || ref === "main") {
    return { refused: `its head branch is ${ref === "" ? "unknown" : "main"}` };
  }
  const path = ref.split("/").map(encodeURIComponent).join("/");
  const [branch, rules] = (await Promise.all([
    get(`/repos/${repo}/branches/${path}`),
    get(`/repos/${repo}/rules/branches/${path}`),
  ])) as [{ protected?: boolean }, unknown[]];
  if (branch.protected !== false || !Array.isArray(rules) || rules.length > 0) {
    return { refused: "its head branch is protected or has rules" };
  }
  return { id: pull.node_id };
}

/** GitHub's own reason, its first GraphQL error or `message`, cut short. */
async function reasonOf(response: Pick<Response, "ok" | "status" | "json">): Promise<string> {
  const body = (await response.json().catch(() => null)) as {
    message?: unknown;
    errors?: readonly { message?: unknown }[];
  } | null;
  const message = body?.errors?.[0]?.message ?? body?.message;
  if (response.ok && message === undefined) {
    return "";
  }
  const text = typeof message === "string" ? `: ${message.slice(0, 200)}` : "";
  return `GitHub answered ${response.status}${text}`;
}

/** The text with the token taken out, should GitHub or the network ever echo it. */
function scrubbed(text: string, token: string): string {
  return token === "" ? text : text.replaceAll(token, "[token]");
}

/**
 * The client. `get` is the watcher's read-only reader; `token` is called once
 * per rebase, after every check passed. A failure of the send comes back as
 * `refused`, never thrown, with the token taken out.
 */
export function branchUpdateClient(options: {
  readonly fetch: Fetch;
  readonly get: GitHubGet;
  readonly token: () => Promise<string>;
  readonly repos: readonly string[];
}): BranchUpdateClient {
  return {
    async rebase(request) {
      const allowed = await checked(options.get, options.repos, request).catch(
        (error: unknown) => ({ refused: `couldn't check it: ${(error as Error).message}` }),
      );
      if ("refused" in allowed) {
        return { kind: "refused", reason: allowed.refused };
      }
      const send = {
        url: gitHubGraphql,
        method: "POST",
        body: JSON.stringify({
          query: rebaseDocument,
          variables: { pullRequestId: allowed.id, expectedHeadOid: request.head },
        }),
      };
      const refused = refusal(send);
      if (refused !== undefined) {
        return { kind: "refused", reason: `the client refused ${refused}` };
      }
      const token = await options.token();
      try {
        const response = await options.fetch(send.url, {
          method: send.method,
          headers: {
            accept: "application/vnd.github+json",
            "content-type": "application/json",
            "user-agent": "halonic-agent-tools",
            authorization: `Bearer ${token}`,
          },
          body: send.body,
        });
        const reason = await reasonOf(response);
        return reason === ""
          ? { kind: "rebased" }
          : { kind: "refused", reason: scrubbed(reason, token) };
      } catch (error) {
        return { kind: "refused", reason: scrubbed(`${(error as Error).message}`, token) };
      }
    },
  };
}
