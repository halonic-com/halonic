import { inboxItemFits } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { beforeEach, describe, expect, it } from "vitest";
import { acmeData, agentAda, company, me, plainTask } from "./acme-data.test-helper.ts";
import {
  connect,
  type FakeAnswer,
  FakePaperclip,
  type Network,
  sourceId,
} from "./fake-paperclip.test-helper.ts";

let paperclip: FakePaperclip;
let warnings: string[];
const network: Network = { offline: false };
const mentionsRoute = "/api/plugins/halonic.agent-tools/api/board/mentions";
const taskPage = "https://paperclip.acme.test/ACME/issues/ACME-7";

/** Ada's comment on ACME-7 that picks the board in Paperclip's mention picker, as the route sends it. */
function adasMention(fields: object = {}) {
  return {
    commentId: "c-1",
    taskId: plainTask,
    identifier: "ACME-7",
    title: "Pick a launch date",
    body: `[Board](user://${me}) can you pick the date?\n\nFriday or Monday.\nThe shop opens at 9.\nMore detail.`,
    authorAgentId: agentAda,
    authorUserId: null,
    createdAt: "2026-11-24T10:05:00.000Z",
    repliedAt: null,
    ...fields,
  };
}

/** Serves Acme, with `tasks` as its open tasks when given, and the mentions route answering `route`. */
function serve(route: FakeAnswer, tasks = acmeData().tasks) {
  paperclip.serveAcme({ ...acmeData(), tasks }).on("GET", mentionsRoute, route);
}

async function inbox() {
  return connect(paperclip, network, (message) => warnings.push(message)).listInboxItems();
}

async function comments() {
  return (await inbox()).filter((item) => item.kind === "comment");
}

beforeEach(() => {
  network.offline = false;
  paperclip = new FakePaperclip();
  warnings = [];
});

verifies("paperclip-client.board-mentions", () => {
  describe("comments that mention the board", () => {
    it("are one comment item each, from the author, answered on the task's page", async () => {
      serve({ body: { mentions: [adasMention()] } });
      const [item, ...others] = await comments();
      expect(others).toEqual([]);
      expect(item).toMatchObject({
        id: `${sourceId}:comment:${plainTask}:c-1`,
        kind: "comment",
        from: { kind: "agent", name: "Ada" },
        answerElsewhere: { link: taskPage },
        webLink: { link: taskPage, site: "Paperclip" },
        work: `${sourceId}:task:${plainTask}`,
        project: { name: "Website" },
        createdAt: "2026-11-24T10:05:00.000Z",
        state: { kind: "open" },
      });
      expect(item?.question).toBe(
        `Pick a launch date\n\n[Board](user://${me}) can you pick the date?\nFriday or Monday.\nThe shop opens at 9.…`,
      );
      expect(item !== undefined && inboxItemFits(item)).toBe(true);
      const read = paperclip.seen.find((request) => request.path === mentionsRoute);
      expect(read?.query.get("companyId")).toBe(company);
      expect(read?.query.get("since")).toBe("2026-11-10T10:10:00.000Z");
      expect(warnings).toEqual([]);
    });

    it("are gone once the board commented on the task after them, or the task closed", async () => {
      serve({ body: { mentions: [adasMention({ repliedAt: "2026-11-24T10:06:00.000Z" })] } });
      expect(await comments()).toEqual([]);
      paperclip = new FakePaperclip();
      serve({ body: { mentions: [adasMention({ repliedAt: "2026-11-24T10:01:00.000Z" })] } });
      expect(await comments()).toHaveLength(1);
      paperclip = new FakePaperclip();
      const open = acmeData().tasks.filter((task) => task.id !== plainTask);
      serve({ body: { mentions: [adasMention()] } }, open);
      expect(await comments()).toEqual([]);
    });

    it("are gone after 14 days", async () => {
      serve({ body: { mentions: [adasMention({ createdAt: "2026-11-10T10:09:00.000Z" })] } });
      expect(await comments()).toEqual([]);
    });

    it("come only from the route: a comment that names the board in its text is no item", async () => {
      const text = { id: "c-2", body: "Board, can you look?", authorAgentId: agentAda };
      serve({ body: { mentions: [] } });
      paperclip.on("GET", `/api/issues/${plainTask}/comments`, { body: [text] });
      expect(await comments()).toEqual([]);
    });

    it("report a failed route read, and the Inbox still shows its other items", async () => {
      serve({ status: 500, body: { error: "boom" } });
      const items = await inbox();
      expect(items.map((item) => item.kind)).toContain("approval");
      expect(items.some((item) => item.kind === "comment")).toBe(false);
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain("mention");
    });
  });
});
