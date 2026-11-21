import type { AgentHostTransport } from "@halonicjs/adapter-agent-host-client";
import { ServiceRegistry } from "@halonicjs/app";
import { PluginsHostService } from "@halonicjs/studio-feature-plugins/api";
import type { TauriIpc } from "@halonicjs/studio-services";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { desktopProgramsRun } from "./programs-run.ts";
import { providePlugins } from "./provide-plugins.ts";

/** An agent host whose sandbox check answers `check`, and the routes it was asked. */
function acmeHost(check: unknown) {
  const routes: string[] = [];
  const transport = {
    request: async (route: string) => {
      routes.push(route);
      if (route === "GET /v1/sandbox/capabilities") {
        return { status: 200, body: { files: "shared", strength: "os" } };
      }
      if (route === "GET /v1/sandbox/check") return { status: 200, body: check };
      return { status: 200, body: [] };
    },
  } as unknown as AgentHostTransport;
  return { transport, routes };
}

const passes = { ok: true, reason: null, missing: [] };
const container = { ok: false, reason: "container", missing: ["user namespaces"] };

verifies("studio.desktop-plugin-programs-run", () => {
  describe("desktopProgramsRun", () => {
    it("says the programs can run on Linux when the agent host's sandbox check passes", async () => {
      const { transport, routes } = acmeHost(passes);

      expect(await desktopProgramsRun(transport, "linux")?.()).toBe("ready");
      expect(routes).toContain("GET /v1/sandbox/check");
    });

    it("says the programs can't start on macOS when the sandbox can't start", async () => {
      const { transport } = acmeHost(container);

      expect(await desktopProgramsRun(transport, "macos")?.()).toBe("sandbox-unavailable");
    });

    it("says nothing on Windows, and doesn't ask the agent host", () => {
      const { transport, routes } = acmeHost(passes);

      expect(desktopProgramsRun(transport, "windows")).toBeUndefined();
      expect(routes).toEqual([]);
    });

    it("throws when the agent host's answer can't be read, so the check says nothing", async () => {
      const { transport } = acmeHost({ ok: "maybe" });

      await expect(desktopProgramsRun(transport, "linux")?.()).rejects.toThrow();
    });
  });

  describe("providePlugins", () => {
    const ipc: TauriIpc = { invoke: async () => [] };

    it.each([
      ["linux", true],
      ["macos", true],
      ["windows", false],
    ] as const)("on %s, gives the trust check the programs' state: %s", (platform, given) => {
      const services = new ServiceRegistry();
      providePlugins(services, {
        ipc,
        window: {},
        transport: acmeHost(passes).transport,
        platform,
        onFocus: () => () => {},
        onReloadFailed: () => {},
      });

      expect(services.get(PluginsHostService).actions.programs !== undefined).toBe(given);
    });
  });
});
