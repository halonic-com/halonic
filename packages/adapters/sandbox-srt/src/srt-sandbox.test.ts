import { sandboxCheckContract } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { cgroupNamesContainer, type Machine } from "./machine.ts";
import { SrtSandbox } from "./srt-sandbox.ts";

/** A Linux machine that can start the sandbox; each test spoils one thing. */
function machine(overrides: Partial<Machine> = {}): Machine {
  return {
    platform: "linux",
    insideContainer: async () => false,
    hasBubblewrap: async () => true,
    userNamespacesRestricted: async () => false,
    hasSeatbelt: async () => true,
    ...overrides,
  };
}

sandboxCheckContract("srt", {
  make: async () => new SrtSandbox(machine()),
  makeUnavailable: async () => new SrtSandbox(machine({ hasBubblewrap: async () => false })),
});

verifies("sandbox-srt.check", () => {
  describe("SrtSandbox.check", () => {
    it("can start on a Linux machine with bubblewrap and user namespaces", async () => {
      expect(await new SrtSandbox(machine()).check()).toEqual({
        ok: true,
        reason: null,
        missing: [],
      });
    });

    it("says `other` instead of throwing when the machine can't be examined", async () => {
      const broken = machine({
        insideContainer: async () => {
          throw new Error("boom");
        },
      });
      const check = await new SrtSandbox(broken).check();
      expect(check.ok).toBe(false);
      expect(check.reason).toBe("other");
      expect(check.missing).toHaveLength(1);
    });

    it.each([
      ["windows", { platform: "win32" as const }],
      ["container", { insideContainer: async () => true }],
      ["user-namespaces-restricted", { userNamespacesRestricted: async () => true }],
      ["bubblewrap-missing", { hasBubblewrap: async () => false }],
      ["other", { platform: "darwin" as const, hasSeatbelt: async () => false }],
    ])("gives the reason %s", async (reason, overrides) => {
      const check = await new SrtSandbox(machine(overrides)).check();
      expect(check.reason).toBe(reason);
      expect(check.missing).toHaveLength(1);
    });

    it("gives the first reason in the port's order when several apply", async () => {
      const everythingWrong = machine({
        insideContainer: async () => true,
        userNamespacesRestricted: async () => true,
        hasBubblewrap: async () => false,
      });
      expect((await new SrtSandbox(everythingWrong).check()).reason).toBe("container");
    });

    it("starts on macOS with Seatbelt", async () => {
      const check = await new SrtSandbox(machine({ platform: "darwin" })).check();
      expect(check.ok).toBe(true);
    });

    it("opens nothing on plain Windows", async () => {
      const sandbox = new SrtSandbox(machine({ platform: "win32" }));
      const profile = {
        workingFolder: "/contract/work",
        tempFolder: "/contract/temp",
        settingsFolder: null,
        readOnlyPaths: [],
        deniedPaths: [],
        env: {},
        network: { bridge: { host: "127.0.0.1", port: 4100 }, allowedSites: [] },
        timeLimitMs: 1000,
      };
      await expect(sandbox.open(profile)).rejects.toThrow("plain Windows");
    });

    it("says files are shared and the fence is the operating system's", () => {
      expect(new SrtSandbox(machine()).capabilities()).toEqual({ files: "shared", strength: "os" });
    });
  });

  describe("cgroupNamesContainer", () => {
    it("sees a Docker or Kubernetes control group, and not a plain one", () => {
      expect(cgroupNamesContainer("0::/docker/abc123")).toBe(true);
      expect(cgroupNamesContainer("0::/kubepods/burstable/pod1")).toBe(true);
      expect(cgroupNamesContainer("0::/user.slice/user-1000.slice")).toBe(false);
    });
  });
});
