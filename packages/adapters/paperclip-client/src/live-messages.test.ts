import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { company } from "./acme-data.test-helper.ts";
import { liveMessageOf } from "./live-messages.ts";

const createdAt = "2026-11-26T08:00:00.000Z";

/** An `activity.logged` of Acme's company with `payload`. */
function activity(payload: unknown): unknown {
  return { type: "activity.logged", companyId: company, createdAt, payload };
}

verifies("paperclip-client.live-events", () => {
  describe("liveMessageOf", () => {
    it("keeps an activity's three names and nothing else of its payload", () => {
      const payload = {
        action: "issue.thread_interaction_created",
        entityType: "issue",
        entityId: "c0000000-0000-4000-8000-000000000009",
        details: { body: "made-up text" },
      };
      expect(liveMessageOf(activity(payload), company)).toEqual({
        kind: "event",
        event: {
          kind: "activity",
          action: payload.action,
          entityType: "issue",
          entityId: payload.entityId,
          createdAt,
        },
      });
    });

    it("skips an activity whose names or ID aren't plain", () => {
      const good = { action: "issue.comment_added", entityType: "issue", entityId: "t-1" };
      const bad = [
        undefined,
        { ...good, action: undefined },
        { ...good, entityType: 7 },
        { ...good, entityId: undefined },
        { ...good, action: "issue comment" },
        { ...good, entityType: "../x" },
        { ...good, entityId: "t/1" },
        { ...good, entityId: "t".repeat(129) },
      ];
      for (const payload of bad) expect(liveMessageOf(activity(payload), company)).toBeUndefined();
    });

    it("skips what isn't an event of this company", () => {
      const skipped = [
        null,
        "activity.logged",
        { type: 7 },
        { type: "has space", companyId: company, createdAt },
        { type: "live.ready", companyId: company, createdAt },
        { type: "agent.status", companyId: company },
        { type: "agent.status", companyId: company, createdAt: "x".repeat(41) },
        { type: "agent.status", companyId: "c-other", createdAt },
      ];
      for (const body of skipped) expect(liveMessageOf(body, company)).toBeUndefined();
    });

    it("reads live.resync from any shape, since it only asks to read again", () => {
      expect(liveMessageOf({ type: "live.resync" }, company)).toEqual({ kind: "resync" });
    });
  });
});
