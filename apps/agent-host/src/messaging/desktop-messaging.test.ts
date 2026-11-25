import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, it } from "vitest";
import { acme, type Desktop, startDesktop, testKey } from "./desktop-messaging.test-helper.ts";

let desktop: Desktop | undefined;

afterEach(async () => {
  await desktop?.close();
  desktop = undefined;
});

async function started(): Promise<Desktop> {
  desktop = await startDesktop();
  return desktop;
}

/** Connects `halonic` the way Studio does: the key, the address and company it was made for. */
async function connect(on: Desktop, workspace = on.workspace): Promise<void> {
  await on.paperclipKey.handOver({
    workspace,
    connection: "halonic",
    key: testKey,
    ...acme,
  });
}

verifies("agent-host.paperclip-connection", () => {
  it("makes no call when a workspace with a connection file opens, is read and is polled", async () => {
    const on = await started();

    expect(await on.studio.listSources()).toEqual([]);
    expect(await on.studio.listInboxItems()).toEqual([]);
    expect(await on.studio.readAttachment("paperclip:halonic:file:a1")).toMatchObject({
      outcome: "refused",
    });
    await on.wait(30_000);
    await on.wait(30_000);

    expect(on.paperclip.seen).toEqual([]);
  });
});

/** The one request Connect makes, to read whom the key belongs to (`agent-host.paperclip-signed-in-user`). */
const meOnConnect = {
  url: `${acme.address}/api/cli-auth/me`,
  method: "GET",
  authorization: `Bearer ${testKey}`,
};

verifies("agent-host.paperclip-key", () => {
  describe("from a fake Paperclip through the hub to Studio's read", () => {
    it("reads the agents with the key, only at the connection's address", async () => {
      const on = await started();
      await connect(on);

      const agents = await on.studio.listAgents();

      expect(agents.map((agent) => agent.name)).toEqual(["Ada", "Bo"]);
      expect(await on.studio.listSources()).toMatchObject([
        { id: "paperclip:halonic", label: "Paperclip · Halonic", state: { kind: "online" } },
      ]);
      expect(on.paperclip.seen).toEqual([
        meOnConnect,
        {
          url: `${acme.address}/api/companies/${acme.company}/agents`,
          method: "GET",
          authorization: `Bearer ${testKey}`,
        },
      ]);
    });

    it("never gives the page the key in an answer", async () => {
      const on = await started();
      await connect(on);
      await on.studio.listAgents();
      await on.studio.listSources();
      await on.paperclipKey.disconnect({ workspace: on.workspace, connection: "halonic" });

      expect(on.answers.length).toBeGreaterThan(3);
      expect(on.answers.join("\n")).not.toContain(testKey);
      expect(on.logged.join("")).not.toContain(testKey);
    });
  });

  describe("a connection file that changed after Connect", () => {
    it("makes no call once its address is https://evil.test, and the source is signed out", async () => {
      const on = await started();
      await connect(on);
      await on.studio.listAgents();
      await on.writeConnection("https://evil.test");

      await expect(on.studio.listAgents()).rejects.toMatchObject({ kind: "messaging_failed" });
      await on.wait(30_000);

      expect(on.paperclip.seen).toHaveLength(2);
      expect(on.paperclip.seen.map((request) => request.url).join()).not.toContain("evil.test");
      expect(await on.studio.listSources()).toMatchObject([{ state: { kind: "signed-out" } }]);
    });

    it("makes no call once its company changed", async () => {
      const on = await started();
      await connect(on);
      await on.writeConnection(acme.address, "other-company");

      await expect(on.studio.listAgents()).rejects.toMatchObject({ kind: "messaging_failed" });

      expect(on.paperclip.seen).toEqual([meOnConnect]);
    });
  });

  describe("disconnect", () => {
    it("revokes the key, then forgets it and deletes the cache", async () => {
      const on = await started();
      await connect(on);
      await on.studio.listAgents();

      const result = await on.paperclipKey.disconnect({
        workspace: on.workspace,
        connection: "halonic",
      });

      expect(result).toEqual({ revoked: true });
      expect(on.paperclip.seen.at(-1)).toMatchObject({
        url: `${acme.address}/api/cli-auth/revoke-current`,
        method: "POST",
      });
      expect(on.keys.has({ workspace: on.workspace, connection: "halonic" })).toBe(false);
      expect([...(await on.filesIn(join(on.profile, "agent-messaging-cache"))).keys()]).toEqual([]);
      expect(await on.studio.listSources()).toEqual([]);
    });

    it("still forgets the key and deletes the cache while offline, and says the key wasn't revoked", async () => {
      const on = await started();
      await connect(on);
      await on.studio.listAgents();
      on.paperclip.offline = true;

      const result = await on.paperclipKey.disconnect({
        workspace: on.workspace,
        connection: "halonic",
      });

      expect(result).toEqual({ revoked: false });
      expect(on.keys.has({ workspace: on.workspace, connection: "halonic" })).toBe(false);
      expect([...(await on.filesIn(join(on.profile, "agent-messaging-cache"))).keys()]).toEqual([]);
    });

    it("stops every workspace using the key when the revoke fails, not only the one disconnected", async () => {
      const on = await started();
      await connect(on);
      await connect(on, on.otherWorkspace);
      await on.studio.listAgents();
      await on.otherStudio.listAgents();
      on.paperclip.offline = true;

      const result = await on.paperclipKey.disconnect({
        workspace: on.workspace,
        connection: "halonic",
      });
      on.paperclip.offline = false;
      const seenBefore = on.paperclip.seen.length;
      await on.wait(30_000);
      await on.otherStudio.listAgents().catch(() => []);

      expect(result).toEqual({ revoked: false });
      const withKey = on.paperclip.seen
        .slice(seenBefore)
        .filter((request) => request.authorization?.includes(testKey));
      expect(withKey).toEqual([]);
      for (const workspace of [on.workspace, on.otherWorkspace]) {
        expect(on.keys.has({ workspace, connection: "halonic" })).toBe(false);
        expect(await connectionStates(on, workspace)).toEqual([{ kind: "signed-out" }]);
      }
      expect([...(await on.filesIn(join(on.profile, "agent-messaging-cache"))).keys()]).toEqual([]);
    });

    it("leaves a key made for another company in the other workspace", async () => {
      const on = await started();
      await connect(on);
      await on.paperclipKey.handOver({
        workspace: on.otherWorkspace,
        connection: "halonic",
        key: testKey,
        ...acme,
        company: "other-company",
      });

      await on.paperclipKey.disconnect({ workspace: on.workspace, connection: "halonic" });

      expect(on.keys.has({ workspace: on.workspace, connection: "halonic" })).toBe(false);
      expect(on.keys.has({ workspace: on.otherWorkspace, connection: "halonic" })).toBe(true);
    });
  });
});

