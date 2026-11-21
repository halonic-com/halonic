import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { WorkspaceAgents, type WorkspaceAgentsParts } from "./workspace-agents.ts";

/** A workspace with the one agent `writer` in the hub `acme`; it is only read here. */
const store: Record<string, string> = {
  "models.yaml": "aliases:\n  fast:\n    provider: anthropic\n    model: claude-haiku\n",
  "hubs/acme/hub.yaml": "id: acme\nname: Acme\n",
  "hubs/acme/agents/writer.agent.yaml":
    "id: writer\nname: Writer\ndescription: Drafts replies.\nmodel: fast\n",
};

function setup(openSignIn?: WorkspaceAgentsParts["openSignIn"]) {
  return new WorkspaceAgents({
    files: {
      read: async (path) => store[path] ?? null,
      list: async (dir) =>
        Object.keys(store)
          .filter((path) => path.startsWith(`${dir}/`))
          .sort(),
      change: () => {
        throw new Error("This test changes no files.");
      },
      undo: () => false,
      step: 0,
      pending: {},
    },
    onChange: () => () => {},
    ...(openSignIn === undefined ? {} : { openSignIn }),
  });
}

verifies("studio.workspace-agents-sign-in", () => {
  it("refuses to open a sign-in without an agent host, and for an agent that isn't there", async () => {
    const host = setup();
    await expect(
      host.openHarnessSignIn({ hubId: "acme", id: "writer" }, "claude-code"),
    ).rejects.toThrow("Halonic can't open a terminal on this computer from here.");
    await expect(
      host.openHarnessSignIn({ hubId: "acme", id: "gone" }, "claude-code"),
    ).rejects.toMatchObject({ kind: "not_found" });
  });

  it("asks the agent host's sign-in for the agent it names", async () => {
    const asked: unknown[] = [];
    const host = setup(async (ref, harness) => {
      asked.push([ref, harness]);
      return { opened: true };
    });
    expect(await host.openHarnessSignIn({ hubId: "acme", id: "writer" }, "claude-code")).toEqual({
      opened: true,
    });
    expect(asked).toEqual([[{ hubId: "acme", id: "writer" }, "claude-code"]]);
  });
});
