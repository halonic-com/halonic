import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { verifies } from "@halonicjs/testing-spec";
import { expect, test, vi } from "vitest";
import { branchUpdateClient, rebaseDocument, refusal } from "./write-client.ts";

const repo = "halonic-com/halonic";
const head = "4948ef42b0000000000000000000000000000000";
const secret = "ghs_branch_token_for_tests";
const graphql = "https://api.github.com/graphql";

/** GitHub's answers to the client's reads, for a child on `mateo/HAL-1-child`. */
function reads(change: Record<string, unknown> = {}) {
  const answers: Record<string, unknown> = {
    [`/repos/${repo}/pulls/5007`]: {
      node_id: "PR_5007",
      state: "open",
      head: { sha: head, ref: "mateo/HAL-1-child", repo: { full_name: repo } },
    },
    [`/repos/${repo}/branches/mateo/HAL-1-child`]: { protected: false },
    [`/repos/${repo}/rules/branches/mateo/HAL-1-child`]: [],
    ...change,
  };
  return vi.fn(async (path: string) => {
    if (!(path in answers)) {
      throw new Error(`GitHub: GET ${path} answered 404.`);
    }
    return answers[path];
  });
}

function setup(
  options: {
    answer?: { status: number; body: unknown };
    reads?: Record<string, unknown>;
    throws?: string;
  } = {},
) {
  const answer = options.answer ?? { status: 200, body: { data: { updatePullRequestBranch: {} } } };
  const fetch = vi.fn(async (_url: string, _init: { method: string; body?: string }) => {
    if (options.throws !== undefined) {
      throw new Error(options.throws);
    }
    return { ok: answer.status < 300, status: answer.status, json: async () => answer.body };
  });
  const token = vi.fn(async () => secret);
  const get = reads(options.reads);
  const client = branchUpdateClient({ fetch, get, token, repos: [repo] });
  return { fetch, token, get, client };
}

const request = { repo, number: 5007, head };

verifies("paperclip.branch-update-write-scope", () => {
  test("sends only the rebase mutation, with the node id and head it read, and the token asked for once", async () => {
    const { fetch, token, client } = setup();
    expect(await client.rebase(request)).toEqual({ kind: "rebased" });
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(url).toBe(graphql);
    expect(init?.method).toBe("POST");
    expect(JSON.parse(init?.body ?? "")).toEqual({
      query: rebaseDocument,
      variables: { pullRequestId: "PR_5007", expectedHeadOid: head },
    });
    expect(rebaseDocument).toContain("updateMethod: REBASE");
    expect(token).toHaveBeenCalledTimes(1);
  });

  test("refuses another address, method, document or variable before anything is sent", () => {
    const body = (query: string, variables: Record<string, unknown>) =>
      JSON.stringify({ query, variables });
    const variables = { pullRequestId: "PR_1", expectedHeadOid: head };
    const merge = rebaseDocument.replace("REBASE", "MERGE");
    expect(
      refusal({ url: graphql, method: "POST", body: body(rebaseDocument, variables) }),
    ).toBeUndefined();
    for (const wrong of [
      { url: "https://example.com/graphql", method: "POST", body: body(rebaseDocument, variables) },
      { url: graphql, method: "GET", body: body(rebaseDocument, variables) },
      { url: graphql, method: "POST", body: body(merge, variables) },
      {
        url: graphql,
        method: "POST",
        body: body(rebaseDocument, { ...variables, updateMethod: "MERGE" }),
      },
      { url: graphql, method: "POST", body: "not json" },
    ]) {
      expect(refusal(wrong)).toBeDefined();
    }
  });

  test("never touches a fork, a moved head, main, a protected or ruled branch, a closed pull request or another repository", async () => {
    const pull = `/repos/${repo}/pulls/5007`;
    const open = { node_id: "PR_5007", state: "open" };
    const cases: { reads?: Record<string, unknown>; request?: typeof request }[] = [
      {
        reads: {
          [pull]: {
            ...open,
            head: { sha: head, ref: "x", repo: { full_name: "someone/halonic" } },
          },
        },
      },
      {
        reads: { [pull]: { ...open, head: { sha: "other", ref: "x", repo: { full_name: repo } } } },
      },
      {
        reads: { [pull]: { ...open, head: { sha: head, ref: "main", repo: { full_name: repo } } } },
      },
      {
        reads: {
          [pull]: {
            ...open,
            state: "closed",
            head: { sha: head, ref: "x", repo: { full_name: repo } },
          },
        },
      },
      { reads: { [`/repos/${repo}/branches/mateo/HAL-1-child`]: { protected: true } } },
      { reads: { [`/repos/${repo}/rules/branches/mateo/HAL-1-child`]: [{ type: "deletion" }] } },
      { request: { ...request, repo: "halonic-com/cloud" } },
      { request: { ...request, number: 404 } },
    ];
    for (const each of cases) {
      const { fetch, token, client } = setup(each.reads === undefined ? {} : { reads: each.reads });
      const outcome = await client.rebase(each.request ?? request);
      expect(outcome.kind).toBe("refused");
      expect(fetch).not.toHaveBeenCalled();
      expect(token).not.toHaveBeenCalled();
    }
  });

  test("gives back GitHub's refusal of a conflicting rebase", async () => {
    const conflict = {
      data: { updatePullRequestBranch: null },
      errors: [{ message: "PullRequest::RebaseConflictError" }],
    };
    const { client } = setup({ answer: { status: 200, body: conflict } });
    expect(await client.rebase(request)).toEqual({
      kind: "refused",
      reason: "GitHub answered 200: PullRequest::RebaseConflictError",
    });
  });

  test("keeps the token out of what it returns, from GitHub's error body and from a thrown fetch error", async () => {
    const echoed = setup({
      answer: { status: 401, body: { message: `Bad credentials ${secret}` } },
    });
    const thrown = setup({ throws: `connect failed with Bearer ${secret}` });
    for (const { client } of [echoed, thrown]) {
      const outcome = await client.rebase(request);
      expect(outcome.kind).toBe("refused");
      expect(JSON.stringify(outcome)).not.toContain(secret);
      expect(JSON.stringify(outcome)).toContain("[token]");
    }
  });

  test("takes the token out before it cuts GitHub's message short, so no part of it survives the cut", async () => {
    const { client } = setup({
      answer: { status: 401, body: { message: `${"x".repeat(190)}${secret}` } },
    });
    const text = JSON.stringify(await client.rebase(request));
    for (let start = 0; start + 8 <= secret.length; start += 1) {
      expect(text).not.toContain(secret.slice(start, start + 8));
    }
  });

  test("only the stack rebase job imports the branch write client", () => {
    const src = resolve(dirname(fileURLToPath(import.meta.url)), "..");
    const files = readdirSync(src, { recursive: true, encoding: "utf8" }).filter(
      (file) => file.endsWith(".ts") && !file.includes(".test"),
    );
    const importers = files.filter((file) =>
      /from\s+"[^"]*branch-update\/write-client\.ts"/.test(readFileSync(join(src, file), "utf8")),
    );
    expect(importers.map((file) => relative(src, join(src, file))).sort()).toEqual([
      "plugin/stack-rebase-job.ts",
    ]);
  });
});
