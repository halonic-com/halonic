import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { loadWorkspace } from "../index.ts";
import { MemorySource } from "../test/memory-source.ts";

/** The warnings with `code` in a workspace of these files, as `file path line: message`. */
async function warnings(code: string, files: Record<string, string>): Promise<string[]> {
  const workspace = await loadWorkspace(new MemorySource(files));
  return workspace.issues
    .filter((issue) => issue.code === code)
    .map((issue) => {
      expect(issue.severity).toBe("warning");
      return `${issue.file} ${issue.path.join(".")} ${issue.line}: ${issue.message}`;
    });
}

const hub = (runtime: string) => `id: support\nname: Support\ndefaults:\n  runtime: ${runtime}\n`;

verifies("workspace.ignored-settings", () => {
  describe("defaults.runtime", () => {
    it("warns about a runtime Halonic doesn't have, in the workspace and in a hub", async () => {
      const found = await warnings("unknown-runtime", {
        "workspace.yaml": "id: acme\nname: Acme\ndefaults:\n  runtime: docker\n",
        "hubs/support/hub.yaml": hub("docker"),
      });
      const message =
        'Runtime "docker" isn\'t one Halonic has; it runs inprocess. Remove defaults.runtime, or set it to inprocess.';
      expect(found).toEqual([
        `hubs/support/hub.yaml defaults.runtime 4: ${message}`,
        `workspace.yaml defaults.runtime 4: ${message}`,
      ]);
    });

    it("says nothing about inprocess or a runtime left out", async () => {
      const found = await warnings("unknown-runtime", {
        "workspace.yaml": "id: acme\nname: Acme\n",
        "hubs/support/hub.yaml": hub("inprocess"),
      });
      expect(found).toEqual([]);
    });
  });

  describe("instructions that name a file", () => {
    const workspace = { "workspace.yaml": "id: acme\nname: Acme\n" };

    it("warns about an agent's instructions that name a file next to it", async () => {
      const found = await warnings("instructions-file-name", {
        ...workspace,
        "agents/announcer.agent.yaml": "name: Announcer\ninstructions: ./announcer.md\n",
        "agents/announcer.md": "Announce the news.\n",
      });
      expect(found).toEqual([
        'agents/announcer.agent.yaml instructions 2: instructions is the text "./announcer.md". Paste the instructions here; Halonic doesn\'t read files from instructions.',
      ]);
    });

    it("warns about a method's instructions that name a file from the workspace root", async () => {
      const agent = [
        "name: Clerk",
        "instructions: Sort the mail.",
        "methods:",
        "  extract:",
        "    instructions: prompts/extract.md",
        "",
      ].join("\n");
      const found = await warnings("instructions-file-name", {
        ...workspace,
        "hubs/support/hub.yaml": "id: support\nname: Support\n",
        "hubs/support/agents/clerk.agent.yaml": agent,
        "prompts/extract.md": "Find the invoice number.\n",
      });
      expect(found).toEqual([
        'hubs/support/agents/clerk.agent.yaml methods.extract.instructions 5: instructions is the text "prompts/extract.md". Paste the instructions here; Halonic doesn\'t read files from instructions.',
      ]);
    });

    it("says nothing about a name the workspace has no file for, or about several lines", async () => {
      const found = await warnings("instructions-file-name", {
        ...workspace,
        "agents/a.agent.yaml": "name: A\ninstructions: ./missing.md\n",
        "agents/b.agent.yaml": "name: B\ninstructions: |\n  ./notes.md\n  Then answer.\n",
        "agents/notes.md": "Notes\n",
      });
      expect(found).toEqual([]);
    });
  });
});
