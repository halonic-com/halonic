import { MemoryAgentPlacementStore, MemoryHostSettingsStore } from "@halonicjs/adapter-memory";
import { AgentPlacement, HostSettings, type NewAgentsRun, newAgentsRun } from "@halonicjs/app";
import type { AgentPlacementStore, Digest } from "@halonicjs/ports";
import { encodeUtf8 } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import type { NewAgentsParts } from "./new-agent-placing.ts";
import { setup } from "./workspace-agents.test-helper.ts";

const digest: Digest = {
  async sha256(data) {
    return new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(data)));
  },
};
const location = "/workspaces/acme";

/** The parts that apply New agents run set to `run` (nothing saved when `undefined`), over `store`. */
async function newAgentsSetup(
  run: NewAgentsRun | undefined,
  store: AgentPlacementStore = new MemoryAgentPlacementStore(),
) {
  const settings = new HostSettings(new MemoryHostSettingsStore());
  await settings.load();
  if (run !== undefined) await settings.set(newAgentsRun, run);
  const placement = new AgentPlacement({
    store,
    digest,
    clock: { now: () => new Date("2026-11-18T10:00:00.000Z") },
  });
  const errors: unknown[] = [];
  const parts: NewAgentsParts = {
    settings,
    placement,
    location,
    reportError: (error) => errors.push(error),
  };
  return { parts, placement, errors };
}

verifies("studio.new-agents-run", () => {
  describe("WorkspaceAgents and New agents run", () => {
    it("records On this computer for the new agent's file as written, keyed by the workspace, its hub and its id", async () => {
      const { parts, placement, errors } = await newAgentsSetup("this-computer");
      const { host, store } = setup({ newAgents: parts });

      const ref = await host.create({ name: "Refund checker", hubId: "acme" });

      const file = encodeUtf8(store["hubs/acme/agents/refund-checker.agent.yaml"] ?? "");
      expect(await placement.where({ location, hub: "acme", agent: ref.id, file })).toMatchObject({
        runsOn: "this-computer",
        chosenAt: "2026-11-18T10:00:00.000Z",
      });
      expect((await placement.where({ location, hub: "acme", agent: "writer", file })).runsOn).toBe(
        "sandbox",
      );
      expect(errors).toEqual([]);
    });

    it("leaves the new agent in its sandbox when the setting says so, or nothing is saved", async () => {
      for (const run of ["sandbox", undefined] as const) {
        const { parts, placement } = await newAgentsSetup(run);
        const { host, store } = setup({ newAgents: parts });

        const ref = await host.create({ name: "Refund checker", hubId: "acme" });

        const file = encodeUtf8(store["hubs/acme/agents/refund-checker.agent.yaml"] ?? "");
        expect(await placement.where({ location, hub: "acme", agent: ref.id, file })).toMatchObject(
          {
            runsOn: "sandbox",
            reason: "not-chosen",
          },
        );
      }
    });

    it("makes the agent all the same when the choice can't be saved, reports why and leaves it in its sandbox", async () => {
      const refused = new Error("The agent host refused the choice.");
      const store = new MemoryAgentPlacementStore();
      store.save = async () => {
        throw refused;
      };
      const { parts, placement, errors } = await newAgentsSetup("this-computer", store);
      const { host, store: files } = setup({ newAgents: parts });

      const ref = await host.create({ name: "Refund checker", hubId: "acme" });

      const text = files["hubs/acme/agents/refund-checker.agent.yaml"];
      expect(text).toContain("id: refund-checker");
      expect(errors).toEqual([refused]);
      expect(
        (
          await placement.where({
            location,
            hub: "acme",
            agent: ref.id,
            file: encodeUtf8(text ?? ""),
          })
        ).runsOn,
      ).toBe("sandbox");
    });

    it("asks again once the new agent's file is edited", async () => {
      const { parts, placement } = await newAgentsSetup("this-computer");
      const { host, store } = setup({ newAgents: parts });

      const ref = await host.create({ name: "Refund checker", hubId: "acme" });
      await host.update(ref, { description: "Checks refunds." });

      const file = encodeUtf8(store["hubs/acme/agents/refund-checker.agent.yaml"] ?? "");
      expect(await placement.where({ location, hub: "acme", agent: ref.id, file })).toMatchObject({
        runsOn: "sandbox",
        reason: "file-changed",
      });
    });
  });
});
