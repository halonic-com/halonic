import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { company } from "./acme-data.test-helper.ts";
import { connect, FakePaperclip } from "./fake-paperclip.test-helper.ts";
import { paperclipMappingVersion } from "./sync-collections.ts";

const tasksPath = `/api/companies/${company}/issues`;

verifies("agent-host.paperclip-sync", () => {
  describe("the Paperclip provider's sync collections", () => {
    it("read the open tasks once for all four lists, in the port's types", async () => {
      const paperclip = new FakePaperclip().serveAcme();
      const sync = connect(paperclip, { offline: false }).sync();

      const [agents, conversations, inbox, work] = await Promise.all([
        sync.agents.read({ kind: "all" }),
        sync.conversations.read({ kind: "all" }),
        sync.inbox.read({ kind: "all" }),
        sync.work.read({ kind: "all" }),
      ]);

      const taskReads = paperclip.seen.filter(
        (request) => request.path === tasksPath && request.query.get("q") === null,
      );
      expect(taskReads).toHaveLength(1);
      expect(agents.items.length).toBeGreaterThan(0);
      expect(conversations.items.length).toBeGreaterThan(0);
      expect(inbox.items.every((item) => item.source === "paperclip:acme")).toBe(true);
      expect(work).toMatchObject({ kind: "all", removed: [] });
      expect(sync.inbox.mapping).toBe(paperclipMappingVersion);
    });

    it("fail together when Paperclip can't be read, so the store keeps what it had", async () => {
      const paperclip = new FakePaperclip().serveAcme();
      const sync = connect(paperclip, { offline: true }).sync();

      await expect(sync.inbox.read({ kind: "all" })).rejects.toThrow();
    });
  });
});
