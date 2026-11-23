import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { openConnection, settle } from "./connection.test-helper.ts";

const risky = {
  type: "approval-requested",
  approval: { id: "p1", summary: "Run ls", risk: "risky" },
} as const;

verifies("remote-gateway.risky-switch-list", () => {
  describe("the risky switch in the session list", () => {
    it("says in an answered list whether the switch is on", async () => {
      const t = openConnection({ allowRisky: true });
      t.source.addSession("s1");
      await t.hello();
      await t.say({ type: "list-sessions", id: "l1" });
      expect(t.sent.at(-1)).toEqual({
        type: "sessions",
        replyTo: "l1",
        sessions: [expect.objectContaining({ id: "s1" })],
        answersRisky: true,
      });
    });

    it("lists again on every change, so off, on, off ends with false", async () => {
      const t = openConnection();
      t.source.addSession("s1");
      await t.hello();
      for (const allowed of [false, true, false]) {
        t.risky.allowed = allowed;
        t.connection.listAgain();
        await settle();
      }
      const lists = t.sent.filter((message) => message.type === "sessions");
      expect(lists.map((list) => list.type === "sessions" && list.answersRisky)).toEqual([
        false,
        true,
        false,
      ]);
      expect(lists.every((list) => !("replyTo" in list))).toBe(true);
    });

    it("sends nothing to a phone that hasn't said hello", async () => {
      const t = openConnection();
      t.connection.listAgain();
      await settle();
      expect(t.sent).toEqual([]);
      expect(t.transport.closed).toBe(false);
    });

    it("refuses a risky answer with the switch off, whatever the phone last saw", async () => {
      const t = openConnection({ allowRisky: true });
      t.source.addSession("s1");
      t.source.emit("s1", risky);
      await t.hello();
      await t.say({ type: "list-sessions", id: "l1" });
      expect(t.sent.at(-1)).toMatchObject({ answersRisky: true });
      t.risky.allowed = false;
      await t.say({
        type: "answer-approval",
        id: "a1",
        sessionId: "s1",
        approvalId: "p1",
        decision: "approve",
      });
      expect(t.sent.at(-1)).toEqual({ type: "error", replyTo: "a1", code: "not-allowed-remotely" });
      expect(t.source.answers).toEqual([]);
    });

    it("refuses a phone of the older message version and lists nothing", async () => {
      const t = openConnection();
      t.source.addSession("s1");
      await t.say({ type: "hello", id: "h1", version: 2 });
      t.connection.listAgain();
      await settle();
      expect(t.sent).toEqual([{ type: "error", code: "unsupported-version" }]);
      expect(t.transport.closed).toBe(true);
    });
  });
});
