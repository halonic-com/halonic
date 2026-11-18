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
    const others = ["notes/README.md", "agents/README.md", "hubs/billing/flows/archive.flow.yaml"];
    const files = Object.fromEntries(others.map((path) => [path, "text\n"]));
    const workspace = await loadWorkspace(new MemorySource({ ...settings, ...files }));
    expect(workspace.ignored).toEqual([...others].sort());
    expect(workspace.issues).toEqual([]);
  });
});
