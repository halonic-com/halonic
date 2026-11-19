import { MemoryAgentPlacementStore, MemoryHostSettingsStore } from "@halonicjs/adapter-memory";
import { AgentPlacement, HostSettings, type NewAgentsRun, newAgentsRun } from "@halonicjs/app";
import type { AgentPlacementStore, Digest } from "@halonicjs/ports";
import { encodeUtf8 } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { setup, writerFile } from "./workspace-agents.test-helper.ts";
import type { NewAgentsParts } from "./workspace-agents.ts";

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

verifies("studio.workspace-agents", () => {
  describe("WorkspaceAgents", () => {
    it("lists the agents of the hubs with their model", async () => {
      const { host } = setup();
      expect(await host.list()).toMatchObject([
        {
          hubId: "acme",
          id: "writer",
          name: "Writer",
          description: "Drafts replies.",
          model: "fast",
        },
      ]);
      expect(host.hubs().map((hub) => hub.id)).toEqual(["acme", "beta"]);
      expect(host.nameOf({ hubId: "acme", id: "writer" })).toBe("Writer");
    });

    it("writes the instructions given with a new agent, quoted so any text is safe", async () => {
      const { host } = setup();
      const ref = await host.create({
        name: "Refund checker",
        hubId: "acme",
        instructions: 'Say "no": it\'s policy.\nBe brief.',
      });
      expect((await host.settings(ref)).instructions).toBe('Say "no": it\'s policy.\nBe brief.');
    });

    it("creates an agent as one change, listed at once, with the id taken from the name", async () => {
      const { host, store, changes } = setup();
      const ref = await host.create({ name: "Refund checker", hubId: "acme" });
      expect(ref).toEqual({ hubId: "acme", id: "refund-checker" });
      expect(changes).toHaveLength(1);
      expect(store["hubs/acme/agents/refund-checker.agent.yaml"]).toContain("id: refund-checker");
      expect((await host.list()).map((agent) => agent.id)).toContain("refund-checker");
      expect(await host.create({ name: "Refund checker", hubId: "acme" })).toEqual({
        hubId: "acme",
        id: "refund-checker-2",
      });
    });

    it("keeps a name with a quote or a colon as typed", async () => {
      const { host } = setup();
      const ref = await host.create({ name: 'Billing: "fast"', hubId: "beta" });
      expect((await host.read(ref)).name).toBe('Billing: "fast"');
    });

    it("refuses a hub the workspace doesn't have and writes nothing", async () => {
      const { host, changes } = setup();
      await expect(host.create({ name: "Lost", hubId: "nope" })).rejects.toMatchObject({
        kind: "not_found",
      });
      expect(changes).toEqual([]);
    });

    it("names the workflows that run an agent, and rejects an agent that isn't there", async () => {
      const { host } = setup();
      expect(await host.referencesTo({ hubId: "acme", id: "writer" })).toEqual([
        { hubId: "acme", id: "reply", name: "Reply", steps: 1 },
      ]);
      await expect(host.referencesTo({ hubId: "acme", id: "gone" })).rejects.toMatchObject({
        kind: "not_found",
      });
      await expect(host.read({ hubId: "acme", id: "gone" })).rejects.toMatchObject({
        kind: "not_found",
      });
    });

    it("counts each step of a workflow that runs the agent", async () => {
      const { host, store } = setup();
      store["hubs/acme/workflows/reply.workflow.yaml"] =
        "id: reply\nname: Reply\ninitial: first\nstates:\n  first:\n    agent: writer\n    on:\n      - to: second\n  second:\n    agent: writer\n    on:\n      - to: done\n  done:\n    type: final\n";
      expect(await host.referencesTo({ hubId: "acme", id: "writer" })).toEqual([
        { hubId: "acme", id: "reply", name: "Reply", steps: 2 },
      ]);
    });

    it("tells a subscriber about a change, and not after it stopped", async () => {
      const { host } = setup();
      let heard = 0;
      const stop = host.subscribe(() => (heard += 1));
      await host.create({ name: "One", hubId: "acme" });
      stop();
      await host.create({ name: "Two", hubId: "acme" });
      expect(heard).toBe(1);
    });

    it("edits an agent's file in place as one coalescing change and keeps its comments", async () => {
      const { host, store, changes } = setup();
      store["hubs/acme/agents/writer.agent.yaml"] =
        "# The reply writer\nid: writer\nname: Writer # shown in lists\nmodel: fast\n";
      const ref = { hubId: "acme", id: "writer" };
      await host.update(ref, { instructions: "Be brief.", name: "Reply writer" });
      expect(store["hubs/acme/agents/writer.agent.yaml"]).toContain("# The reply writer");
      expect(store["hubs/acme/agents/writer.agent.yaml"]).toContain("# shown in lists");
      expect(await host.settings(ref)).toMatchObject({
        name: "Reply writer",
        instructions: "Be brief.",
        model: "fast",
      });
      expect(changes).toHaveLength(1);
      expect(host.nameOf(ref)).toBe("Reply writer");
    });

    it("refuses an empty name and an agent that isn't there, and writes nothing", async () => {
      const { host, changes } = setup();
      await expect(
        host.update({ hubId: "acme", id: "writer" }, { name: "" }),
      ).rejects.toMatchObject({ kind: "invalid_input" });
      await expect(host.update({ hubId: "acme", id: "gone" }, { name: "X" })).rejects.toMatchObject(
        {
          kind: "not_found",
        },
      );
      expect(changes).toEqual([]);
    });

    it("reads the turn limit and the model aliases, and saves a model and a turn limit in place", async () => {
      const { host, store } = setup();
      const ref = { hubId: "acme", id: "writer" };
      expect(await host.settings(ref)).toMatchObject({ model: "fast", maxSteps: 6 });
      expect(await host.modelAliases(ref)).toEqual(["fast", "smart"]);

      await host.update(ref, { model: "smart", maxSteps: 25 });
      expect(store["hubs/acme/agents/writer.agent.yaml"]).toContain("model: smart");
      expect(store["hubs/acme/agents/writer.agent.yaml"]).toContain("maxSteps: 25");
      expect(await host.settings(ref)).toMatchObject({ model: "smart", maxSteps: 25 });
      await expect(host.modelAliases({ hubId: "acme", id: "nobody" })).rejects.toMatchObject({
        kind: "not_found",
      });
    });

    it("reads the hub's default model, else the workspace's, when it names a model that exists", async () => {
      const { host, store } = setup();
      expect(await host.defaultModel("acme")).toBeUndefined();

      store["workspace.yaml"] = "id: studio\nname: Studio\ndefaults:\n  model: smart\n";
      expect(await host.defaultModel("acme")).toBe("smart");

      store["hubs/acme/hub.yaml"] = "id: acme\nname: Acme\ndefaults:\n  model: fast\n";
      expect(await host.defaultModel("acme")).toBe("fast");
      expect(await host.defaultModel("beta")).toBe("smart");

      store["workspace.yaml"] = "id: studio\nname: Studio\ndefaults:\n  model: nothing\n";
      expect(await host.defaultModel("beta")).toBeUndefined();
    });

    it("saves the harness and the turn limit only when they're valid, and writes nothing otherwise", async () => {
      const { host, store, changes } = setup();
      const ref = { hubId: "acme", id: "writer" };
      expect((await host.settings(ref)).harness).toBe("halonic");
      await host.update(ref, { harness: "codex" });
      expect(store["hubs/acme/agents/writer.agent.yaml"]).toContain("harness: codex");
      expect((await host.settings(ref)).harness).toBe("codex");
      const written = changes.length;
      for (const maxSteps of [0, 201, 2.5]) {
        await expect(host.update(ref, { maxSteps })).rejects.toMatchObject({
          kind: "invalid_input",
        });
      }
      expect(changes).toHaveLength(written);
    });

    it("offers the hub's own skills, knowledge and connectors and the shared ones its uses lists", async () => {
      const { host, store } = setup();
      const ref = { hubId: "acme", id: "writer" };
      store["hubs/acme/library/skills/refunds/SKILL.md"] =
        "---\nname: Refund policy\ndescription: When money goes back\n---\nAsk first.\n";
      store["library/skills/tone/SKILL.md"] =
        "---\nname: Tone\ndescription: How we write\n---\nPlain.\n";
      store["library/skills/legal/SKILL.md"] =
        "---\nname: Legal\ndescription: Contracts\n---\nCareful.\n";
      store["library/connectors/search.connector.yaml"] =
        "version: 1\nid: search\nname: Web search\ntransport: { http: { url: https://search.acme.example/mcp } }\n";
      expect(await host.toolOptions(ref)).toEqual({
        skills: [
          { id: "refunds", name: "Refund policy" },
          { id: "legal", name: "Legal" },
          { id: "tone", name: "Tone" },
        ],
        knowledge: [],
        connectors: [{ id: "search", name: "Web search" }],
      });

      store["hubs/acme/hub.yaml"] = "id: acme\nname: Acme\nuses:\n  skills: [tone]\n";
      const limited = await host.toolOptions(ref);
      expect(limited.skills.map((skill) => skill.id)).toEqual(["refunds", "tone"]);
      expect(limited.connectors).toEqual([]);
      await expect(host.toolOptions({ hubId: "acme", id: "gone" })).rejects.toMatchObject({
        kind: "not_found",
      });
    });

    it("reads and saves the agent's skills, knowledge and connectors in place", async () => {
      const { host, store } = setup();
      const ref = { hubId: "acme", id: "writer" };
      expect(await host.settings(ref)).toMatchObject({ skills: [], knowledge: [], connectors: [] });

      await host.update(ref, { skills: ["refunds"], connectors: ["search"] });
      const text = store["hubs/acme/agents/writer.agent.yaml"];
      expect(text).toContain("description: Drafts replies.");
      expect(await host.settings(ref)).toMatchObject({
        skills: ["refunds"],
        knowledge: [],
        connectors: ["search"],
      });

      await host.update(ref, { skills: [] });
      expect((await host.settings(ref)).skills).toEqual([]);
    });

    it("gives the hub's team, saves subagents in place and refuses one that closes a loop", async () => {
      const { host, store, changes } = setup();
      store["hubs/acme/agents/sorter.agent.yaml"] =
        "id: sorter\nname: Sorter\nsubagents: [writer]\n";
      store["hubs/acme/agents/lead.agent.yaml"] = "id: lead\nname: Lead\n";
      const writer = { hubId: "acme", id: "writer" };
      expect((await host.team(writer)).map(({ id, subagents }) => ({ id, subagents }))).toEqual([
        { id: "lead", subagents: [] },
        { id: "sorter", subagents: ["writer"] },
        { id: "writer", subagents: [] },
      ]);
      expect((await host.settings({ hubId: "acme", id: "sorter" })).subagents).toEqual(["writer"]);

      await expect(host.update(writer, { subagents: ["sorter"] })).rejects.toMatchObject({
        kind: "conflict",
        message: "Sorter already hands work to Writer; that would be a loop.",
      });
      expect(changes).toEqual([]);

      await host.update({ hubId: "acme", id: "lead" }, { subagents: ["writer"] });
      expect(store["hubs/acme/agents/lead.agent.yaml"]).toContain("subagents:");
      expect((await host.settings({ hubId: "acme", id: "lead" })).subagents).toEqual(["writer"]);
      await expect(host.team({ hubId: "acme", id: "gone" })).rejects.toMatchObject({
        kind: "not_found",
      });
    });

    it("reads the agent steps in the file's order and adds one in place with an id from its name", async () => {
      const { host, store, changes } = setup();
      const ref = { hubId: "acme", id: "writer" };
      store["hubs/acme/agents/writer.agent.yaml"] =
        "id: writer\nname: Writer\n# Steps\nmethods:\n  draft-reply:\n    description: Drafts a reply.\n    instructions: Write it.\n    model: smart\n    maxSteps: 3\n";
      expect((await host.settings(ref)).agentSteps).toEqual([
        {
          id: "draft-reply",
          description: "Drafts a reply.",
          instructions: "Write it.",
          model: "smart",
          maxSteps: 3,
        },
      ]);

      expect(
        await host.addAgentStep(ref, { name: "Draft reply", instructions: " Shorter. " }),
      ).toBe("draft-reply-2");
      expect(store["hubs/acme/agents/writer.agent.yaml"]).toContain("# Steps");
      expect((await host.settings(ref)).agentSteps.map((step) => step.id)).toEqual([
        "draft-reply",
        "draft-reply-2",
      ]);
      expect((await host.settings(ref)).agentSteps[1]?.instructions).toBe("Shorter.");
      expect(changes).toHaveLength(1);

      await expect(
        host.addAgentStep(ref, { name: "Check", instructions: " " }),
      ).rejects.toMatchObject({
        kind: "invalid_input",
      });
      await expect(
        host.addAgentStep({ hubId: "acme", id: "gone" }, { name: "Check", instructions: "Go." }),
      ).rejects.toMatchObject({ kind: "not_found" });
      expect(changes).toHaveLength(1);
    });

    it("adds the first agent step to a file without methods by making the map in place", async () => {
      const { host, store } = setup();
      const ref = { hubId: "acme", id: "writer" };
      store["hubs/acme/agents/writer.agent.yaml"] = "id: writer\nname: Writer # who writes\n";
      expect((await host.settings(ref)).agentSteps).toEqual([]);

      expect(await host.addAgentStep(ref, { name: "Draft reply", instructions: "Write it." })).toBe(
        "draft-reply",
      );
      expect(store["hubs/acme/agents/writer.agent.yaml"]).toContain("name: Writer # who writes");
      expect(store["hubs/acme/agents/writer.agent.yaml"]).toContain("methods:");
      expect((await host.settings(ref)).agentSteps).toMatchObject([
        { id: "draft-reply", instructions: "Write it." },
      ]);
    });

    it("answers whether a harness can run: Halonic always, the others as the host finds, and rejects without a host", async () => {
      const { host } = setup();
      const ref = { hubId: "acme", id: "writer" };
      expect(await host.harnessReadiness(ref, "halonic")).toMatchObject({ status: "ready" });
      await expect(host.harnessReadiness(ref, "codex")).rejects.toMatchObject({
        kind: "unavailable",
        message: "Halonic can't check programs on this computer from here.",
      });
      await expect(
        host.harnessReadiness({ hubId: "acme", id: "gone" }, "codex"),
      ).rejects.toMatchObject({
        kind: "not_found",
      });
    });

    it("gives the host's own failed answer as failed, and rejects when the host can't be asked", async () => {
      const ref = { hubId: "acme", id: "writer" };
      const failed = setup({
        detectHarness: async () => ({ status: "failed", error: "No answer." }),
      });
      expect(await failed.host.harnessReadiness(ref, "codex")).toEqual({
        status: "failed",
        error: "No answer.",
      });
      const down = setup({
        detectHarness: async () => {
          throw new Error("The engine isn't answering.");
        },
      });
      await expect(down.host.harnessReadiness(ref, "claude-code")).rejects.toThrow(
        "The engine isn't answering.",
      );
    });
  });
});

