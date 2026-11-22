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

    it("tells its subscribers when a Take back ends, even a refused one, and when a yes is saved", async () => {
      const { routes, takeBack, allow } = acmeRoutes();
      const unfenced = desktopUnfencedRuns(routes);
      const told: string[] = [];
      const stop = unfenced.subscribe?.(() => told.push("changed"));

      const taking = unfenced.takeBack();
      await settle();
      expect(told).toEqual([]);
      takeBack.fail(new Error("take_back_incomplete"));
      await expect(taking).rejects.toThrow("take_back_incomplete");
      expect(told).toEqual(["changed"]);

      const saving = unfenced.allow("windows");
      allow.settle({ reason: "windows", allowedAt: "2026-11-21T10:00:00Z" });
      await saving;
      expect(told).toEqual(["changed", "changed"]);

      stop?.();
      await unfenced.takeBack().catch(() => {});
      expect(told).toEqual(["changed", "changed"]);
    });

    it("tells no one when nothing was saved, and keeps telling the others when one throws", async () => {
      const { routes, allow, takeBack } = acmeRoutes();
      const unfenced = desktopUnfencedRuns(routes);
      const told: string[] = [];
      unfenced.subscribe?.(() => {
        throw new Error("a view that's gone");
      });
      unfenced.subscribe?.(() => told.push("changed"));

      const saving = unfenced.allow("windows");
      allow.settle(null);
      await saving;
      expect(told).toEqual([]);

      const taking = unfenced.takeBack();
      takeBack.settle();
      await taking;
      expect(told).toEqual(["changed"]);
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

    it("lets a Take back wait for every yes already sent, not only the latest", async () => {
      const calls: string[] = [];
      const first = later<{ reason: string; allowedAt: string } | null>();
      const second = later<{ reason: string; allowedAt: string } | null>();
      const answers = [first, second];
      const unfenced = desktopUnfencedRuns({
        status: async () => ({ run: "fenced" }),
        allow: (reason) => {
          calls.push(`allow ${reason}`);
          return (answers.shift() ?? first).promise;
        },
        takeBack: async () => {
          calls.push("take back");
        },
      });

      const firstYes = unfenced.allow("windows");
      const secondYes = unfenced.allow("windows");
      const taking = unfenced.takeBack();
      second.settle({ reason: "windows", allowedAt: "2026-11-19T10:00:00Z" });
      await secondYes;
      await settle();
      expect(calls).toEqual(["allow windows", "allow windows"]);

      first.settle({ reason: "windows", allowedAt: "2026-11-19T10:00:00Z" });
      await firstYes;
      await taking;
      expect(calls).toEqual(["allow windows", "allow windows", "take back"]);
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
      platform: "linux",
      onFocus: () => () => {},
      onReloadFailed: () => {},
    });

    const status = await services.get(PluginsHostService).actions.unfencedRuns?.status();

    expect(status).toEqual({ run: "fenced" });
    expect(routes).toContain("GET /v1/unfenced-runs");
  });
});

verifies("studio.desktop-plugin-run-states", () => {
  it("gives the plugin page the agent host's run-state routes, by the plugin's id", async () => {
    const calls: { route: string; body: unknown }[] = [];
    const transport = {
      request: async (route: string, body: unknown) => {
        calls.push({ route, body });
        return { status: 200, body: { stopped: false } };
      },
    } as unknown as AgentHostTransport;
    const ipc: TauriIpc = { invoke: async () => [] };
    const services = new ServiceRegistry();
    providePlugins(services, {
      ipc,
      window: {},
      transport,
      platform: "linux",
      onFocus: () => () => {},
      onReloadFailed: () => {},
    });

    const runStates = services.get(PluginsHostService).actions.runStates;
    expect(await runStates?.runState("weather")).toEqual({ stopped: false });
    expect(await runStates?.checkAgain("weather")).toEqual({ stopped: false });
    expect(calls).toContainEqual({
      route: "POST /v1/plugins/run-state",
      body: { plugin: "weather" },
    });
    expect(calls).toContainEqual({
      route: "POST /v1/plugins/run-state/check-again",
      body: { plugin: "weather" },
    });
  });
});
