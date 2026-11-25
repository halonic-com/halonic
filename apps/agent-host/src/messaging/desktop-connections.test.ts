import { AgentHostPaperclipSignIn } from "@halonicjs/adapter-agent-host-client";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, it } from "vitest";
import { acme, type Desktop, startDesktop, testKey } from "./desktop-messaging.test-helper.ts";

let desktop: Desktop | undefined;

afterEach(async () => {
  await desktop?.close();
  desktop = undefined;
});

verifies("agent-host.paperclip-connection", () => {
  describe("the workspace's connections, as Settings lists them", () => {
    it("lists a connection nobody connected as signed out, and calls nobody", async () => {
      desktop = await startDesktop();
      const connections = new AgentHostPaperclipSignIn(desktop.transport, desktop.workspace);
      expect(await connections.connections()).toEqual([
        {
          id: "paperclip:halonic",
          name: "halonic",
          label: "Paperclip · Halonic",
          address: acme.address,
          state: { kind: "signed-out" },
        },
      ]);
      expect(desktop.paperclip.seen).toEqual([]);
    });

    it("lists a connected one with its source's state, and answers no key", async () => {
      desktop = await startDesktop();
      const on = desktop;
      await on.paperclipKey.handOver({
        workspace: on.workspace,
        connection: "halonic",
        key: testKey,
        ...acme,
      });
      await on.studio.listAgents();
      const connections = new AgentHostPaperclipSignIn(on.transport, on.workspace);
      const [row] = await connections.connections();
      expect(row?.state.kind).toBe("online");
      expect(on.answers.at(-1)).not.toContain(testKey);
    });
  });
});

verifies("agent-host.paperclip-signed-in-user", () => {
  describe("whom each connection is signed in as", () => {
    /** Hands the Halonic connection's key over, as Studio does on Connect. */
    const handOver = (on: Desktop) =>
      on.paperclipKey.handOver({
        workspace: on.workspace,
        connection: "halonic",
        key: testKey,
        ...acme,
      });
    const meReads = (on: Desktop) =>
      on.paperclip.seen.filter((request) => request.url.endsWith("/api/cli-auth/me")).length;

    it("reads the user once on connect, and names them in the row and the source", async () => {
      desktop = await startDesktop();
      const on = desktop;
      on.paperclip.me = {
        user: { id: "user-1", name: "Board Supervisor", email: "board@acme.test" },
        userId: "user-1",
        companyIds: [acme.company],
      };
      await handOver(on);
      await on.wait(30_000);
      const connections = new AgentHostPaperclipSignIn(on.transport, on.workspace);
      const [row] = await connections.connections();
      expect(row).toMatchObject({
        label: "Paperclip · Halonic · Board Supervisor",
        userName: "Board Supervisor",
      });
      expect(await on.studio.listSources()).toMatchObject([
        { label: "Paperclip · Halonic · Board Supervisor" },
      ]);
      expect(meReads(on)).toBe(1);
      expect(on.answers.join("\n")).not.toContain("board@acme.test");
    });

    it("reads the user again at the next poll when Paperclip couldn't be reached", async () => {
      desktop = await startDesktop();
      const on = desktop;
      on.paperclip.me = { user: { name: "Board Supervisor" } };
      on.paperclip.offline = true;
      await handOver(on);
      on.paperclip.offline = false;
      await on.wait(30_000);
      await on.wait(30_000);
      expect(meReads(on)).toBe(1);
      expect(await on.studio.listSources()).toMatchObject([
        { label: "Paperclip · Halonic · Board Supervisor" },
      ]);
    });

    it("keeps the plain label, and asks no more, when Paperclip gives no name", async () => {
      desktop = await startDesktop();
      const on = desktop;
      on.paperclip.me = { user: null, userId: "user-1", companyIds: [acme.company] };
      await handOver(on);
      await on.wait(30_000);
      const connections = new AgentHostPaperclipSignIn(on.transport, on.workspace);
      const [row] = await connections.connections();
      expect(row?.label).toBe("Paperclip · Halonic");
      expect(row).not.toHaveProperty("userName");
      expect(meReads(on)).toBe(1);
    });
  });
});
