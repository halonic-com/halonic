import { verifies } from "@halonicjs/testing-spec";
import { beforeEach, describe, expect, it } from "vitest";
import { acmeData, chatTask, company, me, plainTask, testKey } from "./acme-data.test-helper.ts";
import { PaperclipMessaging } from "./client.ts";
import { FakePaperclip, sourceId as source } from "./fake-paperclip.test-helper.ts";
import { matchesRequest, paperclipRequests } from "./requests.ts";

const plannerAgent = "a0000000-0000-4000-8000-000000000003";

let paperclip: FakePaperclip;
/** Every URL the client fetched, as it went out. */
let fetched: URL[];

beforeEach(() => {
  paperclip = new FakePaperclip();
  fetched = [];
  const data = acmeData();
  data.agents.push({ id: plannerAgent, name: "Launch Planner", title: null, status: "idle" });
  paperclip.serveAcme(data);
});

function client(): PaperclipMessaging {
  return new PaperclipMessaging({
    address: paperclip.address,
    key: testKey,
    connection: "acme",
    company,
    label: "Paperclip · Acme",
    userId: me,
    fetch: (input, init) => {
      fetched.push(new URL(input instanceof Request ? input.url : input));
      return paperclip.fetch(input, init);
    },
  });
}

verifies("ports.agent-messaging", () => {
  describe("search", () => {
    it("finds a task through Paperclip's issue search as work, and an agent by name", async () => {
      const hits = await client().search("  launch ");
      expect(hits).toEqual([
        {
          kind: "agent",
          id: `${source}:agent:${plannerAgent}`,
          source,
          title: "Launch Planner",
          excerpt: "Launch Planner",
        },
        {
          kind: "work",
          id: `${source}:task:${plainTask}`,
          source,
          title: "Pick a launch date",
          excerpt: "Pick a launch date",
        },
      ]);
      const search = paperclip.seen.find((request) => request.query.has("q"));
      expect(search?.path).toBe(`/api/companies/${company}/issues`);
      expect(search?.query.get("q")).toBe("launch");
    });

    it("gives a chat task Paperclip matched as its conversation, once", async () => {
      const hits = await client().search("chat with");
      expect(hits.map((hit) => [hit.kind, hit.id])).toEqual([
        ["conversation", `${source}:chat:${chatTask}`],
      ]);
    });

    it("matches the Inbox as last read, without reading cards again", async () => {
      const messaging = client();
      await messaging.listInboxItems();
      paperclip.seen.length = 0;
      const hits = await messaging.search("friday");
      expect(hits.map((hit) => hit.kind)).toEqual(["inbox-item"]);
      expect(paperclip.seen.some((request) => request.path.endsWith("/interactions"))).toBe(false);
    });

    it("makes no request for an empty or blank query", async () => {
      const messaging = client();
      expect(await messaging.search("")).toEqual([]);
      expect(await messaging.search("   ")).toEqual([]);
      expect(fetched).toEqual([]);
    });
  });
});

verifies("agent-host.paperclip-key", () => {
  describe("search's requests", () => {
    it("go only to the connection's host and company", async () => {
      await client().search("launch");
      expect(fetched.length).toBeGreaterThan(0);
      for (const url of fetched) {
        expect(url.origin).toBe(paperclip.address);
        expect(url.pathname.startsWith(`/api/companies/${company}/`)).toBe(true);
      }
    });

    it("are on the fixed list, which gained only searchTasks", async () => {
      await client().search("launch");
      const search = paperclip.seen.find((request) => request.query.has("q"));
      expect(matchesRequest("searchTasks", "GET", search?.path ?? "")).toBe(true);
      expect(paperclipRequests.searchTasks).toEqual(paperclipRequests.listTasks);
      expect(Object.keys(paperclipRequests)).toEqual([
        "listAgents",
        "listTasks",
        "searchTasks",
        "listChats",
        "listProjects",
        "listComments",
        "listTaskCards",
        "listApprovals",
        "getApproval",
        "listApprovalTasks",
        "commentOnChat",
        "acceptCard",
        "rejectCard",
        "respondToCard",
        "approve",
        "rejectApproval",
        // Request changes (HAL-18872), pinned in approval-fields.test.ts.
        "requestApprovalRevision",
        "whoAmI",
        "revokeKey",
        // TeamStatus's reads (HAL-17606), pinned in team-requests.test.ts.
        "spendSummary",
        "spendByProvider",
        "spendByAgent",
        "spendByAgentModel",
        "budgetsOverview",
        "seatsSummary",
        // Pull requests and the merge queue (HAL-17681), pinned in team-pulls.test.ts.
        "pullRequestsSummary",
        "pullRequestDetail",
        // Workflow task writes (HAL-17975), pinned in tasks.test.ts.
        "getTask",
        "wakeTask",
        "finishTask",
        // Stepper requests (HAL-17536), pinned in stepper-requests.test.ts.
        "readStepperRequest",
        "latestStepperRequest",
        "writeStepperResult",
        // Channels (HAL-17637), pinned in channels.test.ts.
        "commentOnChannel",
        "createChildTask",
        // Starting a channel and its members (HAL-18121), pinned in channel-members.test.ts.
        "listLabels",
        "createChannelLabel",
        "createChannel",
        "updateChannel",
        // Channel work lines (HAL-18120), pinned in channel-work.test.ts.
        "listTaskActivity",
        // Full answers (HAL-18756), pinned in full-answers.test.ts.
        "readFullAnswer",
        "readAgentAvatar",
        // Runs (HAL-18650), pinned in team-runs.test.ts; run control (HAL-18695) in run-control.test.ts.
        "listLiveRuns",
        "listRuns",
        "getRun",
        "cancelRun",
        "createFeedbackTask",
        "listTaskAttachments",
        "attachScreenshot",
        // Read receipts (HAL-18772), pinned in chat-signals.test.ts.
        "listIssueRuns",
      ]);
    });
  });
});
