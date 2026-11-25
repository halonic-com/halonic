import { verifies } from "@halonicjs/testing-spec";
import { beforeEach, describe, expect, it } from "vitest";
import { agentAda, agentBo, chatTask, company } from "./acme-data.test-helper.ts";
import { connect, FakePaperclip, type Network } from "./fake-paperclip.test-helper.ts";
import { findRequest, paperclipRequests } from "./requests.ts";

const chat = `paperclip:acme:chat:${chatTask}`;
const liveRunsPath = `/api/companies/${company}/live-runs`;
const issueRunsPath = `/api/issues/${chatTask}/runs`;

/** Text a run carries that must never reach a conversation or a message. */
const hidden = { error: "made-up error", stdoutExcerpt: "made-up stdout", nextAction: "made-up" };

/** A run of `agentId` on the chat's task, as `live-runs` and the task's runs list it. */
function run(agentId: string, status: string, extra: Record<string, unknown> = {}) {
  const queued = status === "queued";
  return {
    ...hidden,
    runId: `r-${agentId}-${status}`,
    agentId,
    issueId: chatTask,
    status,
    createdAt: "2026-11-24T10:01:10.000Z",
    startedAt: queued ? null : "2026-11-24T10:01:30.000Z",
    wakeCommentIds: [],
    ...extra,
  };
}

let paperclip: FakePaperclip;
const network: Network = { offline: false };

beforeEach(() => {
  network.offline = false;
  paperclip = new FakePaperclip().serveAcme();
});

const client = () => connect(paperclip, network);

/** The chat as the client lists it, after Paperclip's live runs are `runs`. */
async function chatWith(runs: readonly unknown[]) {
  paperclip.on("GET", liveRunsPath, { body: runs });
  const conversations = await client().listConversations();
  return conversations.find((conversation) => conversation.id === chat);
}

/** The person's message `m1` (sent 10:01) after the chat's runs are `runs`. */
async function myMessageWith(runs: readonly unknown[]) {
  paperclip.on("GET", liveRunsPath, { body: [] }).on("GET", issueRunsPath, { body: runs });
  const messaging = client();
  await messaging.listConversations();
  const messages = await messaging.listMessages(chat);
  return { mine: messages.find((message) => message.author.kind === "me"), messages };
}

verifies("paperclip-client.agent-working", () => {
  describe("agentWorking", () => {
    it("is true while the chat's own agent has a running run on the chat's task", async () => {
      expect((await chatWith([run(agentAda, "running")]))?.agentWorking).toBe(true);
    });

    it("is false for another agent's run on the same task, and for a queued run", async () => {
      expect((await chatWith([run(agentBo, "running")]))?.agentWorking).toBe(false);
      expect((await chatWith([run(agentAda, "queued")]))?.agentWorking).toBe(false);
      expect((await chatWith([]))?.agentWorking).toBe(false);
    });

    it("tells changes readers when the agent's run starts and ends", async () => {
      const runs: unknown[] = [];
      paperclip.on("GET", liveRunsPath, () => ({ body: runs }));
      const messaging = client();
      const changes = messaging.changes()[Symbol.asyncIterator]();
      await messaging.refresh();
      runs.push(run(agentAda, "running"));
      await messaging.refresh();
      expect(await changes.next()).toEqual({ done: false, value: "paperclip:acme" });
      runs.length = 0;
      await messaging.refresh();
      expect(await changes.next()).toEqual({ done: false, value: "paperclip:acme" });
      await changes.return?.();
    });

    it("is left out when Paperclip doesn't answer the live runs, and keeps none of a run's text", async () => {
      paperclip.on("GET", liveRunsPath, { status: 500, body: { error: "made-up error" } });
      const conversation = (await client().listConversations()).find((each) => each.id === chat);
      expect(conversation).toBeDefined();
      expect(conversation).not.toHaveProperty("agentWorking");
      const shown = JSON.stringify(await chatWith([run(agentAda, "running")]));
      for (const text of Object.values(hidden)) expect(shown).not.toContain(text);
    });
  });
});

verifies("paperclip-client.read-receipts", () => {
  describe("readAt", () => {
    it("is the start of the agent's first started run that names the message", async () => {
      const { mine } = await myMessageWith([
        run(agentAda, "succeeded", {
          startedAt: "2026-11-24T10:01:05.000Z",
          wakeCommentIds: ["m1"],
        }),
        run(agentAda, "running", { startedAt: "2026-11-24T10:03:00.000Z" }),
      ]);
      expect(mine?.readAt).toBe("2026-11-24T10:01:05.000Z");
    });

    it("is set by a run that started after the message, which reads the whole thread", async () => {
      const { mine } = await myMessageWith([run(agentAda, "running")]);
      expect(mine?.readAt).toBe("2026-11-24T10:01:30.000Z");
    });

    it("is never set by a queued run, another agent's run, or an earlier run that doesn't name it", async () => {
      const { mine } = await myMessageWith([
        run(agentAda, "queued", { wakeCommentIds: ["m1"] }),
        run(agentBo, "running", { wakeCommentIds: ["m1"] }),
        run(agentAda, "succeeded", { startedAt: "2026-11-24T10:00:10.000Z" }),
      ]);
      expect(mine).toBeDefined();
      expect(mine).not.toHaveProperty("readAt");
    });

    it("is only on the person's own messages, and keeps none of a run's text", async () => {
      const { messages } = await myMessageWith([run(agentAda, "running")]);
      const agents = messages.filter((message) => message.author.kind === "agent");
      expect(agents.length).toBeGreaterThan(0);
      for (const message of agents) expect(message).not.toHaveProperty("readAt");
      for (const text of Object.values(hidden))
        expect(JSON.stringify(messages)).not.toContain(text);
    });

    it("is left out when Paperclip doesn't answer the task's runs", async () => {
      paperclip.on("GET", issueRunsPath, { status: 403, body: { error: "made-up error" } });
      const messaging = client();
      await messaging.listConversations();
      const mine = (await messaging.listMessages(chat)).find((each) => each.author.kind === "me");
      expect(mine).toBeDefined();
      expect(mine).not.toHaveProperty("readAt");
    });

    it("reads only GET /api/issues/:task/runs, never a run's log or events", async () => {
      expect(paperclipRequests.listIssueRuns).toEqual({
        method: "GET",
        path: "/api/issues/:task/runs",
      });
      expect(findRequest("GET", issueRunsPath)).toBe("listIssueRuns");
      expect(findRequest("GET", `${issueRunsPath}/r-1/log`)).toBeUndefined();
      expect(findRequest("POST", issueRunsPath)).toBeUndefined();
    });
  });
});
