import type { HarnessAgent } from "@halonicjs/engine";
import type { HarnessBridge } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { containerFolders, containerProfiles } from "./container-profiles.ts";
import { runContainerTimeCapMs, runObjectAlarmLimitMs } from "./run-container-limits.ts";

/** The `acme` hub's `writer` agent, whose file allows one site. */
const writer = {
  runId: "run_1",
  hubId: "acme",
  agentId: "writer",
  harness: "claude-code",
  file: { allowedSites: ["registry.npmjs.org"] },
} as unknown as HarnessAgent;

/** The run's bridge as the Worker's bridge server opens it. */
const bridge: HarnessBridge = { url: "http://bridge.halonic.invalid", token: "test-credential" };

verifies("runtime.container-profile", () => {
  it("works in the fixed container folders and reaches only the bridge by name and the file's sites", async () => {
    const { profile, deniedGroups } = await containerProfiles.profileOf(writer, bridge, null);

    expect(profile.workingFolder).toBe(containerFolders.working);
    expect(profile.tempFolder).toBe(containerFolders.temp);
    expect(profile.settingsFolder).toBe(containerFolders.settings);
    expect(profile.readOnlyPaths).toEqual([]);
    expect(profile.network).toEqual({
      bridge: { kind: "socket", name: "bridge.halonic.invalid", socketPath: "" },
      allowedSites: ["registry.npmjs.org"],
    });
    expect(deniedGroups).toEqual([]);
    // The credential reaches the program only through the harness's own variables, never here.
    expect(JSON.stringify(profile.env)).not.toContain("test-credential");
  });

  it("opens the run's instructions folder read-only", async () => {
    const { profile } = await containerProfiles.profileOf(
      writer,
      bridge,
      "/halonic/temp/instructions",
    );

    expect(profile.readOnlyPaths).toEqual(["/halonic/temp/instructions"]);
  });

  it("runs for the container's time cap, which ends before the run object's alarm limit", async () => {
    const { profile } = await containerProfiles.profileOf(writer, bridge, null);

    expect(profile.timeLimitMs).toBe(runContainerTimeCapMs);
    expect(runContainerTimeCapMs).toBe(14 * 60_000);
    expect(runContainerTimeCapMs).toBeLessThan(runObjectAlarmLimitMs);
    expect(runObjectAlarmLimitMs - runContainerTimeCapMs).toBe(60_000);
  });

  it("refuses a bridge the container can't reach by name", async () => {
    for (const url of [
      "http://127.0.0.1:4100",
      "https://bridge.halonic.invalid",
      "http://bridge.halonic.invalid:8080",
      "http://bridge.example.com",
    ]) {
      await expect(containerProfiles.profileOf(writer, { ...bridge, url }, null)).rejects.toThrow(
        /only as http:\/\/bridge\.halonic\.invalid/,
      );
    }
  });

  it("refuses an instructions folder that isn't a plain container path", async () => {
    for (const folder of ["/halonic/temp/../work", "instructions", "/halonic//temp"]) {
      await expect(containerProfiles.profileOf(writer, bridge, folder)).rejects.toThrow(
        /isn't a container path/,
      );
    }
  });
});
