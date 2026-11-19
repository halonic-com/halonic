import { webCryptoDigest } from "@halonicjs/adapter-fs-tauri";
import { MemoryAgentPlacementStore } from "@halonicjs/adapter-memory";
import { AgentPlacement } from "@halonicjs/app";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { AgentPlacementChoices } from "./agent-placement-choices.ts";
import { WorkspaceAgents } from "./workspace-agents.ts";

const writer = { hubId: "acme", id: "writer" };
const writerPath = "hubs/acme/agents/writer.agent.yaml";
const chosenAt = "2026-11-09T14:02:00.000Z";

/** One workspace's files: the saved ones, and the text with unsaved changes. */
function workspace() {
  const saved: Record<string, string> = {
    "hubs/acme/hub.yaml": "id: acme\nname: Acme\n",
    [writerPath]: "id: writer\nname: Writer\nharness: claude-code\n",
  };
  const unsaved: Record<string, string> = { ...saved };
  return { saved, unsaved };
}

/** The kernel's `WorkspaceFiles` over {@link workspace}: reads with unsaved changes applied. */
function filesOf({ saved, unsaved }: ReturnType<typeof workspace>) {
  return {
    read: async (path: string) => unsaved[path] ?? null,
    list: async (dir: string) => Object.keys(unsaved).filter((path) => path.startsWith(`${dir}/`)),
    change: () => {},
    undo: () => false,
    step: 0,
    get pending() {
      return Object.fromEntries(
        Object.entries(unsaved).filter(([path, text]) => saved[path] !== text),
      );
    },
  };
}

/** Studio on one computer: its own placement choices, over the workspace's files. */
function computer(files: ReturnType<typeof workspace>) {
  const placement = new AgentPlacement({
    store: new MemoryAgentPlacementStore(),
    digest: webCryptoDigest,
    clock: { now: () => new Date(chosenAt) },
  });
  return new WorkspaceAgents({
    files: filesOf(files),
    onChange: () => () => {},
    placement: new AgentPlacementChoices({
      placement,
      location: "/workspaces/acme",
      bytesOf: async ({ hubId, id }) => {
        const text = files.saved[`hubs/${hubId}/agents/${id}.agent.yaml`];
        if (text === undefined) throw new Error("no such agent");
        return new TextEncoder().encode(text);
      },
    }),
  });
}

/** Confirms On this computer the way the warning does: with the fingerprint it was shown. */
async function confirm(host: WorkspaceAgents) {
  const shown = await host.placement(writer);
  if (shown === undefined) throw new Error("no placement");
  return host.chooseThisComputer(writer, shown.fingerprint);
}

verifies("studio.agent-placement-choices", () => {
  describe("AgentPlacementChoices", () => {
    it("runs an agent nobody chose for in its sandbox, with its saved file's fingerprint", async () => {
      const host = computer(workspace());
      expect(await host.placement(writer)).toEqual({
        runsOn: "sandbox",
        fingerprint: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
        unsaved: false,
      });
    });

    it("runs it on this computer once a person confirms the warning", async () => {
      const host = computer(workspace());
      expect(await confirm(host)).toEqual({ saved: true });
      expect(await host.placement(writer)).toMatchObject({ runsOn: "this-computer", chosenAt });
    });

    // Julian's condition (J): the choice is made on this computer, for this computer only.
    it("doesn't carry the choice over to another computer with the same workspace", async () => {
      const files = workspace();
      const here = computer(files);
      const elsewhere = computer(files);
      await confirm(here);
      expect(await here.placement(writer)).toMatchObject({ runsOn: "this-computer" });
      expect(await elsewhere.placement(writer)).toMatchObject({ runsOn: "sandbox" });
    });

    // Julian's condition (J): a changed file stops the choice until the person confirms again.
    it("puts the choice on hold when the file changes, until the person confirms again", async () => {
      const files = workspace();
      const host = computer(files);
      await confirm(host);
      const before = await host.placement(writer);
      files.saved[writerPath] = `${files.saved[writerPath]}instructions: Reply to everyone.\n`;
      const held = await host.placement(writer);
      expect(held?.runsOn).toBe("on-hold");
      expect(held?.fingerprint).not.toBe(before?.fingerprint);
      expect(await confirm(host)).toEqual({ saved: true });
      expect(await host.placement(writer)).toMatchObject({ runsOn: "this-computer" });
    });

    it("saves nothing when the file changed after the warning was shown", async () => {
      const files = workspace();
      const host = computer(files);
      const shown = await host.placement(writer);
      files.saved[writerPath] = `${files.saved[writerPath]}# edited\n`;
      const now = await host.placement(writer);
      expect(await host.chooseThisComputer(writer, shown?.fingerprint ?? "")).toEqual({
        saved: false,
        fingerprint: now?.fingerprint,
      });
      expect(await host.placement(writer)).toMatchObject({ runsOn: "sandbox" });
    });

    it("keeps an agent's choice to its own hub, not another hub's agent with the same id", async () => {
      const files = workspace();
      const betaWriter = { hubId: "beta", id: "writer" };
      files.saved["hubs/beta/hub.yaml"] = "id: beta\nname: Beta\n";
      files.saved["hubs/beta/agents/writer.agent.yaml"] = files.saved[writerPath] ?? "";
      Object.assign(files.unsaved, files.saved);
      const host = computer(files);
      await confirm(host);
      expect(await host.placement(writer)).toMatchObject({ runsOn: "this-computer" });
      expect(await host.placement(betaWriter)).toMatchObject({ runsOn: "sandbox" });
    });

    it("puts the agent back in its sandbox", async () => {
      const host = computer(workspace());
      await confirm(host);
      await host.chooseSandbox(writer);
      expect(await host.placement(writer)).toMatchObject({ runsOn: "sandbox" });
    });

    it("fingerprints the saved file, not unsaved changes", async () => {
      const files = workspace();
      const host = computer(files);
      const before = await host.placement(writer);
      files.unsaved[writerPath] = `${files.unsaved[writerPath]}# not saved yet\n`;
      expect((await host.placement(writer))?.fingerprint).toBe(before?.fingerprint);
    });

    // Julian's HAL-13201 review: the warning must not let out a saved file the person isn't looking at.
    it("says when the agent's file has unsaved changes, and not for another file's", async () => {
      const files = workspace();
      const host = computer(files);
      files.unsaved["hubs/acme/hub.yaml"] = "id: acme\nname: Acme Inc\n";
      expect(await host.placement(writer)).toMatchObject({ unsaved: false });
      files.unsaved[writerPath] = `${files.unsaved[writerPath]}# not saved yet\n`;
      expect(await host.placement(writer)).toMatchObject({ unsaved: true });
      files.saved[writerPath] = files.unsaved[writerPath] ?? "";
      expect(await host.placement(writer)).toMatchObject({ unsaved: false });
    });

    it("offers no choice without an agent host", async () => {
      const host = new WorkspaceAgents({ files: filesOf(workspace()), onChange: () => () => {} });
      expect(await host.placement(writer)).toBeUndefined();
      await expect(host.chooseThisComputer(writer, "sha256:any")).rejects.toThrow();
      await expect(host.chooseSandbox(writer)).rejects.toThrow();
    });

    it("rejects with not_found for an agent the hub doesn't have", async () => {
      const host = computer(workspace());
      await expect(host.placement({ hubId: "acme", id: "nobody" })).rejects.toMatchObject({
        kind: "not_found",
      });
    });
  });
});
