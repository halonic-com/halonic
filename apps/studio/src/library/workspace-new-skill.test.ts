import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { WorkspaceNewSkill } from "./workspace-new-skill.ts";

function setup() {
  const store: Record<string, string> = {
    "workspace.yaml": "id: acme\nname: Acme\n",
    "hubs/support/hub.yaml": "id: support\nname: Support\n",
    "hubs/support/library/skills/refunds/SKILL.md":
      "---\nname: Refunds\ndescription: Use for refund questions\n---\nBe kind.\n",
  };
  const changes: Array<[string, Record<string, string | null>]> = [];
  const host = new WorkspaceNewSkill({
    files: {
      read: async (path) => store[path] ?? null,
      list: async (dir) =>
        Object.keys(store)
          .filter((path) => path.startsWith(`${dir}/`))
          .sort(),
      change: (label, made) => changes.push([label, made]),
    },
    onChange: () => () => undefined,
  });
  return { host, changes };
}

verifies("library.new-skill", () => {
  it("lists the hubs and names the folder the skill would go in", async () => {
    const { host } = setup();
    await host.prepare();
    expect(host.hubs()).toEqual([{ id: "support", name: "Support" }]);
    expect(host.folder({ name: "", description: "", hub: "support" })).toBe(
      "hubs/support/library/skills/",
    );
    expect(host.folder({ name: "Refunds", description: "", hub: "support" })).toBe(
      "hubs/support/library/skills/refunds-2/",
    );
  });

  it("writes the new skill as one change and says where it is", async () => {
    const { host, changes } = setup();
    const skill = await host.create({ name: "Tone", description: "How we write", hub: null });
    expect(skill).toEqual({ hub: null, id: "tone" });
    expect(changes).toHaveLength(1);
    expect(changes[0]?.[0]).toBe("Added skill tone");
    expect(changes[0]?.[1]["library/skills/tone/SKILL.md"]).toContain("description: How we write");
  });

  it("refuses a missing description in a sentence and writes nothing", async () => {
    const { host, changes } = setup();
    await expect(host.create({ name: "Tone", description: " ", hub: null })).rejects.toThrow(
      "Say when an agent should use this skill.",
    );
    expect(changes).toEqual([]);
  });
});
