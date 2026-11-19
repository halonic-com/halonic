import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SrtSandbox } from "@halonicjs/adapter-sandbox-srt";
import type { Sandbox } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type HostServer, startHostServer } from "../server/host-server.ts";
import { randomLaunchToken } from "../server/launch-token.ts";
import { hostPluginRoutes, hostPlugins } from "./host-plugins.ts";

// The shipped single executable: it runs no plugin, but serves the yes alike.
vi.mock("node:sea", () => ({ isSea: () => true }));

const token = randomLaunchToken();
let root: string;
let server: HostServer | undefined;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "halonic-host-sea-"));
});

afterEach(async () => {
  await server?.close();
  server = undefined;
  await rm(root, { recursive: true, force: true });
});

const inContainer: Sandbox = {
  check: async () => ({ ok: false, reason: "container", missing: [] }),
  capabilities: () => ({ files: "shared", strength: "os" }),
  open: async () => {
    throw new Error("the single executable starts no plugin");
  },
};

verifies("agent-host.unfenced-runs-routes", () => {
  describe("the single executable", () => {
    it("serves the same status, yes and Take back, saved in the profile", async () => {
      const onWindows = process.platform === "win32";
      const profile = { platform: onWindows ? ("windows" as const) : ("linux" as const), root };
      // On Windows plugin code never runs in the sandbox, whatever the check says (condition b).
      const reason = onWindows ? "windows" : "container";
      const plugins = hostPlugins("0.0.0", inContainer as SrtSandbox, profile);
      server = await startHostServer(
        token,
        hostPluginRoutes(plugins, () => undefined),
      );
      const call = async (path: string, body?: unknown) => {
        const response = await fetch(`${server?.url}${path}`, {
          method: body === undefined ? "GET" : "POST",
          headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
        return { status: response.status, body: (await response.json()) as unknown };
      };
      expect((await call("/v1/unfenced-runs")).body).toEqual({
        run: "needs-yes",
        reason,
      });
      expect((await call("/v1/unfenced-runs/allow", { reason })).status).toBe(200);
      // A second host on the same profile reads the yes from the file.
      const again = hostPlugins("0.0.0", inContainer as SrtSandbox, profile);
      expect(await again?.unfenced.gate.status()).toMatchObject({
        run: "allowed",
        reason,
      });
      expect((await call("/v1/unfenced-runs/take-back", {})).status).toBe(200);
      expect((await call("/v1/unfenced-runs")).body).toEqual({
        run: "needs-yes",
        reason,
      });
      // And the plugin route still starts nothing.
      const plugin = await call("/v1/plugins/call", { plugin: "acme", tool: "echo", args: {} });
      expect(plugin).toMatchObject({ status: 403, body: { error: { kind: "not_in_this_build" } } });
    });
  });
});
