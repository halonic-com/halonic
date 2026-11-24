import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { fakeObject, HandClock } from "./fake-container.test-helper.ts";
import type { RunContainerSetup } from "./run-container-types.ts";

const start = Date.UTC(2026, 10, 24);
const command = { program: "claude", args: ["--print"], cwd: "/work" };

function setup(runId: string, overrides: Partial<RunContainerSetup> = {}): RunContainerSetup {
  return {
    runId,
    deadlineMs: start + 60_000,
    env: { HALONIC_BRIDGE_TOKEN: "test-credential" },
    bridgeHost: "bridge.halonic.invalid",
    allowedSites: ["*.example.com", "registry.npmjs.org"],
    ...overrides,
  };
}

verifies("sandbox-cloudflare-container.one-run", () => {
  describe("a container serves one run once", () => {
    it("refuses every call that names another run", async () => {
      const object = fakeObject("run-a", new HandClock(start));
      await expect(object.state.begin(setup("run-b"))).rejects.toThrow(/another run/);
      await object.state.begin(setup("run-a"));
      await expect(object.state.exec("run-b", command)).rejects.toThrow(/another run/);
      await expect(object.state.end("run-b")).rejects.toThrow(/another run/);
      expect(object.container.starts).toHaveLength(1);
      expect(object.container.processes).toHaveLength(0);
      expect(object.container.running).toBe(true);
    });

    it("refuses an object with no name", async () => {
      const object = fakeObject(undefined, new HandClock(start));
      await expect(object.state.begin(setup("run-a"))).rejects.toThrow(/another run/);
      expect(object.container.starts).toHaveLength(0);
    });

    it("refuses a second start with the same run id, before and after the end", async () => {
      const object = fakeObject("run-a", new HandClock(start));
      await object.state.begin(setup("run-a"));
      await expect(object.state.begin(setup("run-a"))).rejects.toThrow(/never starts again/);
      await object.state.end("run-a");
      await expect(object.state.begin(setup("run-a"))).rejects.toThrow(/never starts again/);
      expect(object.container.starts).toHaveLength(1);
    });
  });
});

verifies("sandbox-cloudflare-container.torn-down", () => {
  describe("the container is destroyed at the end and at the deadline", () => {
    it("destroys the container at the end and starts nothing after it", async () => {
      const object = fakeObject("run-a", new HandClock(start));
      await object.state.begin(setup("run-a"));
      expect(object.storage.alarmAt).toBe(start + 60_000);
      await object.state.end("run-a");
      await object.state.end("run-a");
      expect(object.container.destroyed).toBe(1);
      expect(object.storage.alarmAt).toBeNull();
      await expect(object.state.exec("run-a", command)).rejects.toThrow(/no running container/);
    });

    it("destroys the container on the alarm when nobody ends the run", async () => {
      const object = fakeObject("run-a", new HandClock(start));
      await object.state.begin(setup("run-a"));
      await object.state.alarm();
      expect(object.container.running).toBe(false);
      await expect(object.state.exec("run-a", command)).rejects.toThrow(/no running container/);
    });

    it("stops the container on a start past the deadline, before the alarm", async () => {
      const clock = new HandClock(start);
      const object = fakeObject("run-a", clock);
      await object.state.begin(setup("run-a"));
      clock.nowMs = start + 60_000;
      await expect(object.state.exec("run-a", command)).rejects.toThrow(/time limit/);
      expect(object.container.running).toBe(false);
      expect(object.container.processes).toHaveLength(0);
    });

    it("doesn't start a container whose deadline has passed", async () => {
      const object = fakeObject("run-a", new HandClock(start));
      await expect(object.state.begin(setup("run-a", { deadlineMs: start }))).rejects.toThrow(
        /time limit/,
      );
      expect(object.container.starts).toHaveLength(0);
    });

    it("destroys a container that is still booting at the end", async () => {
      const object = fakeObject("run-a", new HandClock(start));
      object.container.booting = true;
      await object.state.begin(setup("run-a"));
      expect(object.container.running).toBe(false);
      await object.state.end("run-a");
      expect(object.container.destroyed).toBe(1);
      expect(object.storage.alarmAt).toBeNull();
    });

    it("keeps the alarm when the teardown fails", async () => {
      const object = fakeObject("run-a", new HandClock(start));
      await object.state.begin(setup("run-a"));
      object.container.destroyFails = new Error("destroy failed");
      await expect(object.state.end("run-a")).rejects.toThrow(/destroy failed/);
      expect(object.storage.alarmAt).toBe(start + 60_000);
      object.container.destroyFails = null;
      await object.state.alarm();
      expect(object.container.destroyed).toBe(1);
      expect(object.storage.alarmAt).toBeNull();
    });

    it("destroys the container when the start fails halfway", async () => {
      const object = fakeObject("run-a", new HandClock(start));
      object.container.interceptFails = new Error("intercept failed");
      await expect(object.state.begin(setup("run-a"))).rejects.toThrow(/intercept failed/);
      expect(object.container.destroyed).toBe(1);
      expect(object.container.running).toBe(false);
      await expect(object.state.begin(setup("run-a"))).rejects.toThrow(/never starts again/);
    });

    it("reports both errors when the start and the teardown fail", async () => {
      const object = fakeObject("run-a", new HandClock(start));
      object.container.interceptFails = new Error("intercept failed");
      object.container.destroyFails = new Error("destroy failed");
      await expect(object.state.begin(setup("run-a"))).rejects.toThrow(AggregateError);
      expect(object.storage.alarmAt).toBe(start + 60_000);
    });

    it("keeps a refused second start from touching the first one's container", async () => {
      const object = fakeObject("run-a", new HandClock(start));
      await object.state.begin(setup("run-a"));
      await expect(object.state.begin(setup("run-a"))).rejects.toThrow(/never starts again/);
      expect(object.container.running).toBe(true);
      expect(object.container.destroyed).toBe(0);
    });

    it("does nothing on an alarm before any start", async () => {
      const object = fakeObject("run-a", new HandClock(start));
      await object.state.alarm();
      expect(object.container.destroyed).toBe(0);
    });
  });
});

verifies("sandbox-cloudflare-container.egress", () => {
  describe("the container's network", () => {
    it("starts with internet off and intercepts only the bridge and the allowed sites", async () => {
      const object = fakeObject("run-a", new HandClock(start));
      await object.state.begin(setup("run-a"));
      expect(object.container.starts).toEqual([
        { enableInternet: false, env: { HALONIC_BRIDGE_TOKEN: "test-credential" } },
      ]);
      expect(object.container.intercepts.map(({ scheme, host }) => `${scheme} ${host}`)).toEqual([
        "http bridge.halonic.invalid",
        "https *.example.com",
        "https registry.npmjs.org",
      ]);
    });

    it("intercepts nothing for a run with no bridge and no sites", async () => {
      const object = fakeObject("run-a", new HandClock(start));
      await object.state.begin(setup("run-a", { bridgeHost: null, allowedSites: [] }));
      expect(object.container.intercepts).toEqual([]);
    });
  });
});
