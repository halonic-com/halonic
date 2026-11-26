import { isConnectorToolError } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { beforeEach, describe, expect, it } from "vitest";
import { agentAda, company, plainTask, testKey } from "./acme-data.test-helper.ts";
import { FakePaperclip, type Network } from "./fake-paperclip.test-helper.ts";
import { paperclipRequests } from "./requests.ts";
import { PaperclipTaskTools } from "./task-tools.ts";
import type { PaperclipTasksOptions } from "./tasks.ts";

const passPath = "/api/plugins/halonic.agent-tools/api/pr-watcher/pass";
const taskPath = `/api/issues/${plainTask}`;
const pass = { at: "2026-11-26T09:00:00.000Z", input: { prs: [12] }, actions: [] };
const wakeAda = { task: plainTask, agent: agentAda, comment: "ci-ok is red on #12." };

let paperclip: FakePaperclip;
const network: Network = { offline: false };

beforeEach(() => {
  network.offline = false;
  paperclip = new FakePaperclip()
    .on("GET", passPath, { body: pass })
    .on("GET", taskPath, { body: { id: plainTask, companyId: company, status: "in_progress" } })
    .on("PATCH", taskPath, ({ body }) => ({
      body: { id: plainTask, companyId: company, ...(body as object) },
    }));
});

const connection = (): PaperclipTasksOptions => ({
  address: paperclip.address,
  key: testKey,
  company,
  fetch: (input, init) =>
    network.offline ? Promise.reject(new TypeError("fetch failed")) : paperclip.fetch(input, init),
});

function tools(options: { signedIn?: boolean; trusted?: boolean } = {}): PaperclipTaskTools {
  const { signedIn = true, trusted = true } = options;
  return new PaperclipTaskTools({
    id: "paperclip",
    open: async () => (signedIn ? connection() : undefined),
    trusted,
  });
}

/** The method and path of every request the fake saw. */
const requests = () => paperclip.seen.map((request) => `${request.method} ${request.path}`);

async function toolText(call: Promise<unknown>): Promise<string> {
  const error = await call.then(
    () => undefined,
    (thrown: unknown) => thrown,
  );
  if (!isConnectorToolError(error)) throw new Error(`Not a tool error: ${String(error)}`);
  return error.toolText;
}

verifies("paperclip-client.task-tools", () => {
  it("adds one read row, the plugin's pass, to the request list", () => {
    expect(paperclipRequests.prWatcherPass).toEqual({ method: "GET", path: passPath });
  });

  it("lists the pass as a read and the two task writes as writes", async () => {
    const listed = await tools().listTools();
    expect(listed.map(({ name, risk }) => [name, risk])).toEqual([
      ["pr-watcher-pass", "read"],
      ["wake", "write"],
      ["finish", "write"],
    ]);
  });

  it("reads the pass for the connection's company and answers its JSON", async () => {
    const answer = await tools().callTool("pr-watcher-pass", {});
    expect(JSON.parse(answer)).toEqual(pass);
    expect(requests()).toEqual([`GET ${passPath}`]);
    expect(paperclip.seen[0]?.query.get("companyId")).toBe(company);
  });

  it("wakes through the task read and one update, and answers the task's status", async () => {
    const answer = await tools().callTool("wake", wakeAda, { idempotencyKey: "run_1:c1" });
    expect(JSON.parse(answer)).toEqual({ task: plainTask, status: "todo" });
    expect(requests()).toEqual([`GET ${taskPath}`, `PATCH ${taskPath}`]);
  });

  it("finishes a task with its comment", async () => {
    await tools().callTool("finish", { task: plainTask, comment: "Merged." });
    expect(paperclip.seen.at(-1)?.body).toEqual({ status: "done", comment: "Merged." });
  });

  it("fails as signed-out and sends nothing when no key is stored", async () => {
    expect(await toolText(tools({ signedIn: false }).callTool("wake", wakeAda))).toBe("signed-out");
    expect(await toolText(tools({ signedIn: false }).callTool("pr-watcher-pass", {}))).toBe(
      "signed-out",
    );
    expect(paperclip.seen).toEqual([]);
  });

  it("says why a write was refused: a 401 is signed-out", async () => {
    paperclip.on("GET", taskPath, { status: 401, body: {} });
    expect(await toolText(tools().callTool("finish", { task: plainTask, comment: "x" }))).toBe(
      "signed-out",
    );
    expect(requests()).toEqual([`GET ${taskPath}`]);
  });

  it("refuses a write's arguments that aren't text, and an unknown tool, sending nothing", async () => {
    expect(await toolText(tools().callTool("wake", { ...wakeAda, agent: 7 }))).toContain(
      "no such tool",
    );
    expect(await toolText(tools().callTool("delete", wakeAda))).toContain("no such tool");
    expect(paperclip.seen).toEqual([]);
  });

  describe("an untrusted workspace", () => {
    it("lists and reads only the pass, and writes nothing", async () => {
      const untrusted = tools({ trusted: false });
      expect((await untrusted.listTools()).map((tool) => tool.name)).toEqual(["pr-watcher-pass"]);
      expect(await toolText(untrusted.callTool("wake", wakeAda))).toContain("isn't trusted");
      expect(paperclip.seen).toEqual([]);
    });
  });

  describe("a write that may or may not have landed", () => {
    it("fails offline as an error a person retries, never as a tool error", async () => {
      network.offline = true;
      const call = tools().callTool("wake", wakeAda, { idempotencyKey: "run_1:c1" });
      await expect(call).rejects.toThrow(/couldn't be reached/);
      await expect(call).rejects.not.toSatisfy(isConnectorToolError);
    });

    it("reads the task before a retry and doesn't send again when it already shows the wake", async () => {
      const client = tools();
      paperclip.on("PATCH", taskPath, { body: {} });
      await expect(
        client.callTool("wake", wakeAda, { idempotencyKey: "run_1:c1" }),
      ).rejects.toThrow();
      paperclip.seen.length = 0;
      paperclip.on("GET", taskPath, {
        body: { id: plainTask, companyId: company, status: "todo", assigneeAgentId: agentAda },
      });
      const answer = await client.callTool("wake", wakeAda, { idempotencyKey: "run_1:c1" });
      expect(JSON.parse(answer)).toEqual({ task: plainTask, status: "todo" });
      expect(requests()).toEqual([`GET ${taskPath}`]);
    });

    it("sends the retry when the task doesn't show the change", async () => {
      const client = tools();
      network.offline = true;
      await expect(
        client.callTool("finish", { task: plainTask, comment: "x" }, { idempotencyKey: "k" }),
      ).rejects.toThrow();
      network.offline = false;
      await client.callTool("finish", { task: plainTask, comment: "x" }, { idempotencyKey: "k" });
      expect(requests()).toEqual([`GET ${taskPath}`, `GET ${taskPath}`, `PATCH ${taskPath}`]);
    });
  });
});
