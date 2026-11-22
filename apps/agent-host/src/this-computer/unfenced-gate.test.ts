import { rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pinInstructions } from "@halonicjs/adapter-harness-kit";
import type { InstructionTrustStore, TrustStore } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  coderInstructions,
  coderText,
  reviewSkillPath,
  reviewSkillText,
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

/** Trusts the coder and its instructions and chooses this computer for it, so only the check under test can refuse. */
async function chosen(): Promise<void> {
  await setup.trustCoder();
  await setup.trustCoderInstructions();
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

    it("refuses a profile built with an instructions folder the host didn't make, such as a plugin with hooks", async () => {
      await chosen();
      // A folder holding `hooks/hooks.json` would become Claude Code's `--plugin-dir`.
      setup.unopened.set(setup.built.profile.tempFolder, {
        ...setup.built,
        instructionsFolder: join(setup.root, "downloads", "plugin"),
      });
      expect(await setup.gate.check(request())).toMatchObject({
        status: 403,
        kind: "profile_not_built",
        message: expect.stringMatching(/instructions folder isn't one the agent host made/),
      });
      setup.unopened.set(setup.built.profile.tempFolder, setup.built);
      setup.madeInstructions.clear();
      expect(await setup.gate.check(request())).toMatchObject({ kind: "profile_not_built" });
    });

    it("refuses an instructions folder the host made from skill texts the workspace hasn't, such as a skill with hooks", async () => {
      await chosen();
      // The page sends the texts: a skill's `hooks:` or `` !`command` `` lines would run without asking.
      const withHooks = reviewSkillText.replace(
        "description: Review the change.\n",
        "description: Review the change.\nhooks:\n  SessionStart: [{ command: ./x }]\n",
      );
      const pageMade = await pinInstructions([
        { name: "AGENTS.md", text: "Write the change." },
        { name: "skills/review/SKILL.md", text: withHooks },
      ]);
      setup.madeInstructions.set(setup.built.instructionsFolder ?? "", pageMade);
      expect(await setup.gate.check(request())).toMatchObject({
        status: 403,
        kind: "profile_not_built",
        message: expect.stringMatching(/this workspace's own instructions and skills/),
      });
      const fewer = await pinInstructions(coderInstructions.slice(0, 1));
      setup.madeInstructions.set(setup.built.instructionsFolder ?? "", fewer);
      expect(await setup.gate.check(request())).toMatchObject({ kind: "profile_not_built" });
    });

    it("refuses an instructions folder once a selected skill has no file in the workspace", async () => {
      await chosen();
      await rm(join(setup.root, reviewSkillPath));
      expect(await setup.gate.check(request())).toMatchObject({ kind: "profile_not_built" });
    });

    it("refuses instructions the person didn't trust, or a skill changed on disk since they did", async () => {
      await setup.trustCoder();
      await setup.chooseThisComputer();
      // The page's engine checks instruction trust too, but the gate doesn't rely on the page.
      expect(await setup.gate.check(request())).toMatchObject({
        status: 403,
        kind: "instructions_not_trusted",
      });
      await setup.trustCoderInstructions();
      expect(await setup.gate.check(request())).toBe(setup.built);
      // A fenced agent, or a `git pull`, adds `hooks:` to the skill; the host's folder holds the new text.
      const withHooks = reviewSkillText.replace(
        "description: Review the change.\n",
        "description: Review the change.\nhooks:\n  SessionStart: [{ command: ./x }]\n",
      );
      await writeFile(join(setup.root, reviewSkillPath), withHooks);
      const changed = await pinInstructions([
        { name: "AGENTS.md", text: "Write the change." },
        { name: "skills/review/SKILL.md", text: withHooks },
      ]);
      setup.madeInstructions.set(setup.built.instructionsFolder ?? "", changed);
      expect(await setup.gate.check(request())).toMatchObject({
        status: 403,
        kind: "instructions_not_trusted",
      });
    });

    it("refuses instructions when the instruction trust record can't be read, or the host has no profile folder", async () => {
      await chosen();
      const unreadable: InstructionTrustStore = {
        get: () => Promise.reject(new Error("The record is not valid JSON.")),
        save: (record) => setup.instructionTrust.save(record),
        remove: (key) => setup.instructionTrust.remove(key),
      };
      expect(await setup.gateWithInstructionTrust(unreadable).check(request())).toMatchObject({
        status: 403,
        kind: "instructions_not_trusted",
      });
      expect(await setup.gateWithInstructionTrust(undefined).check(request())).toMatchObject({
        kind: "instructions_not_trusted",
      });
    });

    it("passes a profile built with no instructions folder, and keeps that it has none", async () => {
      await setup.trustCoder();
      await setup.chooseThisComputer();
      // With no instructions there is nothing to trust, as in the engine.
      const without = { ...setup.built, instructionsFolder: null };
      setup.unopened.set(setup.built.profile.tempFolder, without);
      expect(await setup.gate.check(request())).toBe(without);
    });

    it("refuses a profile a session already opened with", async () => {
      await chosen();
      setup.unopened.clear();
      expect(await setup.gate.check(request())).toMatchObject({ kind: "profile_not_built" });
      expect(setup.gate.isStillUnopened(setup.built)).toBe(false);
    });
  });
});
