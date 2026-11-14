import type { SandboxProfile } from "@halonicjs/ports";
import { sandboxCheckContract } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { testBoxes } from "./fake-mxc.test-helper.ts";
import type { MxcMachine, MxcSupport } from "./machine.ts";
import { MemoryDisk } from "./memory-disk.test-helper.ts";
import { MxcSandbox } from "./mxc-sandbox.ts";

/** The adapter on `machine`, with box folders on a memory disk. */
function sandboxOn(machine: MxcMachine): MxcSandbox {
  return new MxcSandbox(machine, testBoxes(new MemoryDisk()).boxes);
}

/** What the SDK reports on a computer that offers MXC. */
const offeringSupport: MxcSupport = { loaded: true, tier: "base-container", loopbackProxy: true };

/** Windows 11 Pro that offers MXC; each test spoils one thing. Counts how often the SDK is asked. */
function machine(overrides: Partial<MxcMachine> = {}): MxcMachine & { sdkAsked: () => number } {
  let asked = 0;
  return {
    platform: "win32",
    windowsRelease: () => ({ build: 26200, productName: "Windows 10 Pro" }),
    mxcSupport: async () => {
      asked += 1;
      return offeringSupport;
    },
    spawn: async () => {
      throw new Error("not started in this test");
    },
    ...overrides,
    sdkAsked: () => asked,
  };
}

/** A machine whose SDK reports `support`. */
function supporting(support: MxcSupport): MxcMachine {
  return machine({ mxcSupport: async () => support });
}

const profile: SandboxProfile = {
  workingFolder: "C:\\acme\\work", // leak-guard: allow absolute-path made-up Windows path for a test
  tempFolder: "C:\\acme\\temp", // leak-guard: allow absolute-path made-up Windows path for a test
  settingsFolder: null,
  readOnlyPaths: [],
  deniedPaths: [],
  env: {},
  network: { bridge: { kind: "loopback", host: "127.0.0.1", port: 4100 }, allowedSites: [] },
  timeLimitMs: 1000,
};

sandboxCheckContract("mxc", {
  make: async () => sandboxOn(machine()),
  makeUnavailable: async () => sandboxOn(machine({ platform: "linux" })),
});

verifies("sandbox-mxc.offered", () => {
  describe("MxcSandbox.offered", () => {
    it("is offered on Windows 11 Pro with the BaseContainer tier and the loopback proxy", async () => {
      expect(await sandboxOn(machine()).offered()).toBe(true);
    });

    it.each([
      ["Linux", machine({ platform: "linux" })],
      ["macOS", machine({ platform: "darwin" })],
      [
        "Windows 10",
        machine({ windowsRelease: () => ({ build: 19045, productName: "Windows 10 Pro" }) }),
      ],
      [
        "Windows Server 2025",
        machine({
          windowsRelease: () => ({ build: 26100, productName: "Windows Server 2025 Datacenter" }),
        }),
      ],
    ])("isn't offered on %s, and never asks the SDK", async (_system, on) => {
      expect(await sandboxOn(on).offered()).toBe(false);
      expect(on.sdkAsked()).toBe(0);
    });

    it.each([
      [
        "the DACL tier",
        supporting({ loaded: true, tier: "appcontainer-dacl", loopbackProxy: true }),
      ],
      ["no tier", supporting({ loaded: true, tier: null, loopbackProxy: false })],
      [
        "no loopback proxy",
        supporting({ loaded: true, tier: "base-container", loopbackProxy: false }),
      ],
    ])("isn't offered on Windows 11 with %s", async (_tier, on) => {
      expect(await sandboxOn(on).offered()).toBe(false);
    });

    it("is offered when the SDK can't be loaded, so the check reports the broken install", async () => {
      const broken = supporting({
        loaded: false,
        needsDownload: false,
        problem: "MXC's SDK can't be loaded or asked: gone",
      });
      expect(await sandboxOn(broken).offered()).toBe(true);
    });

    it("isn't offered when the computer can't be examined", async () => {
      const unreadable = machine({
        windowsRelease: () => {
          throw new Error("acme registry is locked");
        },
      });
      expect(await sandboxOn(unreadable).offered()).toBe(false);
    });
  });
});

verifies("sandbox-mxc.check", () => {
  describe("MxcSandbox.check", () => {
    it("can start where MXC is offered", async () => {
      expect(await sandboxOn(machine()).check()).toEqual({
        ok: true,
        reason: null,
        missing: [],
      });
    });

    it.each([
      ["Linux", machine({ platform: "linux" }), /only on Windows 11/],
      [
        "Windows 10",
        machine({ windowsRelease: () => ({ build: 19045, productName: "Windows 10 Pro" }) }),
        /build 19045/,
      ],
      [
        "Windows Server",
        machine({
          windowsRelease: () => ({ build: 26100, productName: "Windows Server 2025 Datacenter" }),
        }),
        /client editions, and this is Windows Server 2025 Datacenter/,
      ],
      [
        "the DACL tier",
        supporting({ loaded: true, tier: "appcontainer-dacl", loopbackProxy: true }),
        /reports appcontainer-dacl/,
      ],
      [
        "no loopback proxy",
        supporting({ loaded: true, tier: "base-container", loopbackProxy: false }),
        /loopback proxy/,
      ],
    ])("says `windows` on %s, as plain Windows does", async (_where, on, sentence) => {
      const check = await sandboxOn(on).check();
      expect(check).toMatchObject({ ok: false, reason: "windows" });
      expect(check.missing).toEqual([expect.stringMatching(sentence)]);
    });

    it("says `other` when the SDK can't be loaded", async () => {
      const problem = "MXC's SDK can't be loaded or asked: gone";
      const check = await sandboxOn(
        supporting({ loaded: false, problem, needsDownload: false }),
      ).check();
      expect(check).toEqual({ ok: false, reason: "other", missing: [problem] });
    });

    it("says `other` instead of throwing when the computer can't be examined", async () => {
      const unreadable = machine({
        mxcSupport: async () => {
          throw new Error("acme probe crashed");
        },
      });
      const check = await sandboxOn(unreadable).check();
      expect(check).toEqual({
        ok: false,
        reason: "other",
        missing: ["This computer can't be examined: acme probe crashed"],
      });
    });

    it("opens no session where MXC can't start", async () => {
      await expect(
        sandboxOn(supporting({ loaded: false, problem: "gone", needsDownload: false })).open(
          profile,
        ),
      ).rejects.toThrow("MXC can't start here: gone");
    });
  });
});

describe("MxcSandbox.capabilities", () => {
  it("shares files with the host, fenced by the operating system", () => {
    expect(sandboxOn(machine()).capabilities()).toEqual({ files: "shared", strength: "os" });
  });
});
