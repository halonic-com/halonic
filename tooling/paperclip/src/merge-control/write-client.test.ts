import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { verifies } from "@halonicjs/testing-spec";
import { expect, test, vi } from "vitest";
import {
  closeDocument,
  dequeueDocument,
  enqueueDocument,
  type QueueWrite,
  queueWriteClient,
  refusal,
  reopenDocument,
} from "./write-client.ts";

const repo = "halonic-com/halonic";
const secret = "ghs_queue_token_for_tests";

function client(answer: { status: number; body: unknown } = { status: 200, body: { data: {} } }) {
  const fetch = vi.fn(
    async (_url: string, _init: { method: string; body?: string; redirect?: string }) => ({
      ok: answer.status < 300,
      status: answer.status,
      json: async () => answer.body,
    }),
  );
  const token = vi.fn(async () => secret);
  return { fetch, token, client: queueWriteClient({ fetch, token, repos: [repo] }) };
}

const graphql = "https://api.github.com/graphql";
const enqueueBody = JSON.stringify({
  query: enqueueDocument,
  variables: { pullRequestId: "PR_1", expectedHeadOid: "abc", jump: false },
});

verifies("paperclip.merge-control-write-scope", () => {
  test("each allowed write goes to its one address on api.github.com, with the token asked for at each send", async () => {
    const { fetch, token, client: queue } = client();
    const writes: QueueWrite[] = [
      { kind: "enqueue", pullId: "PR_1", head: "abc", jump: true },
      { kind: "dequeue", pullId: "PR_2" },
      { kind: "rerun", repo, runId: 11 },
      { kind: "rerun-failed-jobs", repo, runId: 12 },
      { kind: "cancel-run", repo, runId: 13 },
      { kind: "comment", repo, number: 7, body: "Taken out of the queue." },
      { kind: "close", pullId: "PR_3" },
      { kind: "reopen", pullId: "PR_3" },
    ];
    for (const write of writes) {
      await queue.send(write);
    }
    expect(fetch.mock.calls.map(([url, init]) => `${init.method} ${url}`)).toEqual([
      `POST ${graphql}`,
      `POST ${graphql}`,
      `POST https://api.github.com/repos/${repo}/actions/runs/11/rerun`,
      `POST https://api.github.com/repos/${repo}/actions/runs/12/rerun-failed-jobs`,
      `POST https://api.github.com/repos/${repo}/actions/runs/13/cancel`,
      `POST https://api.github.com/repos/${repo}/issues/7/comments`,
      `POST ${graphql}`,
      `POST ${graphql}`,
    ]);
    expect(JSON.parse(fetch.mock.calls[0]?.[1].body ?? "")).toEqual({
      query: enqueueDocument,
      variables: { pullRequestId: "PR_1", expectedHeadOid: "abc", jump: true },
    });
    expect(JSON.parse(fetch.mock.calls[1]?.[1].body ?? "").query).toBe(dequeueDocument);
    expect(JSON.parse(fetch.mock.calls[6]?.[1].body ?? "")).toEqual({
      query: closeDocument,
      variables: { id: "PR_3" },
    });
    expect(JSON.parse(fetch.mock.calls[7]?.[1].body ?? "")).toEqual({
      query: reopenDocument,
      variables: { id: "PR_3" },
    });
    expect(token).toHaveBeenCalledTimes(writes.length);
  });

  test("a request outside the list or to another host is refused before anything is sent", () => {
    const refused = [
      { url: "https://evil.example/graphql", method: "POST", body: enqueueBody },
      { url: "http://api.github.com/graphql", method: "POST", body: enqueueBody },
      { url: "https://user@api.github.com/graphql", method: "POST", body: enqueueBody },
      { url: graphql, method: "GET" },
      {
        url: graphql,
        method: "POST",
        body: JSON.stringify({
          query:
            'mutation { mergePullRequest(input: { pullRequestId: "PR_1" }) { clientMutationId } }',
        }),
      },
      {
        url: graphql,
        method: "POST",
        body: JSON.stringify({ query: "query { viewer { login } }" }),
      },
      {
        url: graphql,
        method: "POST",
        body: JSON.stringify({
          query: enqueueDocument,
          variables: { pullRequestId: "PR_1", expectedHeadOid: "abc", jump: false, extra: 1 },
        }),
      },
      { url: graphql, method: "POST", body: `${enqueueBody.slice(0, -1)},"operationName":"x"}` },
      { url: `https://api.github.com/repos/${repo}/pulls/7/merge`, method: "PUT" },
      { url: `https://api.github.com/repos/${repo}/pulls/7/update-branch`, method: "POST" },
      { url: `https://api.github.com/repos/${repo}/actions/runs/1/approve`, method: "POST" },
      { url: `https://api.github.com/repos/${repo}/git/refs`, method: "POST" },
      { url: "https://api.github.com/repos/someone/else/issues/7/comments", method: "POST" },
      { url: `https://api.github.com/repos/${repo}/issues/7/comments?x=1`, method: "POST" },
      {
        url: `https://api.github.com/repos/${repo}/actions/runs/1/../../../pulls/7/merge`,
        method: "POST",
      },
      { url: `https://api.github.com/repos/${repo}/actions/runs/1/cancel`, method: "DELETE" },
    ];
    for (const request of refused) {
      expect({ request, refused: refusal(request, [repo]) !== undefined }).toEqual({
        request,
        refused: true,
      });
    }
    expect(refusal({ url: graphql, method: "POST", body: enqueueBody }, [repo])).toBeUndefined();
  });

  test("a write to a repository it doesn't act on sends nothing and never asks for the token", async () => {
    const { fetch, token, client: queue } = client();
    await expect(
      queue.send({ kind: "comment", repo: "someone/else", number: 7, body: "hi" }),
    ).rejects.toThrow("refused a comment write to a repository merge control doesn't act on");
    await expect(queue.send({ kind: "rerun", repo: `${repo}/../x`, runId: 1 })).rejects.toThrow(
      "refused",
    );
    expect(fetch).not.toHaveBeenCalled();
    expect(token).not.toHaveBeenCalled();
  });

  test("a refused write's error has GitHub's reason and never the token", async () => {
    const { client: queue } = client({
      status: 200,
      body: { errors: [{ message: `Bad credentials ${secret}` }] },
    });
    const error = await queue
      .send({ kind: "dequeue", pullId: "PR_2" })
      .catch((caught: Error) => caught);
    expect((error as Error).message).toBe(
      "Merge control: the dequeue write answered 200: Bad credentials [token].",
    );
    const { client: forbidden } = client({
      status: 403,
      body: { message: "Resource not accessible" },
    });
    await expect(forbidden.send({ kind: "cancel-run", repo, runId: 3 })).rejects.toThrow(
      "the cancel-run write answered 403: Resource not accessible.",
    );
  });

  test("only the merge-control job builds the write client: no agent tool reaches it", () => {
    const src = resolve(dirname(fileURLToPath(import.meta.url)), "..");
    const files = readdirSync(src, { recursive: true, encoding: "utf8" }).filter(
      (file) => file.endsWith(".ts") && !file.includes(".test"),
    );
    // Merge control's client only; the branch client has its own check (HAL-18031).
    const importers = files.filter((file) => {
      const text = readFileSync(join(src, file), "utf8");
      const local = file.startsWith("merge-control/") && /from\s+"\.\/write-client\.ts"/.test(text);
      return local || /from\s+"[^"]*merge-control\/write-client\.ts"/.test(text);
    });
    expect(importers.map((file) => relative(src, join(src, file))).sort()).toEqual([
      "merge-control/act.ts",
      "plugin/merge-control-job.ts",
    ]);
  });
});

verifies("paperclip.merge-control-failed-writes", () => {
  test("a write never follows a redirect: a 302 answer is a failed write", async () => {
    const { fetch, client: queue } = client({
      status: 302,
      body: { message: "Moved", location: "https://evil.example/comments" },
    });
    await expect(
      queue.send({ kind: "comment", repo, number: 7, body: "Taken out of the queue." }),
    ).rejects.toThrow("the comment write answered 302: Moved.");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0]?.[1].redirect).toBe("manual");
  });
});
