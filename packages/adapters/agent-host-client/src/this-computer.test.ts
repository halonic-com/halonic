import type { HarnessBridge, SandboxProfile } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { FakeHost, ok, refused } from "./fake-host.test-helper.ts";
import { AgentHostProfiles, type ProfileAgent } from "./harness-profiles.ts";
import { AgentHostThisComputer } from "./this-computer.ts";

/** An invented workspace, and the bridge the engine got from the host. */
const workspace = "/work/acme";
/** The fake bridge's token. Not a real credential. */
const bridge: HarnessBridge = { url: "http://127.0.0.1:4100", token: "bridge-test-value" };

const writer: ProfileAgent = {
  runId: "run_1",
  hubId: "hub_1",
  agentId: "writer",
  harness: "claude-code",
  file: {},
  filesFolder: null,
};

/** The profile the host builds for one agent, with its own temp folder. */
function builtFor(tempFolder: string): SandboxProfile {
  return {
    workingFolder: workspace,
    tempFolder,
    settingsFolder: null,
    readOnlyPaths: [],
    deniedPaths: [],
    env: { PATH: "/usr/bin" },
    network: { bridge: { kind: "loopback", host: "127.0.0.1", port: 4100 }, allowedSites: [] },
    timeLimitMs: 600_000,
  };
}

/** A host that offers sessions on this computer (or not), builds `profile` and opens `s1` with the fence off. */
function hostOffering(offered: boolean, profile = builtFor("/data/temp/session-1")): FakeHost {
  return new FakeHost()
    .answer("GET /v1/sandbox/this-computer", ok({ offered }))
    .answer("POST /v1/harnesses/profile", ok({ profile, deniedGroups: [] }))
    .answer("POST /v1/sandbox/this-computer/open", ok({ session: "s1", fence: { state: "off" } }));
}

/** The stand-in over `host`, with a profile builder over the same host. */
async function thisComputerOn(host: FakeHost) {
  const profiles = new AgentHostProfiles(host, { workspace, bridgeIdOf: () => "bridge_1" });
  const thisComputer = await AgentHostThisComputer.connect(host, {
    workspace,
    agentOf: (profile) => profiles.agentOf(profile),
  });
  return { profiles, thisComputer };
}

verifies("agent-host-client.this-computer", () => {
  describe("AgentHostThisComputer", () => {
    it("passes its check where the host offers sessions on this computer, with no fence", async () => {
      const { thisComputer } = await thisComputerOn(hostOffering(true));
      expect(thisComputer.offered).toBe(true);
      expect(await thisComputer.check()).toEqual({ ok: true, reason: null, missing: [] });
      expect(thisComputer.capabilities()).toEqual({ files: "shared", strength: "none" });
    });

    it("fails its check with not-offered where the host offers none", async () => {
      const { thisComputer } = await thisComputerOn(hostOffering(false));
      expect(thisComputer.offered).toBe(false);
      expect(await thisComputer.check()).toMatchObject({ ok: false, reason: "not-offered" });
    });

    it("opens a built profile in the host for the agent it was built for", async () => {
      const host = hostOffering(true);
      const { profiles, thisComputer } = await thisComputerOn(host);
      const { profile } = await profiles.profileOf(writer, bridge, null);
      // The engine adds the harness's own variables before it opens.
      const opened = { ...profile, env: { ...profile.env, CLAUDE_CODE_ENTRYPOINT: "halonic" } };
      const session = await thisComputer.open(opened);
      expect(session.fence).toEqual({ state: "off" });
      const open = host.calls.find((call) => call.route === "POST /v1/sandbox/this-computer/open");
      expect(open?.body).toEqual({ workspace, hubId: "hub_1", agentId: "writer", profile: opened });
      expect(JSON.stringify(host.calls)).not.toContain(bridge.token);
    });

    it("never asks the host to open a profile its builder didn't build", async () => {
      const host = hostOffering(true);
      const { thisComputer } = await thisComputerOn(host);
      await expect(thisComputer.open(builtFor("/data/temp/other"))).rejects.toThrow(
        /didn't build this one/,
      );
      expect(host.calls.map((call) => call.route)).not.toContain(
        "POST /v1/sandbox/this-computer/open",
      );
    });

    it("fails with the host's kind and message when the host's gate refuses", async () => {
      const host = hostOffering(true).answer(
        "POST /v1/sandbox/this-computer/open",
        refused(403, "workspace_not_trusted", "Trust the workspace first."),
      );
      const { profiles, thisComputer } = await thisComputerOn(host);
      const { profile } = await profiles.profileOf(writer, bridge, null);
      await expect(thisComputer.open(profile)).rejects.toMatchObject({
        status: 403,
        kind: "workspace_not_trusted",
        message: "Trust the workspace first.",
      });
    });

    it("fails to connect when the host can't say whether it offers sessions", async () => {
      await expect(thisComputerOn(new FakeHost())).rejects.toMatchObject({ status: 404 });
    });
  });

  describe("AgentHostProfiles.agentOf", () => {
    it("names the agent of each profile it built lately, and of no other", async () => {
      let next = 0;
      const host = new FakeHost().answer("POST /v1/harnesses/profile", () => {
        next += 1;
        return ok({ profile: builtFor(`/data/temp/session-${next}`), deniedGroups: [] });
      });
      const profiles = new AgentHostProfiles(host, { workspace, bridgeIdOf: () => "bridge_1" });
      const first = await profiles.profileOf(writer, bridge, null);
      const second = await profiles.profileOf({ ...writer, agentId: "editor" }, bridge, null);
      expect(profiles.agentOf(first.profile)).toEqual({ hubId: "hub_1", agentId: "writer" });
      expect(profiles.agentOf(second.profile)).toEqual({ hubId: "hub_1", agentId: "editor" });
      expect(profiles.agentOf(builtFor("/data/temp/other"))).toBeUndefined();
      // It keeps the latest 64, as many sessions as the host opens at once.
      for (let built = 0; built < 64; built += 1) await profiles.profileOf(writer, bridge, null);
      expect(profiles.agentOf(first.profile)).toBeUndefined();
      expect(profiles.agentOf(builtFor(`/data/temp/session-${next}`))).toBeDefined();
    });
  });
});
