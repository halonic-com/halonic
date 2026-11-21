import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { loadWorkspace } from "../index.ts";
import { MemorySource } from "../test/memory-source.ts";
import {
  errorsOf,
  expectedError,
  parityLoadLimitMs,
  readParityCase,
} from "../test/parity-cases.spec.ts";

// Each case breaks one name; the issue sits where its case file says.
const referenceCases = [
  "agent/unknown-model",
  "agent/unknown-method-model",
  "agent/unknown-skill",
  "agent/unknown-knowledge",
  "agent/unknown-collection",
  "agent/unknown-connector",
  "agent/unknown-subagent",
  "agent/own-subagent",
  "hub/uses-leaves-out",
  "models/unknown-provider",
  "models/unknown-fallback",
  "workflowTest/unknown-workflow",
];

verifies("workspace.references", () => {
  it.each(referenceCases)(
    "gives %s the old loader's error, at the key path and line of the name",
    async (caseId) => {
      expect(await errorsOf(caseId)).toEqual([expectedError(caseId)]);
    },
    parityLoadLimitMs,
  );

  it(
    "names assistant.model and models.yaml for an unknown assistant model alias",
    async () => {
      expect(await errorsOf("workspace/unknown-model")).toEqual([
        {
          ...expectedError("workspace/unknown-model"),
          message:
            'The assistant model (assistant.model) uses "turbo", which isn\'t an alias in models.yaml.',
        },
      ]);
    },
    parityLoadLimitMs,
  );

  it(
    "doesn't call an alias unknown when models.yaml failed its own checks",
    async () => {
      // models.yaml has a wrong type, so its own error is the only one: the
      // old loader also called every alias it has unknown (HAL-14261).
      const { source } = readParityCase("models/wrong-type");
      const workspace = await loadWorkspace(source);
      expect(workspace.issues.map((issue) => issue.file)).toEqual(["models.yaml"]);
    },
    parityLoadLimitMs,
  );

  it.each(["hub/wrong-type", "hub/missing-required", "hub/unknown-key", "hub/deep-nesting"])(
    "leaves out the agents of a hub whose hub.yaml failed, in %s",
    async (caseId) => {
      // The old loader then reports only hub.yaml and the routines that name
      // the hub, never its agents.
      const workspace = await loadWorkspace(readParityCase(caseId).source);
      const errors = workspace.issues.filter((issue) => issue.source === "check");
      expect(errors.map((issue) => [issue.file, issue.message])).toEqual([
        [
          "workflows/routines/hourly-check.routine.yaml",
          'Routine "hourly-check": unknown hub "billing"',
        ],
        ["workflows/routines/on-paid.routine.yaml", 'Routine "on-paid": unknown hub "billing"'],
      ]);
    },
    parityLoadLimitMs,
  );

  it.each(["workflow/missing-required", "workflow/bad-indent"])(
    "doesn't report the test of a workflow whose file failed, in %s",
    async (caseId) => {
      const workspace = await loadWorkspace(readParityCase(caseId).source);
      const messages = workspace.issues.map((issue) => issue.message);
      expect(messages.filter((message) => message.startsWith("Test targets"))).toEqual([]);
      expect(workspace.issues.some((issue) => issue.file.endsWith(".workflow.yaml"))).toBe(true);
    },
    parityLoadLimitMs,
  );

  it("doesn't call the provider of an alias unknown when its file failed (HAL-14260)", async () => {
    const workspace = await loadWorkspace(
      new MemorySource({
        "workspace.yaml": "id: acme\nname: Acme\n",
        "models.yaml": "aliases:\n  default:\n    provider: mock\n    model: echo\n",
        "providers/mock.yaml": "id: mock\ntype: antropic\n",
      }),
    );
    expect(workspace.issues.map((issue) => [issue.file, issue.code])).toEqual([
      ["providers/mock.yaml", "provider-type"],
    ]);
  });

  it.each(["agent/unknown-key", "agent/bad-enum"])(
    "doesn't call an agent whose file failed unknown, in %s",
    async (caseId) => {
      // Only the agent file's own errors are left, so they say what to fix (HAL-14261).
      const workspace = await loadWorkspace(readParityCase(caseId).source);
      expect(workspace.issues.map((issue) => issue.file)).toSatisfy((files: string[]) =>
        files.every((file) => file.endsWith(".agent.yaml")),
      );
      expect(workspace.issues.length).toBeGreaterThan(0);
    },
    parityLoadLimitMs,
  );

  describe("in small workspaces", () => {
    const settings = { "workspace.yaml": "id: acme\nname: Acme\n" };
    const errorsIn = async (files: Record<string, string>): Promise<string[]> => {
      const workspace = await loadWorkspace(new MemorySource({ ...settings, ...files }));
      return workspace.issues.map((issue) => `${issue.file}: ${issue.message}`);
    };

    it("still calls an agent unknown when no file is named after it", async () => {
      const errors = await errorsIn({
        "agents/writer.agent.yaml": "name: Writer\nmodle: smart\n",
        "agents/editor.agent.yaml": "name: Editor\nsubagents: [writer, critic]\n",
      });
      expect(errors).toEqual([
        'agents/editor.agent.yaml: Agent "editor" delegates to unknown agent "critic"',
        'agents/writer.agent.yaml: There\'s no field "modle" in this file. Did you mean "model"?',
      ]);
    });

    it("knows a failed agent by its own id, not by its file name", async () => {
      // writer.agent.yaml is the agent "author": "author" isn't unknown, "writer" is.
      const errors = await errorsIn({
        "agents/writer.agent.yaml": "id: author\nname: Author\nmodle: smart\n",
        "agents/editor.agent.yaml": "name: Editor\nsubagents: [author, writer]\n",
      });
      expect(errors).toEqual([
        'agents/editor.agent.yaml: Agent "editor" delegates to unknown agent "writer"',
        'agents/writer.agent.yaml: There\'s no field "modle" in this file. Did you mean "model"?',
      ]);
    });

    // A file that is there but failed isn't unknown to what names it (C337 C4+, HAL-14261).
    it("doesn't call an agent whose output failed unknown (C337 #18)", async () => {
      const errors = await errorsIn({
        "agents/sorter.agent.yaml": "name: Sorter\noutput:\n  type: choice\n  options: []\n",
        // A workspace-level routine runs an agent only with workflows/ at the root too.
        "workflows/tidy.workflow.yaml":
          "name: Tidy\ninitial: done\nstates:\n  done:\n    type: final\n",
        "workflows/routines/sort.routine.yaml":
          'name: Sort\ntrigger:\n  schedule: "0 9 * * 1"\nrun:\n  agent: sorter\n  prompt: Sort the new items.\n',
      });
      expect(errors).toEqual([
        "agents/sorter.agent.yaml: Too small: expected array to have >=1 items",
      ]);
    });

    it("doesn't call a workflow whose file failed unknown to a routine (C337 #22)", async () => {
      const errors = await errorsIn({
        "agents/reporter.agent.yaml": "name: Reporter\n",
        "workflows/report.workflow.yaml": [
          "name: Report",
          "initial: write",
          "states:",
          "  write:",
          "    agent: reporter",
          "    artifact: { mediaType: text/markdown }",
          "    on:",
          "      - to: done",
          "  done:",
          "    type: final",
          "",
        ].join("\n"),
        "workflows/routines/report.routine.yaml":
          'name: Report\ntrigger:\n  schedule: "0 9 * * 1"\nrun:\n  workflow: report\n',
      });
      expect(errors).toEqual(['workflows/report.workflow.yaml: Missing required key "name"']);
    });

    it("doesn't call a provider whose file failed unknown to an alias (C337 #23)", async () => {
      const errors = await errorsIn({
        "providers/anthropic.yaml": "type: anthropic\nsecret: [anthropic-key]\n",
        "models.yaml": "aliases:\n  smart:\n    provider: anthropic\n    model: claude\n",
      });
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatch(/^providers\/anthropic\.yaml: /);
    });

    it("doesn't call an alias unknown when models.yaml failed (C337 #17)", async () => {
      const errors = await errorsIn({
        "models.yaml": 'aliases:\n  smart:\n    provider: mock\n    model: ""\n',
        "agents/writer.agent.yaml": "name: Writer\nmodel: smart\n",
      });
      expect(errors).toEqual(["models.yaml: Too small: expected string to have >=1 characters"]);
    });

    it("lets a hub without uses take every shared item, and prefers the hub's own", async () => {
      const errors = await errorsIn({
        "hubs/billing/hub.yaml": "name: Billing\n",
        "hubs/billing/agents/clerk.agent.yaml": "name: Clerk\nskills: [plain, own]\n",
        "hubs/billing/library/skills/own/SKILL.md":
          "---\nname: Own\ndescription: Own.\n---\nBe brief.\n",
        "library/skills/plain/SKILL.md": "---\nname: Plain\ndescription: Plain.\n---\nBe plain.\n",
      });
      expect(errors).toEqual([]);
    });

    it("looks up a model alias in the hub, and leaves provider/model names alone", async () => {
      const errors = await errorsIn({
        "hubs/billing/hub.yaml":
          "name: Billing\nmodels:\n  careful: { provider: mock, model: echo }\n",
        "hubs/billing/agents/clerk.agent.yaml": "name: Clerk\nmodel: careful\n",
        "agents/helper.agent.yaml": "name: Helper\nmodel: careful\n",
        "agents/direct.agent.yaml": "name: Direct\nmodel: mock/echo\n",
      });
      expect(errors).toEqual([
        'agents/helper.agent.yaml: Agent "helper" uses unknown model alias "careful"',
      ]);
    });

    it("finds subagents only in the agent's own hub", async () => {
      const errors = await errorsIn({
        "hubs/billing/agents/clerk.agent.yaml": "name: Clerk\nsubagents: [helper]\n",
        "agents/helper.agent.yaml": "name: Helper\n",
      });
      expect(errors).toEqual([
        'hubs/billing/agents/clerk.agent.yaml: Agent "clerk" delegates to unknown agent "helper"',
      ]);
    });
  });
});
