import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { FolderDefinitionStore } from "@halonicjs/adapter-fs-node";
import { verifies } from "@halonicjs/testing-spec";
import { type LoadedWorkspace, loadWorkspace } from "@halonicjs/workspace";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { waitingListFacts, workspaceWaitFacts } from "./wait-facts.ts";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "halonic-wait-facts-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const review =
  "Approve this reply?\n{{context.reply}}\n\nApproving finishes the run. Nothing is sent.";

/** A small Support reply, as Acme's: it starts with `mail` and waits at `review`. */
const workflow = `id: support-reply
name: Support reply
initial: review
start: { label: Answer a customer's email, field: mail }
states:
  review:
    type: wait
    description: |-
${review
  .split("\n")
  .map((line) => (line === "" ? "" : `      ${line}`))
  .join("\n")}
    on:
      - event: approve
        to: sent
  sent:
    type: final
`;

async function workspaceOf(files: Record<string, string>): Promise<LoadedWorkspace> {
  const all = { "workspace.yaml": "id: acme\nname: Acme\n", ...files };
  for (const [path, text] of Object.entries(all)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return loadWorkspace(new FolderDefinitionStore(root, "./acme"));
}

describe("the workflows and test models a served workspace gives its waiting list", () => {
  verifies("cli.commands.serve.wait-facts", () => {
    it("names a hub's workflow, its start field and its steps' descriptions as written", async () => {
      const workspace = await workspaceOf({
        "hubs/support/hub.yaml": "id: support\nname: Support\n",
        "hubs/support/workflows/support-reply.workflow.yaml": workflow,
      });
      const facts = await workspaceWaitFacts(async () => workspace)();
      const found = facts.workflow("support", "support-reply");
      expect(found?.name).toBe("Support reply");
      expect(found?.startField).toBe("mail");
      expect(found?.stepDescription("review")).toBe(review);
      expect(found?.stepDescription("constructor")).toBeUndefined();
      expect(facts.workflow("billing", "support-reply")).toBeUndefined();
      // `halonic serve` gives the server both, the agents' names beside them.
      const both = waitingListFacts(async () => workspace);
      expect((await both.waitFacts()).workflow("support", "support-reply")?.name).toBe(
        "Support reply",
      );
      expect((await both.agentNames()).size).toBe(0);
    });

    it("tells the test model by its file's `type: mock`, whatever its id", async () => {
      const workspace = await workspaceOf({
        "providers/sample.yaml": "id: sample\ntype: mock\n",
        "providers/openai.yaml": "id: openai\ntype: openai\n",
      });
      const facts = await workspaceWaitFacts(async () => workspace)();
      expect(facts.isTestModel("sample")).toBe(true);
      expect(facts.isTestModel("openai")).toBe(false);
      expect(facts.isTestModel("mock")).toBe(false);
    });
  });
});
