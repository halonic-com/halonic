import { symlink } from "node:fs/promises";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, it } from "vitest";
import { openBody, post, type Setup, startRoutes } from "./connector-routes.test-helper.ts";

let setup: Setup | undefined;

afterEach(async () => {
  await setup?.close();
  setup = undefined;
});

async function opened(change: Partial<Record<string, unknown>> = {}): Promise<string> {
  setup ??= await startRoutes();
  const response = await post(setup.url, "/v1/connectors/open", openBody(setup.folders, change));
  expect(response.status).toBe(200);
  return ((await response.json()) as { connector: string }).connector;
}

verifies("agent-host.connector-routes", () => {
  describe("the connector routes", () => {
    it("opens a connector with the file's fields, the trust grant and only its own secrets", async () => {
      const connector = await opened();
      const made = setup?.made[0];
      expect(connector).not.toBe("");
      expect(made?.config.transport).toMatchObject({
        kind: "stdio",
        command: "node",
        args: ["tools/notes.js"],
        sites: ["api.example.test"],
      });
      expect(made?.context.trust).toEqual({
        location: setup?.folders.workspace,
        fingerprint: "hfp1:test",
      });
      expect(await made?.context.secrets.get("notes-key")).toBe("fake-value-for-test");
      expect(await made?.context.secrets.get("token-key")).toBeNull();
    });

    it("lists the tools, calls one with its idempotency key and closes the connector", async () => {
      const connector = await opened();
      const url = setup?.url ?? "";
      const tools = await post(url, "/v1/connectors/tools", { connector });
      expect(await tools.json()).toEqual([
        { name: "echo", description: "Echoes.", parameters: { type: "object" } },
      ]);
      const call = await post(url, "/v1/connectors/call", {
        connector,
        tool: "echo",
        args: { text: "hi" },
        idempotencyKey: "run:1",
      });
      expect(await call.json()).toEqual({ text: "called echo" });
      expect(setup?.made[0]?.calls).toEqual([
        { name: "echo", args: { text: "hi" }, options: { idempotencyKey: "run:1" } },
      ]);
      const closed = await post(url, "/v1/connectors/close", { connector });
      expect(closed.status).toBe(200);
      expect(setup?.made[0]?.closeCount).toBe(1);
      expect((await post(url, "/v1/connectors/tools", { connector })).status).toBe(404);
    });

    it("answers a failed start or call with a fixed reason, 502, and logs the detail", async () => {
      const connector = await opened();
      const failing = setup?.made[0];
      if (failing) failing.failWith = new Error("The sandbox didn't start in /some/folder.");
      const response = await post(setup?.url ?? "", "/v1/connectors/tools", { connector });
      expect(response.status).toBe(502);
      const answer = await response.text();
      expect(JSON.parse(answer)).toEqual({
        error: {
          kind: "connector_failed",
          message:
            "The connector couldn't finish this request. The agent host's log has the detail.",
        },
      });
      expect(answer).not.toContain("/some/folder");
      expect(setup?.logged.join("")).toContain("The sandbox didn't start in /some/folder.");
    });

    it("leaves the request's secret values out of the log when a start fails", async () => {
      setup = await startRoutes({
        whileCreating: () => {
          throw new Error("Start failed with fake-value-for-test in the command.");
        },
      });
      const response = await post(setup.url, "/v1/connectors/open", openBody(setup.folders));
      expect(response.status).toBe(502);
      expect(await response.text()).not.toContain("fake-value-for-test");
      const logged = setup.logged.join("");
      expect(logged).toContain("Start failed with [secret value] in the command.");
      expect(logged).not.toContain("fake-value-for-test");
    });

    it("leaves the connector's secret values out of the log when a later request fails", async () => {
      // The program starts on the first tools or call request, so a start failure comes here.
      const connector = await opened({
        secrets: { "notes-key": "fake-value-for-test", other: "fake" },
      });
      const failing = setup?.made[0];
      if (failing) failing.failWith = new Error("Start failed with fake-value-for-test set.");
      const response = await post(setup?.url ?? "", "/v1/connectors/tools", { connector });
      expect(response.status).toBe(502);
      const logged = setup?.logged.join("") ?? "";
      expect(logged).toContain("Start failed with [secret value] set.");
      expect(logged).not.toContain("value-for-test");
    });

    it("gives the factory the workspace and the agents' folders as real paths", async () => {
      setup = await startRoutes();
      const link = join(setup.folders.base, "agent-link");
      await symlink(setup.folders.agent, link);
      await opened({ workingFolders: [link, join(setup.folders.agent, "not-yet")] });
      expect(setup.made[0]?.context.workspaceRoot).toBe(setup.folders.workspace);
      expect(setup.made[0]?.context.workingFolders).toEqual([
        setup.folders.agent,
        join(setup.folders.agent, "not-yet"),
      ]);
    });

    it("closes every open connector when the host stops", async () => {
      await opened();
      const running = setup;
      if (running === undefined) throw new Error("The routes didn't start.");
      await running.table.closeAll();
      expect(running.made[0]?.closeCount).toBe(1);
      const response = await post(running.url, "/v1/connectors/open", openBody(running.folders));
      expect(response.status).toBe(503);
    });

    it("closes a connector made as the host starts stopping, 503", async () => {
      setup = await startRoutes({ whileCreating: (table) => void table.closeAll() });
      const response = await post(setup.url, "/v1/connectors/open", openBody(setup.folders));
      expect(response.status).toBe(503);
      expect(setup.made[0]?.closeCount).toBe(1);
    });

    it("refuses a connector past the table's limit, 429", async () => {
      setup = await startRoutes({ maxConnectors: 1 });
      await opened();
      const response = await post(
        setup.url,
        "/v1/connectors/open",
        openBody(setup.folders, { id: "two" }),
      );
      expect(response.status).toBe(429);
    });
  });
});
