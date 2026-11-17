import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { WorkspaceAgents } from "./workspace-agents.ts";

const writerFile = "id: writer\nname: Writer\ndescription: Drafts replies.\nmodel: fast\n";
const replyFile =
  "id: reply\nname: Reply\ninitial: first\nstates:\n  first:\n    agent: writer\n    on:\n      - to: done\n  done:\n    type: final\n";

function setup() {
  const store: Record<string, string> = {
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
  });
});
