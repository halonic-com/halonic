import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { type MxcSdk, supportOf, systemMachine, windowsReleaseOf } from "./machine.ts";

/** A fake SDK reporting `tier`, with the process container's capabilities on that tier. */
function sdk(tier: string | undefined, capabilities: string[], isSupported = true): MxcSdk {
  return {
    getPlatformSupport: () => ({
      isSupported,
      ...(tier === undefined ? {} : { isolationTier: tier }),
    }),
    getAvailableBackends: () => [
      {
        backend: "processcontainer",
        tier: "appcontainer-dacl",
        capabilities: ["identitylessLoopbackProxy"],
      },
      ...(tier === undefined ? [] : [{ backend: "processcontainer", tier, capabilities }]),
    ],
  };
}

verifies("sandbox-mxc.offered", () => {
  describe("supportOf", () => {
    it("reads the tier and the loopback proxy of the process container on that tier", () => {
      expect(
        supportOf(sdk("base-container", ["identitylessLoopbackProxy", "filesystemDeniedPaths"])),
      ).toEqual({
        loaded: true,
        tier: "base-container",
        loopbackProxy: true,
      });
    });

    it("doesn't take the loopback proxy from another tier", () => {
      expect(supportOf(sdk("base-container", ["filesystemDeniedPaths"]))).toMatchObject({
        loopbackProxy: false,
      });
    });

    it("reports no tier when the SDK says MXC can't run here", () => {
      expect(supportOf(sdk("base-container", ["identitylessLoopbackProxy"], false))).toEqual({
        loaded: true,
        tier: null,
        loopbackProxy: false,
      });
    });
  });

  describe("systemMachine", () => {
    it("reports an SDK that can't be loaded, and loads it only once", async () => {
      let loads = 0;
      const machine = systemMachine(async () => {
        loads += 1;
        throw new Error("Cannot find package '@microsoft/mxc-sdk'");
      });
      const expected = {
        loaded: false,
        problem: "MXC's SDK can't be loaded or asked: Cannot find package '@microsoft/mxc-sdk'",
      };
      expect(await machine.mxcSupport()).toEqual(expected);
      expect(await machine.mxcSupport()).toEqual(expected);
      expect(loads).toBe(1);
    });

    it("reports an SDK whose own calls throw", async () => {
      const throwing: MxcSdk = {
        getPlatformSupport: () => {
          throw new Error("wxc-exec --probe failed");
        },
        getAvailableBackends: () => [],
      };
      expect(await systemMachine(async () => throwing).mxcSupport()).toEqual({
        loaded: false,
        problem: "MXC's SDK can't be loaded or asked: wxc-exec --probe failed",
      });
    });
  });

  describe("windowsReleaseOf", () => {
    it("reads the build from Node's release", () => {
      expect(windowsReleaseOf("10.0.26200", "Windows 10 Pro")).toEqual({
        build: 26200,
        productName: "Windows 10 Pro",
      });
    });

    it("reads an unreadable build as 0, so it never passes for Windows 11", () => {
      expect(windowsReleaseOf("6.1", "Windows 7")).toMatchObject({ build: 0 });
    });
  });
});
