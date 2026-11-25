import type { MessagingSource } from "@halonicjs/ports";
import { FakeAgentMessaging } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import {
  ChannelAdmin,
  checkNewChannel,
  withAgent,
  withLead,
  withoutAgent,
} from "./channel-admin.ts";
import { Messenger } from "./messenger.ts";

const online: MessagingSource = {
  id: "acme",
  provider: "paperclip",
  label: "Paperclip · Acme",
  state: { kind: "online", asOf: "2026-11-24T10:00:00.000Z" },
};

function agents(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `agent-${index}`,
    source: "acme",
    name: `Agent ${index}`,
    activity: "idle" as const,
  }));
}

const picks = (count: number) => agents(count).map((agent) => agent.id);

verifies("messenger.channel-create", () => {
  describe("checkNewChannel", () => {
    const from = { source: online, agents: agents(10) };

    it("keeps Create channel off with 1 agent picked", () => {
      expect(checkNewChannel({ name: "Engineering", picked: picks(1) }, from, [])).toEqual({
        blocked: "Pick at least 2 agents.",
        full: false,
      });
    });

    it("keeps it off above 8, and says the picker is full at 8", () => {
      const nine = checkNewChannel({ name: "Engineering", picked: picks(9) }, from, []);
      expect(nine.blocked).toBe("A channel can have up to 8 agents.");
      expect(checkNewChannel({ name: "Engineering", picked: picks(8) }, from, [])).toEqual({
        full: true,
      });
    });

    it("says the name is taken, ignoring case", () => {
      const check = checkNewChannel({ name: "engineering ", picked: picks(2) }, from, [
        "Engineering",
      ]);
      expect(check.nameTaken).toBe("There's already a channel called engineering.");
      expect(check.blocked).toBe(check.nameTaken);
    });

    it("waits for an offline source, and for a source with fewer than 2 agents", () => {
      const offline = { ...online, state: { kind: "offline", asOf: "" } } as const;
      expect(
        checkNewChannel({ name: "", picked: picks(2) }, { ...from, source: offline }, []).blocked,
      ).toBe("You can make a channel when Paperclip · Acme answers again.");
      expect(
        checkNewChannel({ name: "", picked: [] }, { ...from, agents: agents(1) }, []).blocked,
      ).toBe("A channel needs at least 2 agents. Paperclip · Acme has 1.");
    });
  });

  describe("ChannelAdmin", () => {
    it("browses only channels the person isn't in, and a join puts one in the list", async () => {
      const messaging = new FakeAgentMessaging();
      const acme = messaging.addSource({ label: "Paperclip · Acme" });
      const chief = messaging.addAgent(acme.id, { name: "Chief" });
      const liam = messaging.addAgent(acme.id, { name: "Liam" });
      const members = [chief.id, liam.id];
      const engineering = messaging.addConversation(chief.id, { title: "Engineering", members });
      messaging.addConversation(chief.id, { title: "Design", members });
      await messaging.leaveChannel(engineering.id);
      const admin = new ChannelAdmin(messaging);

      const [found] = await admin.browse();
      expect(found?.channels.map((each) => each.title)).toEqual(["Engineering"]);
      expect(await admin.takenNames(acme.id)).toEqual(
        expect.arrayContaining(["Design", "Engineering"]),
      );

      await admin.join(engineering.id);
      const rows = await new Messenger(messaging).rows();
      expect(rows.map((row) => row.conversation.title)).toContain("Engineering");
      expect((await admin.browse())[0]?.channels).toEqual([]);
    });
  });
});

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
