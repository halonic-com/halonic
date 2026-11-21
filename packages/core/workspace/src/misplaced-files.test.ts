import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { loadWorkspace } from "./index.ts";
import { misplacedFile } from "./misplaced-files.ts";
import { MemorySource } from "./test/memory-source.ts";

/** A workspace always has its settings file; the tests below add theirs to it. */
const settings = { "workspace.yaml": "id: acme\nname: Acme\n" };

verifies("workspace.misplaced-files", () => {
  describe("a file in the wrong scope", () => {
    it("points a collection inside a hub to the workspace root", async () => {
      const path = "hubs/billing/library/collections/invoices.collection.yaml";
      const workspace = await loadWorkspace(
        new MemorySource({ ...settings, [path]: "id: invoices\n" }),
      );
      expect(workspace.ignored).toEqual([path]);
      expect(workspace.issues).toEqual([
        {
          severity: "warning",
          source: "check",
          code: "misplaced-file",
          path: [],
          message:
            "Halonic reads this file only at the workspace root, as library/collections/invoices.collection.yaml",
          file: path,
          line: 1,
          col: 1,
        },
      ]);
    });

    it("points a provider inside a hub to the workspace root", () => {
      expect(misplacedFile("hubs/billing/providers/openai.yaml")?.message).toBe(
        "Halonic reads this file only at the workspace root, as providers/openai.yaml",
      );
    });

    it("points a hub's own file at the root into a hub", () => {
      expect(misplacedFile("hub.yaml")?.message).toBe(
        "Halonic reads this file only inside a hub, as hubs/<hub>/hub.yaml",
      );
    });
  });

  describe("a kind's file saved as .yml", () => {
    it.each([
      ["models.yml", "Halonic reads models.yaml, not models.yml: rename it"],
      ["workspace.yml", "Halonic reads workspace.yaml, not workspace.yml: rename it"],
      ["providers/mock.yml", "Halonic reads mock.yaml, not mock.yml: rename it"],
      // HAL-14297: the kind's suffix is already there, so it isn't added twice.
      [
        "hubs/notes/agents/announcer.agent.yml",
        "Halonic reads announcer.agent.yaml, not announcer.agent.yml: rename it",
      ],
      [
        "hubs/notes/workflows/routines/friday-digest.routine.yml",
        "Halonic reads friday-digest.routine.yaml, not friday-digest.routine.yml: rename it",
      ],
    ])("names the .yaml name of %s", (path, message) => {
      expect(misplacedFile(path)?.message).toBe(message);
    });
  });

  describe("a kind's file in a folder Halonic doesn't read it from", () => {
    it("moves a hub folder outside hubs/ into it, and its agents with it", async () => {
      const files = {
        "notes/hub.yaml": "id: notes\nname: Notes\n",
        "notes/agents/announcer.agent.yaml": "id: announcer\n",
      };
      const workspace = await loadWorkspace(new MemorySource({ ...settings, ...files }));
      expect(workspace.ignored).toEqual(Object.keys(files).sort());
      expect(workspace.issues.map(({ file, message }) => ({ file, message }))).toEqual([
        {
          file: "notes/agents/announcer.agent.yaml",
          message:
            "Halonic reads <id>.agent.yaml files only in agents/: move it to hubs/notes/agents/announcer.agent.yaml",
        },
        {
          file: "notes/hub.yaml",
          message: "Halonic reads hub.yaml only in hubs/<id>/: move notes/ to hubs/notes/",
        },
      ]);
    });

    it.each([
      [
        "hubs/notes/routines/friday-digest.routine.yaml",
        "Halonic reads <id>.routine.yaml files only in workflows/routines/: move it to hubs/notes/workflows/routines/friday-digest.routine.yaml",
      ],
      [
        "hubs/notes/agent/announcer.agent.yaml",
        "Halonic reads <id>.agent.yaml files only in agents/: move it to hubs/notes/agents/announcer.agent.yaml",
      ],
      [
        "hubs/notes/announce.workflow.yaml",
        "Halonic reads <id>.workflow.yaml files only in workflows/: move it to hubs/notes/workflows/announce.workflow.yaml",
      ],
      [
        "hubs/notes/announce.test.yml",
        "Halonic reads <id>.test.yaml files only in workflows/: move it to hubs/notes/workflows/announce.test.yaml",
      ],
      [
        "agent/announcer.agent.yaml",
        "Halonic reads <id>.agent.yaml files only in agents/: move it to agents/announcer.agent.yaml",
      ],
      [
        "hubs/notes/collections/invoices.collection.yaml",
        "Halonic reads <id>.collection.yaml files only in library/collections/: move it to library/collections/invoices.collection.yaml",
      ],
      [
        "hubs/notes/old/hub.yaml",
        "Halonic reads hub.yaml only in hubs/<id>/: move hubs/notes/old/ to hubs/old/",
      ],
      ["hub.yml", "Halonic reads hub.yaml only in hubs/<id>/"],
    ])("says where %s goes", (path, message) => {
      expect(misplacedFile(path)?.message).toBe(message);
    });
  });

  describe("a YAML file in a kind's folder with the wrong name", () => {
    it("names the agent suffix and the file's new name", () => {
      expect(misplacedFile("agents/clerk.yaml")?.message).toBe(
        "Halonic reads files in agents/ only when they're named <id>.agent.yaml: rename it to clerk.agent.yaml",
      );
    });

    it("names every kind the folder takes, in a hub too", () => {
      expect(misplacedFile("hubs/billing/workflows/invoice.yml")?.message).toBe(
        "Halonic reads files in workflows/ only when they're named <id>.workflow.yaml or <id>.test.yaml: rename it to invoice.workflow.yaml or invoice.test.yaml",
      );
    });

    it("leaves a workspace-only kind's folder inside a hub alone", () => {
      expect(misplacedFile("hubs/billing/runtimes/local.yml")).toBeUndefined();
    });
  });

  it("gives no warning for a file not meant as a kind's", async () => {
    const others = [
      "notes/README.md",
      "agents/README.md",
      "hubs/billing/flows/archive.flow.yaml",
      // The layout from before the renames (HAL-2299).
      "projects/p/agents/a.agent.yaml",
      "projects/p/flows/greet.test.yaml",
      "flows/greet.test.yaml",
    ];
    const files = Object.fromEntries(others.map((path) => [path, "text\n"]));
    const workspace = await loadWorkspace(new MemorySource({ ...settings, ...files }));
    expect(workspace.ignored).toEqual([...others].sort());
    expect(workspace.issues).toEqual([]);
  });
});
