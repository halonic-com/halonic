import { type InboxItem, inboxItemFits } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { beforeEach, describe, expect, it } from "vitest";
import {
  acmeData,
  agentAda,
  agentBo,
  chatTask,
  company,
  me,
  plainTask,
  testKey,
  websiteProject,
} from "./acme-data.test-helper.ts";
import { channelMembersLine } from "./channels.ts";
import { PaperclipMessaging } from "./client.ts";
import {
  asListed,
  connect,
  FakePaperclip,
  sourceId as source,
  testNow,
} from "./fake-paperclip.test-helper.ts";

const boardTask = "i0000000-0000-4000-8000-000000000003";
const boardTaskItem = `${source}:task:${boardTask}`;

/** Acme's task for the board: Ada asks the person to choose the launch photos. */
function photosTask(overrides: Record<string, unknown> = {}) {
  return {
    id: boardTask,
    identifier: "ACME-9",
    projectId: websiteProject,
    title: "Choose the launch photos",
    description: "Three sets are in the shared folder.\n\nPick one.\nThe others go.\nThanks!",
    status: "todo",
    assigneeUserId: me,
    createdByAgentId: agentAda,
    createdAt: "2026-11-23T09:00:00.000Z",
    updatedAt: "2026-11-24T10:06:00.000Z",
    ...overrides,
  };
}

let paperclip: FakePaperclip;

/**
 * Serves Acme with `tasks` added to its open tasks, each read whole on its own route, and `plain`
 * changed on its task (the plain task with its cards). Acme's own tasks keep their routes.
 */
function serve(
  tasks: Record<string, unknown>[],
  plain: Record<string, unknown> = {},
  data = acmeData(),
): void {
  const listed = [{ ...data.tasks[0], ...plain }, ...data.tasks.slice(1), ...tasks];
  paperclip.serveAcme(data).on("GET", `/api/companies/${company}/issues`, ({ query }) => ({
    body: asListed(listed, query),
  }));
  for (const task of [...tasks, listed[0] ?? {}]) {
    const id = String(task["id"]);
    paperclip.on("GET", `/api/issues/${id}`, { body: task });
    if (id !== plainTask && id !== chatTask) {
      paperclip.on("GET", `/api/issues/${id}/interactions`, { body: [] });
    }
  }
}

/** The inbox items of kind `task`, as the signed-in person reads them. */
async function taskItems(): Promise<InboxItem[]> {
  const items = await connect(paperclip, { offline: false }).listInboxItems();
  return items.filter((item) => item.kind === "task");
}

/** The provider as a host that names no user makes it, such as the server engine. */
function withoutUser(): PaperclipMessaging {
  return new PaperclipMessaging({
    address: paperclip.address,
    key: testKey,
    connection: "acme",
    company,
    label: "Paperclip · Acme",
    now: () => testNow,
    fetch: paperclip.fetch,
  });
}

beforeEach(() => {
  paperclip = new FakePaperclip();
});

verifies("paperclip-client.board-tasks", () => {
  describe("a task assigned to the signed-in person", () => {
    it("is one task item from the agent that made it, answered on its page in Paperclip", async () => {
      serve([photosTask()]);
      const items = await taskItems();

      expect(items).toHaveLength(1);
      const [item] = items;
      expect(item).toMatchObject({
        id: boardTaskItem,
        kind: "task",
        from: { kind: "agent", agent: `${source}:agent:${agentAda}`, name: "Ada" },
        answerElsewhere: { link: "https://paperclip.acme.test/ACME/issues/ACME-9" },
        webLink: { link: "https://paperclip.acme.test/ACME/issues/ACME-9", site: "Paperclip" },
        project: { id: `${source}:project:${websiteProject}`, name: "Website" },
        options: [],
        // The task's creation, not its last change, so a comment doesn't reset the wait.
        createdAt: "2026-11-23T09:00:00.000Z",
        state: { kind: "open" },
      });
      expect(item?.question).toBe(
        "Choose the launch photos\n\nThree sets are in the shared folder.\nPick one.\nThe others go.\n\n…",
      );
      expect(item !== undefined && inboxItemFits(item)).toBe(true);
    });

    it("comes from the person who made it when no agent did", async () => {
      serve([photosTask({ createdByAgentId: null, createdByUserId: "u-acme-sam" })]);
      const [item] = await taskItems();
      expect(item?.from).toEqual({ kind: "person", name: "Board" });
    });

    it("shows only its card when a card on it waits on the person", async () => {
      // No approval, so only the cards can hide the task's own item.
      const data = { ...acmeData(), approvals: [] };
      serve([], { assigneeUserId: me, assigneeAgentId: null }, data);
      const items = await connect(paperclip, { offline: false }).listInboxItems();

      expect(items.filter((item) => item.kind === "task")).toEqual([]);
      expect(items.length).toBeGreaterThan(0);
      expect(items.every((item) => item.work === `${source}:task:${plainTask}`)).toBe(true);
    });

    it("shows only its approval when an approval on it waits on the person", async () => {
      const data = { ...acmeData(), cards: [] };
      serve([], { assigneeUserId: me, assigneeAgentId: null }, data);
      const items = await connect(paperclip, { offline: false }).listInboxItems();

      expect(items.filter((item) => item.kind === "task")).toEqual([]);
      expect(items.map((item) => item.kind)).toEqual(["approval"]);
    });

    it("lists the person's task on the first read when the host names no user", async () => {
      serve([photosTask()]);
      paperclip.on("GET", "/api/cli-auth/me", { body: { userId: me } });
      const items = await withoutUser().listInboxItems();

      expect(items.filter((item) => item.kind === "task").map((item) => item.id)).toEqual([
        boardTaskItem,
      ]);
    });
  });

  describe("tasks that aren't for the person", () => {
    it("lists none for another person's task, a closed task, a chat or a channel", async () => {
      const channel = photosTask({
        id: "i0000000-0000-4000-8000-000000000004",
        identifier: "ACME-10",
        title: "Engineering",
        labels: [{ name: "channel" }],
        createdByAgentId: null,
        createdByUserId: me,
        description: `A channel.\n\n${channelMembersLine([agentAda, agentBo], agentAda)}`,
      });
      const chat = { ...acmeData().tasks[1], assigneeUserId: me, conversationAgentId: agentAda };
      serve([
        photosTask({ assigneeUserId: "u-acme-sam" }),
        photosTask({ id: "i0000000-0000-4000-8000-000000000005", status: "done" }),
        channel,
        chat,
      ]);

      expect(await taskItems()).toEqual([]);
    });

    it("lists none while the provider doesn't know who is signed in", async () => {
      serve([photosTask()]);
      // No user named, and Paperclip names none: an agent's key, or a server without `whoAmI`.
      const items = await withoutUser().listInboxItems();

      expect(items.filter((item) => item.kind === "task")).toEqual([]);
    });
  });
});
