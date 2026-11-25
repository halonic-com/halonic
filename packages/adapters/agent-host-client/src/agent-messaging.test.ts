import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { AgentHostMessaging } from "./agent-messaging.ts";
import { FakeHost, ok, refused } from "./fake-host.test-helper.ts";

const workspace = "/work/acme";
const read = "POST /v1/messaging/read";
const ada = { id: "paperclip:halonic:agent:ada", source: "paperclip:halonic", name: "Ada" };

verifies("agent-host-client.agent-messaging", () => {
  describe("reads", () => {
    it("asks the host for each list of the workspace and passes on its items", async () => {
      const host = new FakeHost().answer(read, ok({ items: [ada] }));
      const messaging = new AgentHostMessaging(host, workspace);

      expect(await messaging.listAgents()).toEqual([ada]);
      await messaging.listSources();
      await messaging.listConversations();
      await messaging.listMessages("paperclip:halonic:chat:1");
      await messaging.listInboxItems();
      await messaging.listWork();
      await messaging.search("deploy");

      expect(host.calls.map((call) => call.body)).toEqual([
        { workspace, list: "agents" },
        { workspace, list: "sources" },
        { workspace, list: "conversations" },
        { workspace, list: "messages", conversation: "paperclip:halonic:chat:1" },
        { workspace, list: "inbox" },
        { workspace, list: "work" },
        { workspace, list: "search", text: "deploy" },
      ]);
    });

    it("fails with the host's kind when every source failed", async () => {
      const host = new FakeHost().answer(read, refused(502, "messaging_failed", "x"));

      await expect(new AgentHostMessaging(host, workspace).listInboxItems()).rejects.toMatchObject({
        status: 502,
        kind: "messaging_failed",
      });
    });
  });

  describe("writes", () => {
    it("sends an answer and a message to the host and passes on what the source said", async () => {
      const refusedOffline = { outcome: "refused", reason: "offline" };
      const host = new FakeHost()
        .answer("POST /v1/messaging/answer", ok({ result: refusedOffline }))
        .answer("POST /v1/messaging/send", ok({ result: refusedOffline }));
      const messaging = new AgentHostMessaging(host, workspace);

      expect(await messaging.answer("i1", { kind: "option", option: "yes" })).toEqual(
        refusedOffline,
      );
      expect(await messaging.send("c1", "Ship it")).toEqual(refusedOffline);
      expect(host.calls.map((call) => call.body)).toEqual([
        { workspace, item: "i1", answer: { kind: "option", option: "yes" } },
        { workspace, conversation: "c1", body: "Ship it" },
      ]);
    });
  });

  describe("attachments", () => {
    it("reads an attachment's bytes from the host's base64url, or passes on its refusal", async () => {
      const route = "POST /v1/messaging/attachment";
      const answers = [
        ok({ result: { outcome: "read", type: "image/png", base64url: "AAEC_w" } }),
        ok({ result: { outcome: "refused", reason: "offline" } }),
      ];
      const host = new FakeHost().answer(route, () => answers.shift() ?? ok({}));
      const messaging = new AgentHostMessaging(host, workspace);

      expect(await messaging.readAttachment("a1")).toEqual({
        outcome: "read",
        type: "image/png",
        bytes: new Uint8Array([0, 1, 2, 255]),
      });
      expect(await messaging.readAttachment("a1")).toEqual({
        outcome: "refused",
        reason: "offline",
      });
      expect(host.calls[0]?.body).toEqual({ workspace, attachment: "a1" });
    });

    it("fails on a refusal the port doesn't name, rather than passing it on", async () => {
      const host = new FakeHost().answer(
        "POST /v1/messaging/attachment",
        ok({ result: { outcome: "refused", reason: "gone-fishing" } }),
      );
      const messaging = new AgentHostMessaging(host, workspace);

      await expect(messaging.readAttachment("a1")).rejects.toThrow();
    });
  });

  describe("changes", () => {
    it("names each source that changed after it started listening, waiting on the host", async () => {
      const looks = [
        { next: 4, sources: ["paperclip:old"] },
        { next: 5, sources: ["paperclip:halonic"] },
      ];
      const host = new FakeHost().answer("POST /v1/messaging/changes", () =>
        ok(looks.shift() ?? { next: 5, sources: [] }),
      );
      const messaging = new AgentHostMessaging(host, workspace);

      const changes = messaging.changes()[Symbol.asyncIterator]();
      const first = await changes.next();
      await changes.return?.();

      expect(first).toEqual({ done: false, value: "paperclip:halonic" });
      expect(host.calls.map((call) => call.body)).toEqual([
        { workspace, after: 0 },
        { workspace, after: 4, wait: true },
      ]);
    });

    it("tells the host whether the window is in front", async () => {
      const host = new FakeHost().answer("POST /v1/messaging/focus", ok({}));

      await new AgentHostMessaging(host, workspace).setInFront(false);

      expect(host.calls).toEqual([{ route: "POST /v1/messaging/focus", body: { inFront: false } }]);
    });
  });
});

verifies("ports.agent-messaging", () => {
  it("refuses channel calls and a message that names agents, without asking the host", async () => {
    const host = new FakeHost();
    const messaging = new AgentHostMessaging(host, workspace);
    const notSupported = { outcome: "refused", reason: "not-supported" };

    expect(await messaging.startChannel("Launch", [ada.id], ada.id)).toEqual(notSupported);
    expect(await messaging.setMembers("c1", [ada.id], ada.id)).toEqual(notSupported);
    expect(await messaging.joinChannel("c1")).toEqual(notSupported);
    expect(await messaging.leaveChannel("c1")).toEqual(notSupported);
    expect(await messaging.browseChannels()).toEqual([]);
    expect(await messaging.send("c1", "Ship it", [], { to: [ada.id] })).toEqual(notSupported);
    expect(host.calls).toEqual([]);
  });
});
