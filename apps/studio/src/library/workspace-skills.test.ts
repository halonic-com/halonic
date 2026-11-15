import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { WorkspaceSkills } from "./workspace-skills.ts";

function setup() {
  const store: Record<string, string> = {
    "workspace.yaml": "id: acme\nname: Acme\n",
    "hubs/support/hub.yaml": "id: support\nname: Support\n",
    "hubs/support/library/skills/refunds/SKILL.md":
      "---\nname: Refunds\ndescription: Use for refund questions\n---\nBe kind.\n",
    "hubs/support/library/skills/refunds/scripts/fetch.py": "print(1)\n",
    "library/skills/tone/SKILL.md": "---\nname: Tone\ndescription: How we write\n---\nPlain.\n",
    "hubs/support/agents/helper.agent.yaml":
      "id: helper\nname: Helper\nskills: [refunds]\nmodel: test\n",
  };
  const changes: Array<[string, Record<string, string | null>]> = [];
  const listeners = new Set<() => void>();
  const host = new WorkspaceSkills({
    files: {
      read: async (path) => store[path] ?? null,
      list: async (dir) =>
        Object.keys(store)
          .filter((path) => path.startsWith(`${dir}/`))
          .sort(),
      change: (label, made) => changes.push([label, made]),
    },
    onChange: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  });
  return { host, changes, listeners };
}

verifies("library.skill-page", () => {
  it("reads a skill's text and lists the other files in its folder", async () => {
    const { host } = setup();
    const source = await host.read({ hub: "support", id: "refunds" });
    expect(source?.text).toContain("name: Refunds");
    expect(source?.files).toEqual([
      {
        label: "scripts/fetch.py",
        id: "hubs/support/library/skills/refunds/scripts/fetch.py",
      },
    ]);
  });

  it("reads a skill the workspace shares, and none that is missing", async () => {
    const { host } = setup();
    expect((await host.read({ hub: null, id: "tone" }))?.files).toEqual([]);
    expect(await host.read({ hub: null, id: "nope" })).toBeUndefined();
  });

  it("writes SKILL.md as one change, not a save", async () => {
    const { host, changes } = setup();
    await host.write({ hub: null, id: "tone" }, "new");
    expect(changes).toEqual([["Edited skill tone", { "library/skills/tone/SKILL.md": "new" }]]);
  });

  it("says which agents use the skill", async () => {
    const { host } = setup();
    const usage = await host.usage({ hub: "support", id: "refunds" });
    expect(usage.agents.map((agent) => agent.id)).toEqual(["helper"]);
  });

  it("tells a listener when files change, until it stops", () => {
    const { host, listeners } = setup();
    const stop = host.subscribe(() => undefined);
    expect(listeners.size).toBe(1);
    stop();
    expect(listeners.size).toBe(0);
  });
});
