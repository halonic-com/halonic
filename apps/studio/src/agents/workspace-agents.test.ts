import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { WorkspaceAgents } from "./workspace-agents.ts";

const writerFile = "id: writer\nname: Writer\ndescription: Drafts replies.\nmodel: fast\n";
const replyFile =
  "id: reply\nname: Reply\ninitial: first\nstates:\n  first:\n    agent: writer\n    on:\n      - to: done\n  done:\n    type: final\n";

function setup() {
  const store: Record<string, string> = {
    "models.yaml":
      "aliases:\n  fast:\n    provider: anthropic\n    model: claude-haiku\n  smart:\n    provider: anthropic\n    model: claude-sonnet\n",
    "hubs/acme/hub.yaml": "id: acme\nname: Acme\n",
    "hubs/beta/hub.yaml": "id: beta\nname: Beta\n",
    "hubs/acme/agents/writer.agent.yaml": writerFile,
    "hubs/acme/workflows/reply.workflow.yaml": replyFile,
  };
  const changes: { label: string; changes: Record<string, string | null> }[] = [];
  const listeners = new Set<() => void>();
  const host = new WorkspaceAgents({
    files: {
      read: async (path) => store[path] ?? null,
      list: async (dir) =>
        Object.keys(store)
          .filter((path) => path.startsWith(`${dir}/`))
          .sort(),
      change: (label, made) => {
        changes.push({ label, changes: made });
        for (const [path, text] of Object.entries(made)) {
          if (text === null) delete store[path];
          else store[path] = text;
        }
        for (const listener of listeners) listener();
      },
    },
    onChange: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  });
  return { host, store, changes };
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
        { hubId: "acme", id: "reply", name: "Reply" },
      ]);
      await expect(host.referencesTo({ hubId: "acme", id: "gone" })).rejects.toMatchObject({
        kind: "not_found",
      });
      await expect(host.read({ hubId: "acme", id: "gone" })).rejects.toMatchObject({
        kind: "not_found",
      });
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
  });
});
