import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { WorkspaceLibraryItems } from "./workspace-library-items.ts";

function setup(extra: Record<string, string> = {}) {
  const store: Record<string, string> = {
    "workspace.yaml": "id: acme\nname: Acme\n",
    "hubs/support/hub.yaml": "id: support\nname: Support\n",
    "hubs/empty/hub.yaml": "id: empty\nname: Empty\n",
    "hubs/support/library/skills/refunds/SKILL.md":
      "---\nname: Refunds\ndescription: Use for refund questions\n---\nBe kind.\n",
    "library/skills/tone/SKILL.md": "---\nname: Tone\ndescription: How we write\n---\nPlain.\n",
    "hubs/support/agents/helper.agent.yaml":
      "id: helper\nname: Helper\nskills: [refunds]\nmodel: test\n",
    "library/collections/claims.collection.yaml":
      "id: claims\nname: Claims\nfields:\n  amount: { type: number }\n  note: { type: text }\n",
    ...extra,
  };
  const listeners = new Set<() => void>();
  const host = new WorkspaceLibraryItems({
    files: {
      read: async (path) => store[path] ?? null,
      list: async (dir) =>
        Object.keys(store)
          .filter((path) => path.startsWith(`${dir}/`))
          .sort(),
    },
    onChange: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  });
  return { host, listeners };
}

verifies("library.library-page", () => {
  it("lists a kind's items by hub, then what the workspace shares", async () => {
    const { host } = setup();
    const listing = await host.list("skill");
    expect(listing.hubs.map((hub) => [hub.id, hub.entries.map((entry) => entry.name)])).toEqual([
      ["empty", []],
      ["support", ["Refunds"]],
    ]);
    expect(listing.shared?.workspaceName).toBe("Acme");
    expect(listing.shared?.entries.map((entry) => entry.name)).toEqual(["Tone"]);
    expect(listing.shared?.entries[0]?.detail).toBe("How we write");
  });

  it("says who uses an item", async () => {
    const { host } = setup();
    const refunds = (await host.list("skill")).hubs.find((hub) => hub.id === "support")?.entries[0];
    expect(refunds?.usage.agents.map((agent) => agent.id)).toEqual(["helper"]);
  });

  it("counts a collection's fields as its detail", async () => {
    const { host } = setup();
    expect((await host.list("collection")).shared?.entries[0]?.detail).toBe("2 fields");
  });

  it("leaves out the shared section when nothing is shared", async () => {
    const { host } = setup();
    expect((await host.list("connector")).shared).toBeUndefined();
  });

  it("tells the app when the files change, until it stops", () => {
    const { host, listeners } = setup();
    const stop = host.subscribe(() => {});
    expect(listeners.size).toBe(1);
    stop();
    expect(listeners.size).toBe(0);
  });
});
