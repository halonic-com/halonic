import type { GatewayApproval, GatewayEventBody } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import type { RemoteEvent } from "./remote-view.ts";
import { maxHeldEventBytes, maxHeldEvents, SessionMemory } from "./session-memory.ts";

const at = "2026-11-21T14:02:00.000Z";

function event(seq: number, body: GatewayEventBody): RemoteEvent {
  return { seq, at, body };
}

function said(seq: number, text = `line ${seq}`): RemoteEvent {
  return event(seq, { type: "message", role: "agent", text });
}

function approval(id: string): GatewayApproval {
  return { id, summary: `Send reply ${id}`, risk: "normal" };
}

/** A memory that took events `from` to `to`, one after the other. */
function memoryWith(from: number, to: number): SessionMemory {
  const memory = new SessionMemory();
  for (let seq = from; seq <= to; seq += 1) memory.add(said(seq));
  return memory;
}

verifies("remote.phone-session-memory", () => {
  describe("resume and gaps", () => {
    it("resumes from 0 before any event, then from the last one", () => {
      const memory = new SessionMemory();
      expect(memory.lastSeq).toBe(0);
      memory.add(said(41));
      memory.add(said(42));
      expect(memory.lastSeq).toBe(42);
      expect(memory.events.map((held) => held.seq)).toEqual([41, 42]);
    });

    it("drops everything at a gap, so the session is watched from 0", () => {
      const memory = memoryWith(1, 3);
      memory.add(event(4, { type: "approval-requested", approval: approval("a-1") }));
      expect(memory.add(said(6))).toBe("gap");
      expect(memory.events).toEqual([]);
      expect(memory.openApprovals).toEqual([]);
      expect(memory.lastSeq).toBe(0);
    });

    it("ignores the old watch's events after a gap until the new watch is confirmed", () => {
      const memory = memoryWith(1, 3);
      const requested = event(4, { type: "approval-requested", approval: approval("a-1") });
      memory.add(requested);
      expect(memory.add(said(6))).toBe("gap");
      expect(memory.add(said(7))).toBe("ignored");
      expect(memory.add(said(8))).toBe("ignored");

      memory.watchConfirmed();
      for (const replayed of [said(1), said(2), said(3), requested]) {
        expect(memory.add(replayed)).toBe("held");
      }
      for (let seq = 5; seq <= 8; seq += 1) expect(memory.add(said(seq))).toBe("held");

      expect(memory.events.map((held) => held.seq)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
      expect(memory.openApprovals.map((open) => open.approval.id)).toEqual(["a-1"]);
    });

    it("ignores events after history-gone until the new watch is confirmed", () => {
      const memory = memoryWith(40, 42);
      memory.startOver();
      expect(memory.lastSeq).toBe(0);
      expect(memory.add(said(43))).toBe("ignored");
      memory.watchConfirmed();
      expect(memory.add(said(10))).toBe("held");
      expect(memory.events.map((held) => held.seq)).toEqual([10]);
    });

    it("hands out the same events array until the events change", () => {
      const memory = memoryWith(1, 2);
      const first = memory.events;
      expect(memory.events).toBe(first);
      memory.add(said(3));
      expect(memory.events).not.toBe(first);
      expect(memory.events.map((held) => held.seq)).toEqual([1, 2, 3]);
    });

    it("ignores an event it already has", () => {
      const memory = memoryWith(1, 3);
      expect(memory.add(said(2, "again"))).toBe("repeat");
      expect(memory.events.map((held) => held.seq)).toEqual([1, 2, 3]);
    });
  });

  describe("the memory cap", () => {
    it("holds the last 500 events and says it dropped older ones", () => {
      const memory = memoryWith(1, maxHeldEvents);
      expect(memory.droppedOlder).toBe(false);
      memory.add(said(maxHeldEvents + 1));
      expect(memory.events).toHaveLength(maxHeldEvents);
      expect(memory.events[0]?.seq).toBe(2);
      expect(memory.droppedOlder).toBe(true);
    });

    it("holds at most 1 MB of event text, counted in UTF-8", () => {
      const memory = new SessionMemory();
      // Each body is about 60 KB of two-byte characters, so 17 of them pass 1 MB.
      const large = "é".repeat(30_000);
      for (let seq = 1; seq <= 40; seq += 1) memory.add(said(seq, large));
      const held = memory.events.length;
      expect(held).toBeLessThan(18);
      expect(held * 60_000).toBeLessThanOrEqual(maxHeldEventBytes);
      expect(memory.events.at(-1)?.seq).toBe(40);
      expect(memory.droppedOlder).toBe(true);
    });

    it("stays within the cap however long a host streams", () => {
      const memory = new SessionMemory();
      for (let seq = 1; seq <= 20_000; seq += 1) memory.add(said(seq));
      expect(memory.events).toHaveLength(maxHeldEvents);
      expect(memory.lastSeq).toBe(20_000);
    });
  });

  describe("open approvals", () => {
    it("keeps an approval open until it settles, after its event fell out of the cap", () => {
      const memory = new SessionMemory();
      memory.add(event(1, { type: "approval-requested", approval: approval("a-1") }));
      memory.add(event(2, { type: "approval-requested", approval: approval("a-2") }));
      for (let seq = 3; seq <= maxHeldEvents + 10; seq += 1) memory.add(said(seq));
      expect(memory.openApprovals).toEqual([
        { approval: approval("a-1"), requestedAt: at },
        { approval: approval("a-2"), requestedAt: at },
      ]);

      memory.add(
        event(maxHeldEvents + 11, {
          type: "approval-settled",
          approvalId: "a-1",
          decision: "deny",
        }),
      );
      expect(memory.openApprovals.map((open) => open.approval.id)).toEqual(["a-2"]);
    });

    it("holds at most 500 open approvals", () => {
      const memory = new SessionMemory();
      for (let seq = 1; seq <= maxHeldEvents + 1; seq += 1) {
        memory.add(event(seq, { type: "approval-requested", approval: approval(`a-${seq}`) }));
      }
      expect(memory.openApprovals).toHaveLength(maxHeldEvents);
      expect(memory.openApprovals[0]?.approval.id).toBe("a-2");
    });
  });
});
