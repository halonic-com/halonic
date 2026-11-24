import type { SandboxProfile } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { ContainerSandbox } from "./container-sandbox.ts";
import { FakeNamespace, HandClock } from "./fake-container.test-helper.ts";

const start = Date.UTC(2026, 10, 24);

function profile(overrides: Partial<SandboxProfile> = {}): SandboxProfile {
  return {
    workingFolder: "/work",
    tempFolder: "/scratch/run",
    settingsFolder: null,
    readOnlyPaths: ["/tools"],
    deniedPaths: [],
    env: { HALONIC_BRIDGE_TOKEN: "test-credential" },
    network: {
      bridge: { kind: "socket", name: "bridge.halonic.invalid", socketPath: "/unused" },
      allowedSites: [],
    },
    timeLimitMs: 60_000,
    ...overrides,
  };
}

function sandboxFor(runId: string, namespace: FakeNamespace, clock: HandClock): ContainerSandbox {
  return new ContainerSandbox({ runId, containerFor: (name) => namespace.get(name), clock });
}

verifies("sandbox-cloudflare-container.one-run", () => {
  describe("ContainerSandbox, one container per run", () => {
    it("opens only the container named after its run, once", async () => {
      const clock = new HandClock(start);
      const namespace = new FakeNamespace(clock);
      await sandboxFor("run-a", namespace, clock).open(profile());
      await sandboxFor("run-b", namespace, clock).open(profile());
      expect([...namespace.objects.keys()]).toEqual(["run-a", "run-b"]);
      await expect(sandboxFor("run-a", namespace, clock).open(profile())).rejects.toThrow(
        /never starts again/,
      );
      expect(namespace.objects.get("run-a")?.container.starts).toHaveLength(1);
    });
  });
});

verifies("sandbox-cloudflare-container.torn-down", () => {
  describe("ContainerSandbox, at the end of the run", () => {
    it("destroys the container when the session closes or the run is cancelled", async () => {
      const clock = new HandClock(start);
      const namespace = new FakeNamespace(clock);
      const session = await sandboxFor("run-a", namespace, clock).open(profile());
      await session.close();
      await session.close();
      expect(session.fence).toEqual({ state: "stopped" });
      expect(namespace.objects.get("run-a")?.container.destroyed).toBe(1);
      await expect(session.start({ program: "claude", args: [] })).rejects.toThrow(/closed/);

      const cancel = new AbortController();
      const cancelled = await sandboxFor("run-b", namespace, clock).open(profile(), {
        signal: cancel.signal,
      });
      cancel.abort();
      // The abort started the close; this waits for the same one.
      await cancelled.close();
      expect(namespace.objects.get("run-b")?.container.running).toBe(false);
    });

    it("reports a program that ends past the deadline as a timeout", async () => {
      const clock = new HandClock(start);
      const namespace = new FakeNamespace(clock);
      const session = await sandboxFor("run-a", namespace, clock).open(profile());
      const started = await session.start({ program: "claude", args: ["--print"] });
      clock.nowMs = start + 60_000;
      namespace.objects.get("run-a")?.container.processes[0]?.finish(137);
      expect(await started.exited).toEqual({ code: 137, signal: null, reason: "timeout" });
    });
  });
});

verifies("sandbox-cloudflare-container.egress", () => {
  describe("ContainerSandbox, the bridge", () => {
    it("refuses a loopback bridge", async () => {
      const clock = new HandClock(start);
      const sandbox = sandboxFor("run-a", new FakeNamespace(clock), clock);
      const loopback = profile({
        network: { bridge: { kind: "loopback", host: "127.0.0.1", port: 4000 }, allowedSites: [] },
      });
      await expect(sandbox.open(loopback)).rejects.toThrow(/only by name/);
    });

    it("passes the bridge's name and the sites to the container", async () => {
      const clock = new HandClock(start);
      const namespace = new FakeNamespace(clock);
      const sites = profile({
        network: { bridge: null, allowedSites: ["registry.npmjs.org"] },
      });
      await sandboxFor("run-a", namespace, clock).open(sites);
      const hosts = namespace.objects.get("run-a")?.container.intercepts.map(({ host }) => host);
      expect(hosts).toEqual(["registry.npmjs.org"]);
    });
  });
});

describe("ContainerSandbox, programs", () => {
  it("starts a program in the working folder and stops it on kill", async () => {
    const clock = new HandClock(start);
    const namespace = new FakeNamespace(clock);
    const session = await sandboxFor("run-a", namespace, clock).open(profile());
    expect(session.fence).toEqual({ state: "fenced" });
    const started = await session.start({ program: "claude", args: ["--print"] });
    await started.kill();
    expect(await started.exited).toEqual({ code: 137, signal: null, reason: "stopped" });
    expect(namespace.objects.get("run-a")?.container.processes[0]?.command).toEqual([
      "claude",
      "--print",
    ]);
  });

  it("refuses a start folder outside the working folder and the read-only paths", async () => {
    const clock = new HandClock(start);
    const session = await sandboxFor("run-a", new FakeNamespace(clock), clock).open(profile());
    await expect(session.start({ program: "ls", args: [], cwd: "/etc" })).rejects.toThrow(
      /outside/,
    );
    const tools = await session.start({ program: "ls", args: [], cwd: "/tools/bin" });
    expect(tools.stdout).toBeInstanceOf(ReadableStream);
  });

  it("is always ok, and remote with copied files", async () => {
    const clock = new HandClock(start);
    const sandbox = sandboxFor("run-a", new FakeNamespace(clock), clock);
    expect(await sandbox.check()).toEqual({ ok: true, reason: null, missing: [] });
    expect(sandbox.capabilities()).toEqual({ files: "copied", strength: "remote" });
  });
});
