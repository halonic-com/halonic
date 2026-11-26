import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { acmeData, agentBo, chatTask, plainTask } from "./acme-data.test-helper.ts";
import { cardToItem } from "./cards.ts";
import { connect, FakePaperclip, sourceId as source } from "./fake-paperclip.test-helper.ts";
import { withFullLinks } from "./full-links.ts";
import { PaperclipIds } from "./ids.ts";
import type { MapContext } from "./map.ts";

const origin = "https://paperclip.acme.test";
const approvalId = "3f1c2b6a-8d4e-4f5a-9b7c-1e2d3c4b5a69";

/** `markdown` as the connector hands it to Studio. */
const full = (markdown: string) => withFullLinks(markdown, origin);

verifies("paperclip-client.full-links", () => {
  describe("links from the root of Paperclip", () => {
    it("become full addresses for a task, an approval and an agent", () => {
      expect(full("See [ACME-8](/ACME/issues/ACME-8).")).toBe(
        `See [ACME-8](${origin}/ACME/issues/ACME-8).`,
      );
      expect(full(`[Approve](/ACME/approvals/${approvalId})`)).toBe(
        `[Approve](${origin}/ACME/approvals/${approvalId})`,
      );
      expect(full("Ask [Ada](/ACME/agents/ada) or [plan](/ACME/issues/ACME-9#document-plan)")).toBe(
        `Ask [Ada](${origin}/ACME/agents/ada) or [plan](${origin}/ACME/issues/ACME-9#document-plan)`,
      );
    });

    it("keep a link title", () => {
      expect(full('[ACME-8](/ACME/issues/ACME-8 "the launch")')).toBe(
        `[ACME-8](${origin}/ACME/issues/ACME-8 "the launch")`,
      );
    });
  });

  describe("everything else stays as written", () => {
    it("leaves full addresses, other hosts and schemes alone", () => {
      for (const markdown of [
        "[docs](https://docs.acme.test/start)",
        "[evil](//evil.example/ACME/issues/ACME-8)",
        "[evil](/\\evil.example/ACME)",
        "[click](javascript:alert(1))",
        "[relative](ACME/issues/ACME-8)",
        "a plain /ACME/issues/ACME-8 path",
      ]) {
        expect(full(markdown), markdown).toBe(markdown);
      }
    });

    it("leaves links in code spans and code blocks alone", () => {
      const markdown = [
        "Write `[ACME-8](/ACME/issues/ACME-8)` or ``[a](/ACME/agents/ada)``, then [go](/ACME/issues/ACME-8).",
        "```md",
        "[ACME-8](/ACME/issues/ACME-8)",
        "~~~",
        "```",
        "~~~~",
        "[ACME-9](/ACME/issues/ACME-9)",
        "~~~~",
        "[ACME-10](/ACME/issues/ACME-10)",
      ].join("\n");
      expect(full(markdown)).toBe(
        [
          `Write \`[ACME-8](/ACME/issues/ACME-8)\` or \`\`[a](/ACME/agents/ada)\`\`, then [go](${origin}/ACME/issues/ACME-8).`,
          "```md",
          "[ACME-8](/ACME/issues/ACME-8)",
          "~~~",
          "```",
          "~~~~",
          "[ACME-9](/ACME/issues/ACME-9)",
          "~~~~",
          `[ACME-10](${origin}/ACME/issues/ACME-10)`,
        ].join("\n"),
      );
    });
  });

  describe("what the connector hands to Studio", () => {
    it("has full links in a chat's messages", async () => {
      const data = acmeData();
      const comments = data.comments.map((comment) =>
        comment.id === "m2" ? { ...comment, body: "Done: [ACME-7](/ACME/issues/ACME-7)" } : comment,
      );
      const paperclip = new FakePaperclip().serveAcme({ ...data, comments });
      const messages = await connect(paperclip, { offline: false }).listMessages(
        `${source}:chat:${chatTask}`,
      );
      expect(messages.map((message) => message.body)).toContain(
        `Done: [ACME-7](${origin}/ACME/issues/ACME-7)`,
      );
    });

    it("has full links in a card's question", () => {
      const context: MapContext = { ids: new PaperclipIds("acme"), agentNames: new Map(), origin };
      const card = {
        id: "c1",
        kind: "request_confirmation",
        status: "pending",
        createdByAgentId: agentBo,
        payload: { version: 1, prompt: "Ship [ACME-7](/ACME/issues/ACME-7)?" },
        createdAt: "2026-11-24T10:00:00.000Z",
      };
      expect(cardToItem(context, plainTask, card)?.question).toBe(
        `Ship [ACME-7](${origin}/ACME/issues/ACME-7)?`,
      );
    });
  });
});
