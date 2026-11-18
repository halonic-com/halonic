import type { HarnessBridge } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { FakeHost, ok, refused } from "./fake-host.test-helper.ts";
import { AgentHostProfiles, type ProfileAgent } from "./harness-profiles.ts";
import { AgentHostError } from "./transport.ts";

/** An invented workspace, and the bridge the engine got from the host. */
const workspace = "/work/acme";
/** The fake bridge's token. Not a real credential. */
const bridge: HarnessBridge = { url: "http://127.0.0.1:4100", token: "bridge-test-value" };

const writer: ProfileAgent = {
  runId: "run_1",
  hubId: "hub_1",
  agentId: "writer",
  harness: "claude-code",
  file: { workingFolder: "files/agents/writer", allowedSites: ["example.com"] },
  filesFolder: null,
};

const built = {
  profile: {
    workingFolder: "/work/acme/files/agents/writer",
    tempFolder: "/data/temp/session-1",
    settingsFolder: null,
    readOnlyPaths: [],
    deniedPaths: ["/data"],
    reopenedPaths: ["/data/temp/session-1"],
    env: { PATH: "/usr/bin", TMPDIR: "/data/temp/session-1" },
    network: {
      bridge: { kind: "loopback", host: "127.0.0.1", port: 4100 },
      allowedSites: ["example.com"],
    },
    timeLimitMs: 1_800_000,
  },
  deniedGroups: [{ code: "halonic-data", paths: ["/data"] }],
};

function profiles(host: FakeHost, bridgeIdOf: (bridge: HarnessBridge) => string | undefined) {
  return new AgentHostProfiles(host, { workspace, bridgeIdOf });
}

verifies("agent-host-client.harness-profiles", () => {
  describe("profileOf", () => {
    it("asks for the workspace, the agent's fields and the bridge's id, and gives the host's profile", async () => {
      const host = new FakeHost().answer("POST /v1/harnesses/profile", ok(built));
      const answer = await profiles(host, () => "bridge_1").profileOf(writer, bridge, null);
      expect(answer).toEqual(built);
      expect(host.calls).toEqual([
        {
          route: "POST /v1/harnesses/profile",
          body: {
            workspace,
            agent: {
              runId: "run_1",
              hubId: "hub_1",
              agentId: "writer",
              harness: "claude-code",
              workingFolder: "files/agents/writer",
              allowedSites: ["example.com"],
              filesFolder: null,
            },
            bridge: "bridge_1",
            instructionsFolder: null,
          },
        },
      ]);
      expect(JSON.stringify(host.calls)).not.toContain(bridge.token);
    });

    it("sends the defaults of an agent's file that names no working folder or sites", async () => {
      const host = new FakeHost().answer("POST /v1/harnesses/profile", ok(built));
      await profiles(host, () => "bridge_1").profileOf({ ...writer, file: {} }, bridge, null);
      expect(host.calls[0]?.body).toMatchObject({
        agent: { workingFolder: null, allowedSites: [] },
      });
    });

    it("fails with the host's kind and reason when the host refuses", async () => {
      const reason = "The working folder ../elsewhere leaves the workspace.";
      const host = new FakeHost().answer(
        "POST /v1/harnesses/profile",
        refused(422, "profile_refused", reason),
      );
      const failure = await profiles(host, () => "bridge_1")
        .profileOf(writer, bridge, null)
        .catch((error: unknown) => error);
      expect(failure).toBeInstanceOf(AgentHostError);
      expect(failure).toMatchObject({ kind: "profile_refused", message: reason });
    });

    it("fails before asking when the bridge isn't open in the host", async () => {
      const host = new FakeHost();
      await expect(profiles(host, () => undefined).profileOf(writer, bridge, null)).rejects.toThrow(
        /bridge must be open/,
      );
      expect(host.calls).toEqual([]);
    });

    it("fails on an answer that isn't a profile", async () => {
      const { workingFolder: _removed, ...incomplete } = built.profile;
      const host = new FakeHost().answer(
        "POST /v1/harnesses/profile",
        ok({ ...built, profile: incomplete }),
      );
      await expect(
        profiles(host, () => "bridge_1").profileOf(writer, bridge, null),
      ).rejects.toThrow();
    });
  });
});
