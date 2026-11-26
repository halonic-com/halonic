import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import type { LiveEvent } from "./live-messages.ts";
import { touchedBy } from "./live-touches.ts";

const createdAt = "2026-11-26T08:00:00.000Z";

/** An `activity.logged` event for `entityType`, as the connection cuts it down. */
function activity(action: string, entityType: string): LiveEvent {
  return { kind: "activity", action, entityType, entityId: "t-1", createdAt };
}

verifies("agent-host.paperclip-live-events", () => {
  describe("which collections an event touches", () => {
    it("a new comment or card on a task touches its chat, the Inbox and the work list", () => {
      const touched = ["conversations", "inbox", "work"];
      expect(touchedBy(activity("issue.comment_added", "issue"))).toEqual(touched);
      expect(touchedBy(activity("issue.thread_interaction_created", "issue"))).toEqual(touched);
    });

    it("an agent's change touches the agents; an approval or any other record, the Inbox", () => {
      expect(touchedBy(activity("agent.updated", "agent"))).toEqual(["agents"]);
      expect(touchedBy({ kind: "other", type: "agent.status", createdAt })).toEqual(["agents"]);
      expect(touchedBy(activity("approval.created", "approval"))).toEqual(["inbox"]);
      expect(touchedBy(activity("join_request.created", "join_request"))).toEqual(["inbox"]);
    });

    it("a run that starts or ends touches the chats, whose agent may now be working", () => {
      for (const type of ["heartbeat.run.queued", "heartbeat.run.status"]) {
        expect(touchedBy({ kind: "other", type, createdAt })).toEqual(["conversations"]);
      }
    });

    it("a run's once-a-second activity, its logs, plugin events and names of an object's own properties touch nothing", () => {
      for (const type of [
        "heartbeat.run.activity",
        "heartbeat.run.log",
        "heartbeat.run.event",
        "agent.runtime_state.updated",
        "plugin.acme.ready",
        "constructor",
        "hasOwnProperty",
        "isPrototypeOf",
      ]) {
        expect(touchedBy({ kind: "other", type, createdAt })).toEqual([]);
      }
    });
  });
});
