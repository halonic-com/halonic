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
