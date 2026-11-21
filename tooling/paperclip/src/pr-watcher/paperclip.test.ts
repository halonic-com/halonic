import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import { paperclipClient } from "./paperclip.ts";

interface Sent {
  readonly method: string;
  readonly path: string;
  readonly headers: Record<string, string>;
  readonly body: unknown;
}

/** A Paperclip API that answers from `routes` ("GET /api/…") and records what it got. */
function fakeApi(routes: Record<string, unknown>) {
  const sent: Sent[] = [];
  const client = paperclipClient({
    apiUrl: "http://paperclip.test/api/",
    apiKey: "watcher-key",
    companyId: "acme",
    runId: "run-1",
    fetch: async (url, init) => {
      const { pathname, search } = new URL(url);
      const key = `${init.method} ${pathname}${search}`;
      sent.push({
        method: init.method,
        path: pathname + search,
        headers: init.headers,
        body: init.body === undefined ? undefined : JSON.parse(init.body),
      });
      const answer = routes[key];
      return {
        ok: answer !== undefined,
        status: answer === undefined ? 404 : 200,
        json: async () => answer,
      };
    },
  });
  return { client, sent };
}

const taskList = "GET /api/companies/acme/issues?status=todo,in_progress,in_review&limit=500";

verifies("paperclip.pr-watcher-wake", () => {
  test("reads open tasks page by page and marks the ones with a run", async () => {
    const full = Array.from({ length: 500 }, (_, index) => ({
      id: `t${index}`,
      identifier: `HAL-${index}`,
      assigneeAgentId: null,
    }));
    const { client } = fakeApi({
      [`${taskList}&offset=0`]: full,
      [`${taskList}&offset=500`]: [
        { id: "t500", identifier: "HAL-500", assigneeAgentId: "a", activeRun: { id: "r" } },
      ],
    });
    const tasks = await client.openTasks();
    expect(tasks).toHaveLength(501);
    expect(tasks.at(-1)).toEqual({
      id: "t500",
      identifier: "HAL-500",
      assigneeAgentId: "a",
      running: true,
    });
    expect(tasks[0]?.running).toBe(false);
  });

  test("keeps only pull request links among a task's work products", async () => {
    const { client } = fakeApi({
      "GET /api/issues/t1/work-products": [
        { type: "pull_request", url: "https://github.com/acme/tools/pull/7" },
        { type: "artifact", url: null },
        { type: "pull_request", url: null },
      ],
    });
    expect(await client.pullLinks("t1")).toEqual(["https://github.com/acme/tools/pull/7"]);
  });

  test("comments and marks done with its own key and the run id", async () => {
    const { client, sent } = fakeApi({
      "POST /api/issues/t1/comments": {},
      "PATCH /api/issues/t1": {},
    });
    await client.comment("t1", "Hello");
    await client.markDone("t1", "Done");
    expect(sent.map(({ method, path, body }) => ({ method, path, body }))).toEqual([
      { method: "POST", path: "/api/issues/t1/comments", body: { body: "Hello" } },
      { method: "PATCH", path: "/api/issues/t1", body: { status: "done", comment: "Done" } },
    ]);
    expect(sent[0]?.headers["authorization"]).toBe("Bearer watcher-key");
    expect(sent[0]?.headers["x-paperclip-run-id"]).toBe("run-1");
  });

  test("says which call failed", async () => {
    const { client } = fakeApi({});
    await expect(client.agents()).rejects.toThrow(
      "Paperclip: GET /api/companies/acme/agents answered 404.",
    );
    await expect(client.comments("t1")).rejects.toThrow("answered 404");
  });
});
