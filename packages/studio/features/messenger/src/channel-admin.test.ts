import { FakeAgentMessaging } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { withAgent, withLead, withoutAgent } from "./channel-admin.ts";
import { Messenger } from "./messenger.ts";

verifies("messenger.members", () => {
  describe("membership changes", () => {
    it("adds, removes and makes a lead, keeping the lead unless it is replaced", async () => {
      const messaging = new FakeAgentMessaging();
      const acme = messaging.addSource({ label: "Paperclip · Acme" });
      const [chief, liam, elena] = ["Chief", "Liam", "Elena"].map((name) =>
        messaging.addAgent(acme.id, { name }),
      );
      if (chief === undefined || liam === undefined || elena === undefined)
        throw new Error("no agents");
      messaging.addConversation(chief.id, { title: "Engineering", members: [chief.id, liam.id] });
      const [row] = await new Messenger(messaging).rows();
      if (row === undefined) throw new Error("no channel");

      expect(withAgent(row, elena.id)).toEqual({
        members: [chief.id, liam.id, elena.id],
        lead: chief.id,
      });
      expect(withLead(row, liam.id)).toEqual({ members: [chief.id, liam.id], lead: liam.id });
      expect(withoutAgent(row, chief.id, liam.id)).toEqual({ members: [liam.id], lead: liam.id });
      expect(withoutAgent(row, liam.id)).toEqual({ members: [chief.id], lead: chief.id });
    });
  });
});
