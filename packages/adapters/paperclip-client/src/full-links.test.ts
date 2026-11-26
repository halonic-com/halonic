import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { acmeData, agentBo, chatTask, plainTask } from "./acme-data.test-helper.ts";
import { approvalToItem, cardToItem } from "./cards.ts";
import { decisionToItem } from "./decisions.ts";
import { connect, FakePaperclip, sourceId as source } from "./fake-paperclip.test-helper.ts";
import { withFullLinks } from "./full-links.ts";
import { PaperclipIds } from "./ids.ts";
import type { MapContext } from "./map.ts";

const origin = "https://paperclip.acme.test";
const approvalId = "3f1c2b6a-8d4e-4f5a-9b7c-1e2d3c4b5a69";

/** `markdown` as the connector hands it to Studio. */
const full = (markdown: string) => withFullLinks(markdown, origin);

const context: MapContext = { ids: new PaperclipIds("acme"), agentNames: new Map(), origin };

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

    it("keep a `$` in the origin as written", () => {
      expect(withFullLinks("[ACME-8](/ACME/issues/ACME-8)", "https://a$1b.test:8443")).toBe(
        "[ACME-8](https://a$1b.test:8443/ACME/issues/ACME-8)",
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

  describe("long or odd text", () => {
    it("leaves a code span that wraps onto the next line alone", () => {
      const markdown = "Write `[ACME-8](/ACME/issues/ACME-8)\n[a](/ACME/agents/ada)` here.";
      expect(full(markdown)).toBe(markdown);
    });

    it("reads a 100 KB message with runs of backticks that never close quickly", () => {
      const longRun = `x${"`".repeat(100_000)} [go](/ACME/issues/ACME-8)`;
      const manyRuns = `${"x `` y ` ".repeat(10_000)}[go](/ACME/issues/ACME-8)`;
      const started = performance.now();
      expect(full(longRun)).toContain(`[go](${origin}/ACME/issues/ACME-8)`);
      expect(full(manyRuns)).toContain(`[go](${origin}/ACME/issues/ACME-8)`);
      expect(performance.now() - started).toBeLessThan(1_000);
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

    it("has a full link to a confirmation's document", () => {
      const card = {
        id: "c2",
        kind: "request_confirmation",
        status: "pending",
        createdByAgentId: agentBo,
        payload: {
          version: 1,
          prompt: "Go ahead?",
          target: {
            type: "issue_document",
            key: "plan",
            label: "Plan",
            href: "/ACME/issues/ACME-7#document-plan",
          },
        },
        createdAt: "2026-11-24T10:00:00.000Z",
      };
      expect(cardToItem(context, plainTask, card)?.question).toBe(
        `Go ahead?\n\nDocument: [Plan](${origin}/ACME/issues/ACME-7#document-plan)`,
      );
    });

    it("has full links in an approval's and a decision's question", () => {
      const approval = {
        id: approvalId,
        type: "hire_agent",
        status: "pending",
        requestedByAgentId: agentBo,
        payload: { summary: "For [ACME-7](/ACME/issues/ACME-7)" },
        createdAt: "2026-11-24T10:00:00.000Z",
      };
      expect(approvalToItem(context, approval, undefined)?.question).toContain(
        `For [ACME-7](${origin}/ACME/issues/ACME-7)`,
      );
      const decision = {
        id: "d1",
        status: "open",
        title: "Which one?",
        body: "See [ACME-7](/ACME/issues/ACME-7)",
        options: [{ id: "a", label: "A" }],
        createdAt: "2026-11-24T10:00:00.000Z",
      };
      expect(decisionToItem(context, decision)?.question).toBe(
        `Which one?\n\nSee [ACME-7](${origin}/ACME/issues/ACME-7)`,
      );
    });
  });
});
