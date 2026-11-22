import type { TrustStore } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  coderText,
  type ThisComputerSetup,
  thisComputerSetup,
} from "./this-computer.test-helper.ts";
import type { UnfencedOpenRequest } from "./unfenced-gate.ts";

let setup: ThisComputerSetup;

beforeEach(async () => {
  setup = await thisComputerSetup();
});

afterEach(async () => {
  await setup.close();
});

function request(fields: Partial<UnfencedOpenRequest> = {}): UnfencedOpenRequest {
  return {
    workspace: setup.root,
    hubId: "lab",
    agentId: "coder",
    // The engine adds the harness's variables to the profile the host built.
    profile: {
      ...setup.built.profile,
      env: { ...setup.built.profile.env, CLAUDE_CODE_TMPDIR: "/t" },
    },
    ...fields,
  };
}

/** Trusts the coder and chooses this computer for it, so only the check under test can refuse. */
async function chosen(): Promise<void> {
  await setup.trustCoder();
  await setup.chooseThisComputer();
}

verifies("agent-host.unfenced-gate", () => {
  describe("UnfencedGate", () => {
    it("passes a trusted agent a person set to On this computer, with the profile the host built", async () => {
      await chosen();
      expect(await setup.gate.check(request())).toBe(setup.built);
      expect(setup.gate.isStillUnopened(setup.built)).toBe(true);
    });

    it("refuses a folder the launcher didn't name, and an agent the workspace hasn't", async () => {
      await chosen();
      expect(await setup.gate.check(request({ workspace: "/elsewhere" }))).toMatchObject({
        status: 404,
        kind: "unknown_workspace",
      });
      expect(await setup.gate.check(request({ agentId: "writer" }))).toMatchObject({
        status: 404,
        kind: "unknown_agent",
      });
    });

    it("refuses an agent the person's trust record doesn't list, whatever the page says", async () => {
      await setup.chooseThisComputer();
      expect(await setup.gate.check(request())).toMatchObject({
        status: 403,
        kind: "workspace_not_trusted",
      });
    });

    it("refuses when the trust record can't be read", async () => {
      await chosen();
      const unreadable: TrustStore = {
        get: () => Promise.reject(new Error("The trust file is not valid JSON.")),
        grant: (record) => setup.trust.grant(record),
        revoke: (location) => setup.trust.revoke(location),
        list: () => setup.trust.list(),
      };
      expect(await setup.gateWith(unreadable).check(request())).toMatchObject({
        status: 403,
        kind: "workspace_not_trusted",
      });
    });

    it("refuses when the host has no profile folder, so no trust record", async () => {
      await chosen();
      expect(await setup.gateWith(undefined).check(request())).toMatchObject({
        status: 403,
        kind: "workspace_not_trusted",
      });
    });

    it("refuses an agent in Halonic's own loop, even one a record names", async () => {
      await setup.trust.grant({
        location: setup.root,
        fingerprint: "hfp1:test",
        content: {
          connectors: [],
          agents: [{ id: "planner", harness: "halonic", allowedSites: [] }],
        },
        grantedAt: "2026-11-22T08:00:00.000Z",
        appVersion: "0.1.0",
        pins: {},
        origin: "prompt",
      });
      await setup.chooseThisComputer("planner");
      expect(await setup.gate.check(request({ agentId: "planner" }))).toMatchObject({
        status: 403,
        kind: "workspace_not_trusted",
      });
    });

    it("refuses a profile that carries anything the host didn't build, such as a connector's program", async () => {
      await chosen();
      const carrying = {
        ...request().profile,
        connectors: [{ command: "npx", args: ["some-mcp-server"] }],
      };
      expect(await setup.gate.check(request({ profile: carrying }))).toMatchObject({
        status: 403,
        kind: "profile_not_built",
      });
    });

    it("refuses an agent nobody set to On this computer", async () => {
      await setup.trustCoder();
      expect(await setup.gate.check(request())).toMatchObject({
        status: 403,
        kind: "not_on_this_computer",
      });
    });

    it("refuses once the agent's file changed after the choice, even by whitespace", async () => {
      await chosen();
      await setup.writeCoder(`${coderText}\n`);
      // The record still lists the agent the same way: only the choice's fingerprint differs.
      expect(await setup.gate.check(request())).toMatchObject({ kind: "not_on_this_computer" });
    });

    it("refuses a profile the host didn't build, or built for another agent, or changed outside its environment", async () => {
      await chosen();
      const other = { ...setup.built.profile, tempFolder: "/srv/elsewhere" };
      expect(await setup.gate.check(request({ profile: other }))).toMatchObject({
        status: 403,
        kind: "profile_not_built",
      });
      const wider = { ...setup.built.profile, workingFolder: "/" };
      expect(await setup.gate.check(request({ profile: wider }))).toMatchObject({
        kind: "profile_not_built",
      });
      setup.unopened.set(setup.built.profile.tempFolder, {
        ...setup.built,
        agent: { ...setup.built.agent, agentId: "helper" },
      });
      expect(await setup.gate.check(request())).toMatchObject({ kind: "profile_not_built" });
    });

    it("refuses a profile a session already opened with", async () => {
      await chosen();
      setup.unopened.clear();
      expect(await setup.gate.check(request())).toMatchObject({ kind: "profile_not_built" });
      expect(setup.gate.isStillUnopened(setup.built)).toBe(false);
    });
  });
});
