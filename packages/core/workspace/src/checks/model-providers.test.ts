import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { loadWorkspace } from "../index.ts";
import { MemorySource } from "../test/memory-source.ts";

const settings = {
  "workspace.yaml": "id: acme\nname: Acme\n",
  "providers/mock.yaml": "id: mock\ntype: mock\n",
};

/** The errors `validate` gives for these files, as "file path: message". */
async function errorsIn(files: Record<string, string>): Promise<string[]> {
  const workspace = await loadWorkspace(new MemorySource({ ...settings, ...files }));
  return workspace.issues
    .filter((issue) => issue.severity === "error")
    .map((issue) => `${issue.file} ${issue.path.join(".")}: ${issue.message}`);
}

// Nina's C340 check, code row C27 (HAL-14301): only models.yaml's aliases were checked.
verifies("workspace.references", () => {
  describe("a provider no file names", () => {
    it("is unknown in a hub's model alias, with the near provider", async () => {
      const errors = await errorsIn({
        "hubs/billing/hub.yaml":
          "name: Billing\nmodels:\n  careful: { provider: mok, model: echo }\n",
      });
      expect(errors).toEqual([
        'hubs/billing/hub.yaml models.careful.provider: Alias "careful" uses unknown provider "mok": Did you mean mock?',
      ]);
    });

    it("says to add its file when no provider is near", async () => {
      const errors = await errorsIn({
        "hubs/billing/hub.yaml":
          "name: Billing\nmodels:\n  smart: { provider: anthropic, model: claude }\n",
      });
      expect(errors).toEqual([
        'hubs/billing/hub.yaml models.smart.provider: Alias "smart" uses unknown provider "anthropic": add providers/anthropic.yaml, or use a provider the workspace has',
      ]);
    });

    it("is unknown in an agent's and a method's provider/model, with the near model", async () => {
      const errors = await errorsIn({
        "agents/writer.agent.yaml":
          "name: Writer\nmodel: mok/echo\nmethods:\n  draft:\n    instructions: Draft it.\n    model: anthropic/claude\n",
      });
      expect(errors).toEqual([
        'agents/writer.agent.yaml model: Agent "writer" uses model "mok/echo", whose provider "mok" the workspace doesn\'t have: Did you mean mock/echo?',
        'agents/writer.agent.yaml methods.draft.model: Method "writer.draft" uses model "anthropic/claude", whose provider "anthropic" the workspace doesn\'t have: add providers/anthropic.yaml, or use a provider the workspace has',
      ]);
    });

    it("is unknown in the workspace's default model", async () => {
      const errors = await errorsIn({
        "workspace.yaml": "id: acme\nname: Acme\ndefaults:\n  model: mok/echo\n",
      });
      expect(errors).toEqual([
        'workspace.yaml defaults.model: The default model uses model "mok/echo", whose provider "mok" the workspace doesn\'t have: Did you mean mock/echo?',
      ]);
    });

    it("isn't unknown when it is there, or when its file failed its own checks", async () => {
      const errors = await errorsIn({
        "providers/local.yaml": "id: local\ntype: carrier-pigeon\n",
        "hubs/billing/hub.yaml":
          "name: Billing\nmodels:\n  careful: { provider: mock, model: echo }\n  near: { provider: local, model: llama }\n",
        "agents/writer.agent.yaml": "name: Writer\nmodel: local/llama\n",
      });
      expect(errors.filter((error) => error.includes("unknown provider"))).toEqual([]);
      expect(errors.filter((error) => error.includes("the workspace doesn't have"))).toEqual([]);
    });
  });
});
