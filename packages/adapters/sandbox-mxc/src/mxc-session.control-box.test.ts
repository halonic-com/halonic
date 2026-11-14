import type { SandboxProfile } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import {
  FakeMxc,
  healthyBox,
  type Leaks,
  nodeFolder,
  nodeProgram,
  type ProbeSettings,
  testBoxes,
} from "./fake-mxc.test-helper.ts";
import { MemoryDisk } from "./memory-disk.test-helper.ts";
import { MxcSandbox } from "./mxc-sandbox.ts";

// Made-up Windows paths, each marked for the leak guard on its own line.
const work = "C:\\acme\\work"; // leak-guard: allow absolute-path made-up Windows path for a test
const temp = "C:\\acme\\temp"; // leak-guard: allow absolute-path made-up Windows path for a test

/** The runner's kind of profile: no bridge. */
const profile: SandboxProfile = {
  workingFolder: work,
  tempFolder: temp,
  settingsFolder: null,
  readOnlyPaths: [],
  deniedPaths: [],
  env: {},
  network: { bridge: null, allowedSites: [] },
  timeLimitMs: 10_000,
};

/** The adapter on a fake SDK; `seen` collects the settings of every probe that asked for network attempts. */
function setup(leaks: Leaks) {
  const disk = new MemoryDisk().folder(work).folder(nodeFolder);
  const healthy = healthyBox(disk, leaks);
  const seen: ProbeSettings[] = [];
  const fake = new FakeMxc(disk, async (call) => {
    if (call.settings?.internet !== undefined) seen.push(call.settings);
    return healthy(call);
  });
  const { boxes } = testBoxes(disk);
  return { seen, sandbox: new MxcSandbox(fake.machine(), boxes, { disk, nodeProgram }) };
}

verifies("sandbox-mxc.session", () => {
  describe("the network control of a profile with no bridge", () => {
    it("is shown by a control box first, and then a timeout counts as blocked", async () => {
      const { sandbox, seen } = setup({ blockedAttemptsTimeOut: true });
      const session = await sandbox.open(profile, {});
      expect(session.fence).toEqual({ state: "fenced" });
      expect(seen).toHaveLength(2);
      expect(seen[0]?.bridge).toMatchObject({ host: "127.0.0.1" });
      expect(seen[0]?.ports).toEqual([]);
      expect(seen[1]?.bridge).toBeNull();
      await session.close();
    });

    it.each<[string, Leaks, RegExp]>([
      [
        "the control box can't reach its bridge",
        { blockedAttemptsTimeOut: true, bridgeUnreachable: true },
        /control box's probe could not reach its bridge/,
      ],
      [
        "the control box reaches the outside",
        { reachInternet: true },
        /control box's probe reached the outside/,
      ],
    ])("is not-fenced when %s", async (_what, leaks, reason) => {
      const { sandbox } = setup(leaks);
      const session = await sandbox.open(profile, {});
      expect(session.fence).toMatchObject({
        state: "not-fenced",
        reason: expect.stringMatching(reason),
      });
    });
  });
});
