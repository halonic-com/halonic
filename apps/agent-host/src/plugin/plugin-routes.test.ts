import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, it } from "vitest";
import { callBody, post, type Setup, startRoutes } from "./plugin-routes.test-helper.ts";

let setup: Setup | undefined;

afterEach(async () => {
  await setup?.close();
  setup = undefined;
});

async function started(options: { maxPlugins?: number } = {}): Promise<Setup> {
  setup = await startRoutes(options);
  return setup;
}

async function errorOf(response: Response): Promise<string> {
  return ((await response.json()) as { error: { kind: string } }).error.kind;
}

verifies("agent-host.plugin-routes", () => {
  describe("the plugin call route", () => {
    it("serves two calls of a trusted plugin with one runner", async () => {
      const { url, backends } = await started();
      const first = await post(url, callBody());
      expect(first.status).toBe(200);
      expect(await first.json()).toEqual({ text: "called echo" });
      await post(url, callBody({ args: { text: "again" } }));
      expect(backends.started).toHaveLength(1);
      expect(backends.started[0]?.backend.calls).toEqual([
        { name: "echo", args: { text: "hi" } },
        { name: "echo", args: { text: "again" } },
      ]);
    });

    it("stops the runner and starts none when the plugin is no longer trusted", async () => {
      const { url, backends } = await started();
      await post(url, callBody());
      backends.trusted.delete("acme");
      const refused = await post(url, callBody());
      expect(refused.status).toBe(403);
      expect(await errorOf(refused)).toBe("plugin_not_trusted");
      expect(backends.started).toHaveLength(1);
      expect(backends.started[0]?.backend.closeCount).toBe(1);
    });

    it("starts a new runner under the new trust when the plugin changed", async () => {
      const { url, backends } = await started();
      await post(url, callBody());
      backends.trusted.set("acme", "hfp1:two");
      expect((await post(url, callBody())).status).toBe(200);
      expect(backends.started).toHaveLength(2);
      expect(backends.started[0]?.backend.closeCount).toBe(1);
      expect(backends.started[1]?.backend.calls).toHaveLength(1);
    });

    it("answers 403 not_fenced and starts nothing where no sandbox fences the runner", async () => {
      const { url, backends } = await started();
      backends.refuseStart = "not_fenced";
      const refused = await post(url, callBody());
      expect(refused.status).toBe(403);
      expect(await errorOf(refused)).toBe("not_fenced");
      expect(backends.started).toHaveLength(0);
    });

    it("removes a runner that failed in a call, and the next call starts a new one", async () => {
      const { url, backends, logged } = await started();
      await post(url, callBody());
      const crashed = backends.started[0]?.backend;
      if (crashed === undefined) throw new Error("no runner started");
      crashed.failWith = new Error("runner stopped at acme-folder/plugin");
      const failed = await post(url, callBody());
      expect(failed.status).toBe(502);
      expect(JSON.stringify(await failed.json())).not.toContain("acme-folder");
      expect(logged.join("")).toContain("acme-folder/plugin");
      expect(crashed.closeCount).toBe(1);
      expect((await post(url, callBody())).status).toBe(200);
      expect(backends.started).toHaveLength(2);
    });

    it("keeps the runner after the tool's own error", async () => {
      const { url, backends } = await started();
      await post(url, callBody());
      const backend = backends.started[0]?.backend;
      if (backend === undefined) throw new Error("no runner started");
      backend.failWith = Object.assign(new Error("bad input"), { name: "ToolError" });
      expect((await post(url, callBody())).status).toBe(502);
      expect(backend.closeCount).toBe(0);
    });

    it("answers 429 for a plugin past the limit and 503 once the host stops", async () => {
      const { url, backends, table } = await started({ maxPlugins: 1 });
      backends.trusted.set("beta", "hfp1:beta");
      await post(url, callBody());
      const full = await post(url, callBody({ plugin: "beta" }));
      expect(full.status).toBe(429);
      expect(await errorOf(full)).toBe("too_many_plugins");
      await table.closeAll();
      const stopped = await post(url, callBody());
      expect(stopped.status).toBe(503);
      expect(backends.started[0]?.backend.closeCount).toBe(1);
    });

    it("shares one runner between calls that arrive together", async () => {
      const { url, backends } = await started();
      await Promise.all([post(url, callBody()), post(url, callBody()), post(url, callBody())]);
      expect(backends.started).toHaveLength(1);
      expect(backends.started[0]?.backend.calls).toHaveLength(3);
    });
  });

  describe("attacks from a caller that holds the launch token", () => {
    it.each([
      ["a path", "../acme"],
      ["a nested path", "acme/sub"],
      ["a Windows path", "acme\\sub"],
      ["a dot", "."],
      ["two dots", ".."],
      ["an empty id", ""],
    ])("refuses %s as a plugin id with 400 and reads nothing", async (_name, plugin) => {
      const { url, backends } = await started();
      const refused = await post(url, callBody({ plugin }));
      expect(refused.status).toBe(400);
      expect(backends.started).toHaveLength(0);
    });

    it("refuses a plugin the trust record doesn't cover", async () => {
      const { url, backends } = await started();
      const refused = await post(url, callBody({ plugin: "stranger" }));
      expect(refused.status).toBe(403);
      expect(backends.started).toHaveLength(0);
    });

    it("refuses extra fields, such as a path or a profile the page would like to set", async () => {
      const { url, backends } = await started();
      const refused = await post(url, callBody({ folder: "other-folder", profile: {} }));
      expect(refused.status).toBe(400);
      expect(backends.started).toHaveLength(0);
    });

    it("refuses a body over the host's limit before it reads it", async () => {
      const { url, backends } = await started();
      const huge = await post(url, callBody({ args: { text: "x".repeat(1024 * 1024) } }));
      expect(huge.status).toBe(413);
      expect(backends.started).toHaveLength(0);
    });
  });
});
