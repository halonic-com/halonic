import type { Agent } from "@halonicjs/format";
import type { Digest } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { trustChanges } from "./trust-changes.ts";
import { trustContent } from "./trust-content.ts";
import { trustFingerprint } from "./trust-fingerprint.ts";

/** SHA-256 from Web Crypto, as the platform's `Digest` adapter gives it. */
const digest: Digest = {
  async sha256(data) {
    return new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(data)));
  },
};

/** An agent as parsed from its file, with the defaults filled in. */
function agent(id: string, fields: Partial<Agent> = {}): Agent {
  return {
    version: 1,
    id,
    name: id,
    params: {},
    instructions: "",
    skills: [],
    knowledge: [],
    connectors: [],
    runLogs: false,
    collections: [],
    subagents: [],
    methods: {},
    output: { type: "text" },
    maxSteps: 6,
    ...fields,
  };
}

const coder = agent("coder", { harness: "claude-code", allowedSites: ["api.example.com"] });

function fingerprintOf(agents: Agent[]): Promise<string> {
  return trustFingerprint(trustContent({ connectors: [], agents }), digest);
}

/** Compares two workspaces' agents as the trust gate does. */
function changes(trusted: Agent[], current: Agent[]) {
  return trustChanges(
    trustContent({ connectors: [], agents: trusted }),
    trustContent({ connectors: [], agents: current }),
  );
}

verifies("workspace.trust-agents", () => {
  describe("the content", () => {
    it("lists each harness agent's program and sites, sorted, and leaves the default folder out", () => {
      const content = trustContent({
        connectors: [],
        agents: [
          agent("reviewer", { harness: "codex" }),
          agent("coder", {
            harness: "claude-code",
            allowedSites: ["pypi.org", "*.Example.com", "bücher.example"],
            workingFolder: "files/agents/coder/",
          }),
        ],
      });

      expect(content.agents).toEqual([
        {
          id: "coder",
          harness: "claude-code",
          allowedSites: ["*.example.com", "pypi.org", "xn--bcher-kva.example"],
        },
        { id: "reviewer", harness: "codex", allowedSites: [] },
      ]);
    });

    it("names the working folder when it isn't the default", () => {
      const content = trustContent({
        connectors: [],
        agents: [agent("coder", { harness: "claude-code", workingFolder: "./src//app/" })],
      });

      expect(content.agents?.[0]?.workingFolder).toBe("src/app");
    });

    it("leaves out agents that run in Halonic's own loop", () => {
      const content = trustContent({
        connectors: [],
        agents: [agent("helper"), agent("writer", { harness: "halonic", allowedSites: ["a.b"] })],
      });

      expect(content).toEqual({ connectors: [] });
    });
  });

  describe("the fingerprint", () => {
    it("is the same as before harness agents existed when there are none", async () => {
      expect(await fingerprintOf([agent("helper")])).toBe(
        await trustFingerprint({ connectors: [] }, digest),
      );
    });

    it("changes when a harness agent is added, or its program, sites or folder change", async () => {
      const trusted = await fingerprintOf([coder]);
      const edits: Agent[] = [
        { ...coder, harness: "codex" },
        { ...coder, allowedSites: ["api.example.com", "pypi.org"] },
        { ...coder, allowedSites: [] },
        { ...coder, workingFolder: "src" },
      ];

      expect(await fingerprintOf([coder, agent("reviewer", { harness: "codex" })])).not.toBe(
        trusted,
      );
      for (const edit of edits) {
        expect(await fingerprintOf([edit])).not.toBe(trusted);
      }
    });

    it("stays the same when the sites are reordered or written another way", async () => {
      const trusted = await fingerprintOf([
        { ...coder, allowedSites: ["api.example.com", "pypi.org"] },
      ]);

      expect(
        await fingerprintOf([{ ...coder, allowedSites: ["PyPI.org", "api.example.com"] }]),
      ).toBe(trusted);
    });
  });

  describe("the changes", () => {
    it("lists a new harness agent, which isn't only a removal", () => {
      const result = changes([], [coder]);

      expect(result.agents.added.map((item) => item.id)).toEqual(["coder"]);
      expect(result.onlyRemoves).toBe(false);
    });

    it("lists a changed site list by field, which asks again even when a site was dropped", () => {
      const result = changes(
        [{ ...coder, allowedSites: ["api.example.com", "pypi.org"] }],
        [{ ...coder, allowedSites: ["pypi.org"] }],
      );

      expect(result.agents.changed.map((change) => [change.id, change.fields])).toEqual([
        ["coder", ["allowedSites"]],
      ]);
      expect(result.onlyRemoves).toBe(false);
    });

    it("counts an agent that went back to Halonic's loop as removed, which only removes things", () => {
      const result = changes([coder], [{ ...coder, harness: "halonic" }]);

      expect(result.agents.removed.map((item) => item.id)).toEqual(["coder"]);
      expect(result.onlyRemoves).toBe(true);
    });

    it("reads a record from before harness agents existed as having none", () => {
      const result = trustChanges(
        { connectors: [] },
        trustContent({ connectors: [], agents: [coder] }),
      );

      expect(result.agents.added).toHaveLength(1);
      expect(result.onlyRemoves).toBe(false);
    });
  });
});
