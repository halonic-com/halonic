import type { GatewaySession } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { listedSession } from "../test-support/listed-session.ts";
import { type OwnerCheckHint, RECONNECT_TO_ANSWER } from "./remote-view.ts";
import { SentAnswers } from "./sent-answers.ts";
import { SessionMemory } from "./session-memory.ts";
import { ANSWER_RISKY_ON_COMPUTER, type ClientHolding, viewOf } from "./view-of.ts";

const asOf = new Date("2026-11-21T14:05:00.000Z");

/** A memory holding one approval request, `id`, requested at `at`. */
function asking(id: string, at: string, risk: "normal" | "risky" = "normal"): SessionMemory {
  const memory = new SessionMemory();
  memory.add({
    seq: 1,
    at,
    body: { type: "approval-requested", approval: { id, summary: `Send ${id}`, risk } },
  });
  return memory;
}

/** What a client holds of "Work laptop": two listed sessions, each asking once. */
function holding(overrides: Partial<ClientHolding> = {}): ClientHolding {
  const sessions: GatewaySession[] = [
    listedSession({ id: "s1", state: "waiting" }),
    listedSession({ id: "s2", state: "waiting" }),
  ];
  return {
    computer: "Work laptop",
    state: "connected",
    listed: true,
    asOf,
    sessions,
    memories: new Map([
      ["s1", asking("a-late", "2026-11-21T14:04:00.000Z")],
      ["s2", asking("a-early", "2026-11-21T14:01:00.000Z")],
    ]),
    sentAnswers: new SentAnswers(),
    answersRisky: false,
    ownerCheck: "unknown",
    updateNeeded: false,
    olderComputer: false,
    ...overrides,
  };
}

verifies("remote.phone-remote-answers", () => {
  describe("live or stale", () => {
    it("is live while connected and listed since the last welcome", () => {
      const view = viewOf(holding());
      expect(view.label.text).toBe("Connected · Work laptop");
      expect(view.asOf).toBe(asOf);
      expect(view.canAnswer).toBe(true);
      expect(view.offReason).toBeUndefined();
      expect(view.openApprovals.map((open) => open.canAnswer)).toEqual([true, true]);
    });

    it.each<[string, Partial<ClientHolding>]>([
      ["the connection dropped", { state: "reconnecting" }],
      ["no list arrived since the welcome", { listed: false }],
    ])("keeps the sessions and approvals but turns answers off when %s", (_, overrides) => {
      const view = viewOf(holding(overrides));
      expect(view.sessions.map((session) => session.id)).toEqual(["s1", "s2"]);
      expect(view.canAnswer).toBe(false);
      expect(view.offReason).toBe(RECONNECT_TO_ANSWER);
      for (const open of view.openApprovals) {
        expect(open.canAnswer).toBe(false);
        expect(open.offReason).toBe(RECONNECT_TO_ANSWER);
      }
    });
  });

  describe("open approvals", () => {
    it("lists every open approval of the listed sessions, oldest request first", () => {
      const view = viewOf(holding());
      expect(view.openApprovals.map((open) => [open.sessionId, open.approval.id])).toEqual([
        ["s2", "a-early"],
        ["s1", "a-late"],
      ]);
    });

    it("turns a risky approval off, with a reason, even while live", () => {
      const memories = new Map([["s1", asking("a-risky", "2026-11-21T14:01:00.000Z", "risky")]]);
      const view = viewOf(holding({ sessions: [listedSession({ id: "s1" })], memories }));
      const [open] = view.openApprovals;
      expect(open?.canAnswer).toBe(false);
      expect(open?.offReason).toBe(ANSWER_RISKY_ON_COMPUTER);
    });

    it.each<[boolean, OwnerCheckHint, boolean]>([
      [false, "unknown", true],
      [false, "unavailable", true],
      [true, "unknown", true],
      [true, "unavailable", true],
      [false, "ready", true],
      [true, "ready", false],
    ])(
      "with the switch %s and the owner check %s, answers a risky one on the computer: %s",
      (answersRisky, ownerCheck, onComputer) => {
        const memories = new Map([["s1", asking("a-risky", "2026-11-21T14:01:00.000Z", "risky")]]);
        const view = viewOf(
          holding({
            sessions: [listedSession({ id: "s1" })],
            memories,
            answersRisky,
            ownerCheck,
          }),
        );
        expect(view.openApprovals[0]).toMatchObject({
          answerOnComputer: onComputer,
          canAnswer: !onComputer,
          offReason: onComputer ? ANSWER_RISKY_ON_COMPUTER : undefined,
        });
      },
    );

    it("keeps a risky one off while stale, even with the switch and the owner check on", () => {
      const memories = new Map([["s1", asking("a-risky", "2026-11-21T14:01:00.000Z", "risky")]]);
      const view = viewOf(
        holding({
          state: "reconnecting",
          sessions: [listedSession({ id: "s1" })],
          memories,
          answersRisky: true,
          ownerCheck: "ready",
        }),
      );
      expect(view.openApprovals[0]).toMatchObject({
        canAnswer: false,
        offReason: RECONNECT_TO_ANSWER,
      });
    });

    it("shows an answer on its way as sent, and not to be answered again", () => {
      const sentAnswers = new SentAnswers();
      sentAnswers.sent("a-late", "s1", "deny");
      const view = viewOf(holding({ sentAnswers }));
      const late = view.openApprovals.find((open) => open.approval.id === "a-late");
      expect(late?.sent).toBe("deny");
      expect(late?.canAnswer).toBe(false);
    });
  });

  it("shows a listed session the phone doesn't watch with no events", () => {
    const view = viewOf(
      holding({ sessions: [listedSession({ id: "s9", state: "done" })], memories: new Map() }),
    );
    expect(view.sessions).toEqual([
      expect.objectContaining({ id: "s9", state: "done", events: [], droppedOlder: false }),
    ]);
    expect(view.openApprovals).toEqual([]);
  });
});
