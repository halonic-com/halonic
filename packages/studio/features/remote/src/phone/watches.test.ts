import type { GatewayEventBody, GatewayHostMessage } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { listedSession } from "../test-support/listed-session.ts";
import type { SessionMemory } from "./session-memory.ts";
import { Watches } from "./watches.ts";

type EventMessage = Extract<GatewayHostMessage, { type: "event" }>;

const said: GatewayEventBody = { type: "message", role: "agent", text: "Working on it" };

function event(sessionId: string, seq: number): EventMessage {
  return { type: "event", sessionId, seq, at: "2026-11-21T14:03:00.000Z", body: said };
}

/** Watches over a fresh memory map, with the map at hand to look into. */
function newWatches(): { watches: Watches; memories: Map<string, SessionMemory> } {
  const memories = new Map<string, SessionMemory>();
  return { watches: new Watches(memories), memories };
}

verifies("remote.phone-gateway-client", () => {
  describe("which sessions to watch", () => {
    it("watches the first 16 running or waiting sessions, in the host's order", () => {
      const { watches } = newWatches();
      const sessions = [
        listedSession({ id: "done", state: "done" }),
        ...Array.from({ length: 19 }, (_, index) =>
          listedSession({ id: `s${index}`, state: index % 2 === 0 ? "running" : "waiting" }),
        ),
      ];
      const plan = watches.plan(sessions);
      expect(plan.watch).toEqual(Array.from({ length: 16 }, (_, index) => `s${index}`));
      expect(plan.unwatch).toEqual([]);
    });

    it("unwatches a session that ended or left the list, and forgets one that left", () => {
      const { watches, memories } = newWatches();
      watches.watching("ends");
      watches.watching("leaves");
      watches.watching("stays");
      const plan = watches.plan([
        listedSession({ id: "ends", state: "done" }),
        listedSession({ id: "stays" }),
      ]);
      expect(plan).toEqual({ unwatch: ["ends", "leaves"], watch: [] });
      expect([...memories.keys()]).toEqual(["ends", "stays"]);
    });

    it("resumes a watch after the last seq it holds", () => {
      const { watches } = newWatches();
      expect(watches.watching("s1")).toBe(0);
      watches.confirmed("s1");
      watches.eventArrived(event("s1", 1));
      watches.eventArrived(event("s1", 2));
      watches.dropped();
      expect(watches.plan([listedSession({ id: "s1", lastSeq: 2 })]).watch).toEqual(["s1"]);
      expect(watches.watching("s1")).toBe(2);
    });

    it("drops what it holds of a session listed behind it", () => {
      const { watches } = newWatches();
      watches.watching("s1");
      watches.eventArrived(event("s1", 1));
      watches.eventArrived(event("s1", 2));
      watches.dropped();
      watches.plan([listedSession({ id: "s1", lastSeq: 1 })]);
      expect(watches.watching("s1")).toBe(0);
    });
  });

  describe("refusals and events", () => {
    it("after history-gone, watches again from 0 and ignores events until the new ok", () => {
      const { watches } = newWatches();
      watches.watching("s1");
      watches.eventArrived(event("s1", 5));
      expect(watches.refused("s1", "history-gone")).toBe(true);
      expect(watches.watching("s1")).toBe(0);
      expect(watches.eventArrived(event("s1", 6))).toBe("ignored");
      watches.confirmed("s1");
      expect(watches.eventArrived(event("s1", 1))).toBe("held");
    });

    it("leaves a session refused for another reason unwatched until the next list", () => {
      const { watches } = newWatches();
      watches.watching("s1");
      expect(watches.refused("s1", "too-many-watches")).toBe(false);
      expect(watches.eventArrived(event("s1", 1))).toBe("unwatched");
      expect(watches.plan([listedSession({ id: "s1" })]).watch).toEqual(["s1"]);
    });

    it("takes no event of a session it doesn't watch", () => {
      const { watches } = newWatches();
      expect(watches.eventArrived(event("s1", 1))).toBe("unwatched");
      watches.watching("s1");
      watches.unwatched("s1");
      expect(watches.eventArrived(event("s1", 1))).toBe("unwatched");
    });

    it("reports a gap in seq, so the client watches the session again", () => {
      const { watches } = newWatches();
      watches.watching("s1");
      watches.eventArrived(event("s1", 1));
      expect(watches.eventArrived(event("s1", 3))).toBe("gap");
    });
  });
});
