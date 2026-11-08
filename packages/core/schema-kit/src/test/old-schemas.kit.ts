// The old repo's schemas written with schema-kit: the Zod files with `z.`
// replaced by `s.` and `z.ZodType` by `Schema`, nothing else. They show that
// format/kinds can hold every old schema without importing Zod, and the tests
// check that parse gives the same verdict as plain Zod on them.

import { Agent, Hub, Skill, SkillFrontMatter } from "./old-agents.kit.ts";
import { Collection, Routine, Workflow, WorkflowTest } from "./old-workflow.kit.ts";
import {
  Connector,
  Deployments,
  KnowledgeSource,
  Models,
  Provider,
  Runtime,
  WorkspaceSettings,
} from "./old-workspace.kit.ts";

export { AgentOutput } from "./old-agents.kit.ts";
export { Guard, Transition } from "./old-workflow.kit.ts";
export { Deployment } from "./old-workspace.kit.ts";

/** Every file kind's schema, plus the two the old JSON Schema export left out. */
export const fileSchemas = {
  workspace: WorkspaceSettings,
  deployments: Deployments,
  provider: Provider,
  models: Models,
  runtime: Runtime,
  knowledge: KnowledgeSource,
  connector: Connector,
  hub: Hub,
  agent: Agent,
  workflow: Workflow,
  workflowTest: WorkflowTest,
  routine: Routine,
  collection: Collection,
  skillFrontMatter: SkillFrontMatter,
  skill: Skill,
} as const;