/** The states Settings › Connections shows for `workspace`'s connection files. */
async function connectionStates(on: Desktop, workspace: string): Promise<unknown[]> {
  const answer = await on.transport.request("POST /v1/paperclip/connections", { workspace });
  const { connections } = answer.body as { connections: { state: unknown }[] };
  return connections.map((connection) => connection.state);
}

verifies("agent-host.agent-messaging-offline", () => {
  it("caches in the profile, changes no workspace file and keeps no key in any cache file", async () => {
    const on = await started();
    const before = await on.filesIn(on.workspace);
    await connect(on);

    await on.studio.listAgents();

    const cached = await on.filesIn(join(on.profile, "agent-messaging-cache"));
    expect(cached.size).toBeGreaterThan(0);
    for (const text of cached.values()) {
      expect(text).not.toContain(testKey);
      expect(text.toLowerCase()).not.toContain("authorization");
    }
    expect(await on.filesIn(on.workspace)).toEqual(before);
  });

  it("reads from the cache while offline, as of the last live read, and refuses a message", async () => {
    const on = await started();
    await connect(on);
    await on.studio.listAgents();
    const [chat] = await on.studio.listConversations();
    on.paperclip.offline = true;

    const agents = await on.studio.listAgents();
    const sources = await on.studio.listSources();
    const sent = await on.studio.send(chat?.id ?? "", "Ship it");

    expect(agents.map((agent) => agent.name)).toEqual(["Ada", "Bo"]);
    expect(sources).toMatchObject([
      { state: { kind: "offline", asOf: "2026-11-24T14:00:00.000Z" } },
    ]);
    expect(chat?.title).toBe("Chat with Ada");
    expect(sent).toEqual({ outcome: "refused", reason: "offline" });
  });
});