verifies("studio.workspace-agents-live", () => {
  describe("WorkspaceAgents live state", () => {
    it("asks for the live state of the agent's file, and counts an agent as live without a way to ask", async () => {
      const asked: string[] = [];
      const { host } = setup({
        liveness: async (path) => {
          asked.push(path);
          return "not-live";
        },
      });
      expect(await host.liveState({ hubId: "acme", id: "writer" })).toBe("not-live");
      expect(asked).toEqual(["hubs/acme/agents/writer.agent.yaml"]);
      await expect(host.liveState({ hubId: "acme", id: "nobody" })).rejects.toMatchObject({
        kind: "not_found",
      });

      expect(await setup().host.liveState({ hubId: "acme", id: "writer" })).toBe("live");
    });
  });
});

verifies("studio.workspace-agents-trash", () => {
  describe("WorkspaceAgents trash", () => {
    it("gives the path of the agent's file, and not_found for an agent that isn't there", async () => {
      const { host } = setup();
      expect(await host.filePath({ hubId: "acme", id: "writer" })).toBe(
        "hubs/acme/agents/writer.agent.yaml",
      );
      await expect(host.filePath({ hubId: "acme", id: "gone" })).rejects.toMatchObject({
        kind: "not_found",
      });
    });

    it("moves the agent's file to the trash as one change, and Undo puts it back while that is the newest", async () => {
      const { host, store, changes } = setup();
      const ref = { hubId: "acme", id: "writer" };

      const trashed = await host.trash(ref);
      expect(store["hubs/acme/agents/writer.agent.yaml"]).toBeUndefined();
      expect(changes).toEqual([
        { label: "Deleted agent Writer", changes: { "hubs/acme/agents/writer.agent.yaml": null } },
      ]);
      expect(await host.list()).toEqual([]);

      await trashed.undo();
      expect(store["hubs/acme/agents/writer.agent.yaml"]).toBe(writerFile);
      expect((await host.list()).map((agent) => agent.id)).toEqual(["writer"]);
    });

    it("refuses Undo once something else changed, and an agent that isn't there", async () => {
      const { host, store } = setup();
      const trashed = await host.trash({ hubId: "acme", id: "writer" });
      store["hubs/acme/agents/other.agent.yaml"] = "id: other\nname: Other\n";
      await host.create({ name: "Newer", hubId: "acme" });

      await expect(trashed.undo()).rejects.toMatchObject({ kind: "conflict" });
      await expect(host.trash({ hubId: "acme", id: "gone" })).rejects.toMatchObject({
        kind: "not_found",
      });
    });
  });
});

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
      expect((await placement.where({ location, hub: "acme", agent: "writer", file })).runsOn).toBe("sandbox");
      expect(errors).toEqual([]);
    });

    it("leaves the new agent in its sandbox when the setting says so, or nothing is saved", async () => {
      for (const run of ["sandbox", undefined] as const) {
        const { parts, placement } = await newAgentsSetup(run);
        const { host, store } = setup({ newAgents: parts });

        const ref = await host.create({ name: "Refund checker", hubId: "acme" });

        const file = encodeUtf8(store["hubs/acme/agents/refund-checker.agent.yaml"] ?? "");
        expect(await placement.where({ location, hub: "acme", agent: ref.id, file })).toMatchObject({
          runsOn: "sandbox",
          reason: "not-chosen",
        });
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
        (await placement.where({ location, hub: "acme", agent: ref.id, file: encodeUtf8(text ?? "") })).runsOn,
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
