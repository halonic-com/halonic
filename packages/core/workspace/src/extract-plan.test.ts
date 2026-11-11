import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { loadWorkspace, planHubExtract } from "./index.ts";
import { home, homeFiles } from "./test/home-workspace.ts";
import { MemorySource } from "./test/memory-source.ts";

async function planOf(hub: string, source = home()) {
  return planHubExtract(await loadWorkspace(source), hub);
}

verifies("workspace.extract", () => {
  describe("the plan", () => {
    it("takes the hub, what its agents and routines use, and what every workspace needs", async () => {
      const workspace = await loadWorkspace(home());
      expect(workspace.issues.filter((issue) => issue.severity === "error")).toEqual([]);

      const plan = planHubExtract(workspace, "family");

      expect(plan.ok && plan.value.files).toEqual([
        { path: ".gitignore", part: "workspace" },
        { path: "docs/notes/recipes.md", part: "shared" },
        { path: "hubs/family/README.md", part: "hub" },
        { path: "hubs/family/agents/helper.agent.yaml", part: "hub" },
        { path: "hubs/family/hub.yaml", part: "hub" },
        { path: "library/collections/chores.collection.yaml", part: "shared" },
        { path: "library/collections/people.collection.yaml", part: "shared" },
        { path: "library/connectors/mailbox.connector.yaml", part: "shared" },
        { path: "library/knowledge/notes.yaml", part: "shared" },
        { path: "library/skills/tone/SKILL.md", part: "shared" },
        { path: "library/skills/tone/examples.md", part: "shared" },
        { path: "models.yaml", part: "workspace" },
        { path: "providers/mock.yaml", part: "workspace" },
        { path: "runtimes/inprocess.yaml", part: "workspace" },
        { path: "workflows/routines/morning-mail.routine.yaml", part: "workspace" },
      ]);
      expect(plan.ok && plan.value.uses).toEqual({
        connectors: ["mailbox"],
        skills: ["tone"],
        knowledge: ["notes"],
        collections: ["chores", "people"],
      });
      expect(plan.ok && plan.value.settings).toEqual({
        id: "family",
        name: "Family affairs",
        description: "Chores and meals.",
      });
    });

    it("takes only what a hub lists in uses, when it lists them", async () => {
      const plan = await planOf("investing");

      expect(plan.ok && plan.value.uses).toEqual({
        connectors: ["bank"],
        skills: [],
        knowledge: [],
        collections: [],
      });
      const shared = plan.ok ? plan.value.files.filter((file) => file.part === "shared") : [];
      expect(shared.map((file) => file.path)).toEqual(["library/connectors/bank.connector.yaml"]);
    });

    it("leaves deployments, the other hubs and the root's other files behind", async () => {
      const plan = await planOf("family");

      const paths = plan.ok ? plan.value.files.map((file) => file.path) : [];
      for (const left of ["deployments.yaml", "README.md", "docs/other.md"]) {
        expect(paths).not.toContain(left);
      }
      expect(paths.filter((path) => path.startsWith("hubs/investing/"))).toEqual([]);
      expect(paths).not.toContain("library/skills/unused/SKILL.md");
      expect(paths).not.toContain("library/connectors/bank.connector.yaml");
    });

    it("takes no shared item that the hub has its own copy of", async () => {
      const ownTone = "---\nname: Our tone\ndescription: Ours.\n---\nOurs.\n";
      const plan = await planOf(
        "family",
        home({ "hubs/family/library/skills/tone/SKILL.md": ownTone }),
      );

      expect(plan.ok && plan.value.uses.skills).toEqual([]);
      const paths = plan.ok ? plan.value.files.map((file) => file.path) : [];
      expect(paths).toContain("hubs/family/library/skills/tone/SKILL.md");
      expect(paths).not.toContain("library/skills/tone/SKILL.md");
    });
  });

  describe("knowledge documents", () => {
    const documentsOf = async (path: string, provider = "files") => {
      const notes = `id: notes\nprovider: ${provider}\nconfig:\n  path: ${path}\n`;
      const plan = await planOf("family", home({ "library/knowledge/notes.yaml": notes }));
      return plan.ok
        ? plan.value.files.map((file) => file.path).filter((p) => p.startsWith("docs/"))
        : [];
    };

    it("reads the path from the workspace root, with ./ and \\ allowed", async () => {
      expect(await documentsOf("./docs\\notes/")).toEqual(["docs/notes/recipes.md"]);
    });

    it("takes no document for a path that is absolute or leaves the workspace", async () => {
      expect(await documentsOf("/docs/notes")).toEqual([]);
      expect(await documentsOf("C:/docs/notes")).toEqual([]);
      expect(await documentsOf("docs/../docs/notes")).toEqual([]);
      expect(await documentsOf(".")).toEqual([]);
    });

    it("takes no document for a source that isn't files", async () => {
      expect(await documentsOf("docs/notes", "vector")).toEqual([]);
    });

    it("takes the documents of the hub's own files source as part of the hub", async () => {
      // `docs` holds the shared notes' documents too: those stay shared.
      const ledger = "id: ledger\nprovider: files\nconfig:\n  path: docs\n";
      const plan = await planOf(
        "family",
        home({ "hubs/family/library/knowledge/ledger.yaml": ledger }),
      );

      const documents = plan.ok
        ? plan.value.files.filter((file) => file.path.startsWith("docs/"))
        : [];
      expect(documents).toEqual([
        { path: "docs/notes/recipes.md", part: "shared" },
        { path: "docs/other.md", part: "hub" },
      ]);
    });
  });

  it("names the new workspace after the hub's folder when the hub has no hub.yaml", async () => {
    const files = { ...homeFiles };
    delete files["hubs/investing/hub.yaml"];

    const plan = await planOf("investing", new MemorySource(files));

    expect(plan.ok && plan.value.settings).toEqual({ id: "investing", name: "investing" });
  });

  describe("refusals", () => {
    it("refuses a hub it doesn't have, and names the ones there are", async () => {
      expect(await planOf("famly")).toEqual({
        ok: false,
        error: { kind: "unknown_hub", hub: "famly", hubs: ["family", "investing"] },
      });
    });

    it("finds no hub in a workspace with files at the root only", async () => {
      const source = new MemorySource({
        "workspace.yaml": "id: solo\nname: Solo\n",
        "agents/helper.agent.yaml": "id: helper\nname: Helper\ninstructions: Help.\n",
      });

      expect(await planOf("solo", source)).toEqual({
        ok: false,
        error: { kind: "unknown_hub", hub: "solo", hubs: [] },
      });
    });

    it("refuses a workspace with errors", async () => {
      const broken = "id: helper\nname: Helper\ninstructions: Help.\nskills: [missing]\n";
      const plan = await planOf("family", home({ "hubs/family/agents/helper.agent.yaml": broken }));

      expect(plan).toEqual({ ok: false, error: { kind: "has_errors", errors: 1 } });
    });
  });
});
