import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { verifies } from "@halonicjs/testing-spec";
import { expect, test, vi } from "vitest";
import { draftDocument, prWriter, readyDocument, refusal } from "./write-client.ts";

const api = "https://api.github.com";
const pulls = `${api}/repos/halonic-com/halonic/pulls`;
const graphql = `${api}/graphql`;
const secret = "ghs_pr_write_token_for_tests";

const body = (value: unknown) => JSON.stringify(value);

function setup(answer: { status: number; body: unknown } = { status: 200, body: {} }) {
  const fetch = vi.fn(async (_url: string, _init: { method: string; body?: string }) => ({
    ok: answer.status < 300,
    status: answer.status,
    json: async () => answer.body,
  }));
  const token = vi.fn(async () => secret);
  return { fetch, token, write: prWriter({ fetch, token }) };
}

verifies("paperclip.pr-write-scope", () => {
  test("lets through only the allowed writes on halonic-com/halonic", () => {
    const allowed = [
      {
        url: pulls,
        method: "POST",
        body: body({ title: "t", body: "b", head: "x", base: "main", draft: true }),
      },
      { url: `${pulls}/5007`, method: "PATCH", body: body({ title: "t", body: "b" }) },
      {
        url: `${api}/repos/halonic-com/halonic/issues/5007/labels`,
        method: "POST",
        body: body({ labels: ["built-on:paperclip"] }),
      },
      {
        url: graphql,
        method: "POST",
        body: body({ query: readyDocument, variables: { pullRequestId: "PR_1" } }),
      },
      {
        url: graphql,
        method: "POST",
        body: body({ query: draftDocument, variables: { pullRequestId: "PR_1" } }),
      },
    ];
    for (const request of allowed) {
      expect(refusal(request)).toBeUndefined();
    }
  });

  test("refuses fast-track and queue labels, other repositories, merges, other fields and documents", () => {
    const labels = `${api}/repos/halonic-com/halonic/issues/5007/labels`;
    const refused = [
      { url: labels, method: "POST", body: body({ labels: ["fast-track"] }) },
      { url: labels, method: "POST", body: body({ labels: ["built-on:paperclip", "queue-hold"] }) },
      {
        url: `${api}/repos/halonic-com/cloud/pulls`,
        method: "POST",
        body: body({ title: "t", head: "x", base: "main" }),
      },
      { url: pulls, method: "POST", body: body({ title: "t", head: "x", base: "release" }) },
      { url: `${pulls}/5007`, method: "PATCH", body: body({ state: "closed" }) },
      { url: `${pulls}/5007`, method: "PATCH", body: body({ base: "main" }) },
      { url: `${pulls}/5007/merge`, method: "PUT", body: body({}) },
      { url: `${pulls}/5007/reviews`, method: "POST", body: body({ event: "APPROVE" }) },
      { url: `${api}/repos/halonic-com/halonic/git/refs`, method: "POST", body: body({}) },
      {
        url: graphql,
        method: "POST",
        body: body({
          query: "mutation { enqueuePullRequest }",
          variables: { pullRequestId: "PR_1" },
        }),
      },
      {
        url: graphql,
        method: "POST",
        body: body({ query: readyDocument, variables: { pullRequestId: "PR_1", jump: true } }),
      },
      {
        url: "https://example.com/graphql",
        method: "POST",
        body: body({ query: readyDocument, variables: { pullRequestId: "PR_1" } }),
      },
      { url: pulls, method: "POST", body: "not json" },
    ];
    for (const request of refused) {
      expect(refusal(request), request.url + request.body).toBeDefined();
    }
  });

  test("asks for the token once per write, and never for a refused one", async () => {
    const { fetch, token, write } = setup();
    await write({ url: `${pulls}/5007`, method: "PATCH", body: body({ title: "t" }) });
    expect(token).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0]?.[1].method).toBe("PATCH");
    await expect(
      write({ url: `${pulls}/5007/merge`, method: "PUT", body: body({}) }),
    ).rejects.toThrow("refuses");
    expect(token).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  test("takes the token out of GitHub's error, and treats GraphQL errors as refusals", async () => {
    const rest = setup({ status: 401, body: { message: `bad credentials ${secret}` } });
    await expect(
      rest.write({ url: `${pulls}/5007`, method: "PATCH", body: body({ title: "t" }) }),
    ).rejects.toThrow("GitHub answered 401: bad credentials [token].");
    const graph = setup({ status: 200, body: { errors: [{ message: "not allowed" }] } });
    await expect(
      graph.write({
        url: graphql,
        method: "POST",
        body: body({ query: readyDocument, variables: { pullRequestId: "PR_1" } }),
      }),
    ).rejects.toThrow("GitHub answered 200: not allowed.");
  });

  test("only the PR write tools import the write client", () => {
    const src = resolve(dirname(fileURLToPath(import.meta.url)), "..");
    const importers = (readdirSync(src, { recursive: true }) as string[])
      .filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts"))
      .map((file) => relative(src, join(src, file)).replaceAll("\\", "/"))
      .filter((file) => {
        const text = readFileSync(join(src, file), "utf8");
        const local = file.startsWith("pr-write/") && text.includes('from "./write-client.ts"');
        return local || text.includes('pr-write/write-client.ts"');
      })
      .sort();
    expect(importers).toEqual(["plugin/pr-write-tools.ts", "pr-write/write-pr.ts"]);
  });
});
