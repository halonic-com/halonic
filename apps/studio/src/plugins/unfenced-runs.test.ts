import type { AgentHostTransport } from "@halonicjs/adapter-agent-host-client";
import { ServiceRegistry } from "@halonicjs/app";
import { PluginsHostService } from "@halonicjs/studio-feature-plugins/api";
import type { TauriIpc } from "@halonicjs/studio-services";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { providePlugins } from "./provide-plugins.ts";
import { desktopUnfencedRuns, type UnfencedRunsRoutes } from "./unfenced-runs.ts";

/** A promise the test settles by hand. */
function later<T>() {
  let settle: (value: T) => void = () => {};
  let fail: (error: unknown) => void = () => {};
  const promise = new Promise<T>((resolve, reject) => {
    settle = resolve;
    fail = reject;
  });
  return { promise, settle, fail };
}

/** The agent host's routes, recording each call; Take back and the yes answer when the test says. */
function acmeRoutes() {
  const calls: string[] = [];
  const takeBack = later<void>();
  const allow = later<{ reason: string; allowedAt: string } | null>();
  const routes: UnfencedRunsRoutes = {
    status: async () => {
      calls.push("status");
      return { run: "needs-yes", reason: "windows" };
    },
    allow: (reason) => {
      calls.push(`allow ${reason}`);
      return allow.promise;
    },
    takeBack: () => {
      calls.push("take back");
      return takeBack.promise;
    },
  };
  return { routes, calls, takeBack, allow };
}

/** Lets the calls the test started finish; they only wait on the fakes, never on time. */
async function settle(): Promise<void> {
  for (let turn = 0; turn < 20; turn += 1) await Promise.resolve();
}

verifies("studio.desktop-unfenced-runs", () => {
  describe("desktopUnfencedRuns", () => {
    it("sends no yes while a Take back is under way, and answers that nothing was saved", async () => {
      const { routes, calls, takeBack } = acmeRoutes();
      const unfenced = desktopUnfencedRuns(routes);

      const taking = unfenced.takeBack();
      await settle();
      expect(await unfenced.allow("windows")).toBeNull();
      expect(calls).toEqual(["take back"]);

      takeBack.settle();
      await taking;
    });

    it("reads the status only once the Take back has ended, even when it failed", async () => {
      const { routes, calls, takeBack } = acmeRoutes();
      const unfenced = desktopUnfencedRuns(routes);

      const taking = unfenced.takeBack();
      const status = unfenced.status();
      await settle();
      expect(calls).toEqual(["take back"]);

      takeBack.fail(new Error("take_back_incomplete"));
      await expect(taking).rejects.toThrow("take_back_incomplete");
      expect(await status).toEqual({ run: "needs-yes", reason: "windows" });
      expect(calls).toEqual(["take back", "status"]);
    });

    it("lets a Take back wait for a yes already sent, so it removes that one too", async () => {
      const { routes, calls, takeBack, allow } = acmeRoutes();
      const unfenced = desktopUnfencedRuns(routes);

      const allowing = unfenced.allow("windows");
      const taking = unfenced.takeBack();
      await settle();
      expect(calls).toEqual(["allow windows"]);

      allow.settle({ reason: "windows", allowedAt: "2026-11-19T10:00:00Z" });
      await allowing;
      await settle();
      expect(calls).toEqual(["allow windows", "take back"]);

      takeBack.settle();
      await taking;
    });

    it("sends the yes again once the Take back has ended", async () => {
      const { routes, calls, takeBack, allow } = acmeRoutes();
      const unfenced = desktopUnfencedRuns(routes);

      takeBack.settle();
      await unfenced.takeBack();
      const allowing = unfenced.allow("windows");
      allow.settle({ reason: "windows", allowedAt: "2026-11-19T10:00:00Z" });

      expect(await allowing).toEqual({ reason: "windows", allowedAt: "2026-11-19T10:00:00Z" });
      expect(calls).toEqual(["take back", "allow windows"]);
    });
  });

  it("gives the plugins' trust check the agent host's status route", async () => {
    const routes: string[] = [];
    const transport = {
      request: async (route: string) => {
        routes.push(route);
        return { status: 200, body: { run: "fenced" } };
      },
    } as unknown as AgentHostTransport;
    const ipc: TauriIpc = { invoke: async () => [] };
    const services = new ServiceRegistry();
    providePlugins(services, {
      ipc,
      window: {},
      transport,
      onFocus: () => () => {},
      onReloadFailed: () => {},
    });

    const status = await services.get(PluginsHostService).actions.unfencedRuns?.status();

    expect(status).toEqual({ run: "fenced" });
    expect(routes).toContain("GET /v1/unfenced-runs");
  });
});
