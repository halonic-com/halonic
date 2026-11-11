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
    "counts a file that failed its own checks as missing",
    async () => {
      // models.yaml has a wrong type, so none of its aliases exist.
      const { source } = readParityCase("models/wrong-type");
      const workspace = await loadWorkspace(source);
      const errors = workspace.issues.filter((issue) => issue.source === "check");
      expect(errors.map((issue) => [issue.file, issue.message])).toEqual([
        ["hubs/billing/agents/clerk.agent.yaml", 'Agent "clerk" uses unknown model alias "fast"'],
        [
          "hubs/billing/agents/notifier.agent.yaml",
          'Agent "notifier" uses unknown model alias "default"',
        ],
        [
          "workspace.yaml",
          'The assistant model (assistant.model) uses "fast", which isn\'t an alias in models.yaml.',
        ],
      ]);
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

  describe("in small workspaces", () => {
    const settings = { "workspace.yaml": "id: acme\nname: Acme\n" };
    const errorsIn = async (files: Record<string, string>): Promise<string[]> => {
      const workspace = await loadWorkspace(new MemorySource({ ...settings, ...files }));
      return workspace.issues.map((issue) => `${issue.file}: ${issue.message}`);
    };

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
