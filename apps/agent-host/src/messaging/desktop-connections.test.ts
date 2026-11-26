import { mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
          company: acme.company,
          state: { kind: "signed-out" },
        },
      ]);
      expect(desktop.paperclip.seen).toEqual([]);
    });

    it("answers the workspace's real path, also when Studio names it through a link", async () => {
      desktop = await startDesktop();
      const links = await mkdtemp(join(tmpdir(), "acme-links-"));
      try {
        const linked = join(links, "acme");
        await symlink(desktop.workspace, linked, "dir");
        const listed = await new AgentHostPaperclipSignIn(desktop.transport, linked).listed();
        expect(listed.workspace).toBe(desktop.workspace);
      } finally {
        await rm(links, { recursive: true, force: true });
      }
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

verifies("agent-host.paperclip-user-read-again", () => {
  describe("a user read that failed on Paperclip's side or threw", () => {
    const handOver = (on: Desktop) =>
      on.paperclipKey.handOver({
        workspace: on.workspace,
        connection: "halonic",
        key: testKey,
        ...acme,
      });
    const reads = (on: Desktop, path: string) =>
      on.paperclip.seen.filter((request) => new URL(request.url).pathname === path).length;
    const rowOf = async (on: Desktop) => {
      const [row] = await new AgentHostPaperclipSignIn(on.transport, on.workspace).connections();
      return row;
    };

    it("reads the user again at the next poll after a 5xx, and then names them", async () => {
      desktop = await startDesktop();
      const on = desktop;
      on.paperclip.meAnswer = () => Response.json({ error: "unavailable" }, { status: 503 });
      await handOver(on);
      expect((await rowOf(on))?.label).toBe("Paperclip · Halonic");
      on.paperclip.meAnswer = undefined;
      on.paperclip.me = { user: { name: "Board Supervisor" } };
      await on.wait(30_000);
      expect(reads(on, "/api/cli-auth/me")).toBe(2);
      expect(await rowOf(on)).toMatchObject({
        label: "Paperclip · Halonic · Board Supervisor",
        userName: "Board Supervisor",
      });
    });

    it("reports a read that throws during a poll, and the rest of the poll still runs", async () => {
      desktop = await startDesktop();
      const on = desktop;
      // Paperclip answering with a redirect makes the client throw: it never follows one.
      on.paperclip.meAnswer = () =>
        new Response(null, { status: 302, headers: { location: `${acme.address}/elsewhere` } });
      await handOver(on);
      const agentsPath = `/api/companies/${acme.company}/agents`;
      expect(reads(on, agentsPath)).toBe(0);
      await on.wait(30_000);
      expect(on.logged.filter((line) => line === "paperclip:halonic read user\n")).toHaveLength(2);
      expect(reads(on, agentsPath)).toBeGreaterThan(0);
      expect((await rowOf(on))?.state.kind).toBe("online");
    });

    it("shortens a long user name in the label, and keeps it whole on its own", async () => {
      desktop = await startDesktop();
      const on = desktop;
      const longName = `Board Supervisor of ${"the Acme Company ".repeat(4).trim()}`;
      on.paperclip.me = { user: { name: longName } };
      await handOver(on);
      const row = await rowOf(on);
      expect(row?.label).toBe("Paperclip · Halonic · Board Supervisor of the Acme Company th…");
      expect(row?.userName).toBe(longName);
      expect(await on.studio.listSources()).toMatchObject([{ label: row?.label }]);
    });
  });
});
