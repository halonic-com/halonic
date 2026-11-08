// The old repo's schemas (784f78d: packages/core/schema/src/index.ts and
// collections.ts), unchanged apart from removed comments and types, split in
// files by size. Plain Zod 4.6.7, as the old app ran them: the reference the
// parity tests compare the new kinds' values with.
//
// A frozen copy of schema-kit's src/test/old-*.zod.ts: a package may not
// import another package's test files, and the old code never changes.

import { Agent, Hub, Skill, SkillFrontMatter } from "./old-agents.zod.ts";
import { Collection, Routine, Workflow, WorkflowTest } from "./old-workflow.zod.ts";
import {
  Connector,
  Deployments,
  KnowledgeSource,
  Models,
  Provider,
  Runtime,
  WorkspaceSettings,
} from "./old-workspace.zod.ts";

export { AgentOutput } from "./old-agents.zod.ts";
export { Guard, Transition } from "./old-workflow.zod.ts";
export { Deployment } from "./old-workspace.zod.ts";

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
