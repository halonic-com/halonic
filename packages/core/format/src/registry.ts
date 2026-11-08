import type { FileKind } from "./kind.ts";
import { agentKind } from "./kinds/agent/kind.ts";
import type { Agent } from "./kinds/agent/schema.ts";
import { collectionKind } from "./kinds/collection/kind.ts";
import type { Collection } from "./kinds/collection/schema.ts";
import { connectorKind } from "./kinds/connector/kind.ts";
import type { Connector } from "./kinds/connector/schema.ts";
import { deploymentsKind } from "./kinds/deployments/kind.ts";
import type { Deployments } from "./kinds/deployments/schema.ts";
import { hubKind } from "./kinds/hub/kind.ts";
import type { Hub } from "./kinds/hub/schema.ts";
import { knowledgeKind } from "./kinds/knowledge/kind.ts";
import type { KnowledgeSource } from "./kinds/knowledge/schema.ts";
import { modelsKind } from "./kinds/models/kind.ts";
import type { Models } from "./kinds/models/schema.ts";
import { providerKind } from "./kinds/provider/kind.ts";
import type { Provider } from "./kinds/provider/schema.ts";
import { runtimeKind } from "./kinds/runtime/kind.ts";
import type { Runtime } from "./kinds/runtime/schema.ts";
import { skillKind } from "./kinds/skill/kind.ts";
import type { Skill } from "./kinds/skill/schema.ts";
import { workflowKind } from "./kinds/workflow/kind.ts";
import type { Workflow } from "./kinds/workflow/schema.ts";
import { workspaceKind } from "./kinds/workspace/kind.ts";
import type { WorkspaceSettings } from "./kinds/workspace/schema.ts";

/** The value each file kind parses to, by kind name. */
export interface KindValues {
  workspace: WorkspaceSettings;
  deployments: Deployments;
  models: Models;
  provider: Provider;
  runtime: Runtime;
  knowledge: KnowledgeSource;
  collection: Collection;
  connector: Connector;
  skill: Skill;
  hub: Hub;
  agent: Agent;
  workflow: Workflow;
}

/** The name of a file kind: `workspace`, `agent`, `workflowTest`, … */
export type KindName = keyof KindValues;

/**
 * Every file kind, by name. Adding a kind means adding its folder under
 * `kinds/` and one line here; the loader and the tooling read this list
 * instead of switching on kind names.
 */
export const fileKinds: { readonly [Name in KindName]: FileKind<KindValues[Name]> } = {
  workspace: workspaceKind,
  deployments: deploymentsKind,
  models: modelsKind,
  provider: providerKind,
  runtime: runtimeKind,
  knowledge: knowledgeKind,
  collection: collectionKind,
  connector: connectorKind,
  skill: skillKind,
  hub: hubKind,
  agent: agentKind,
  workflow: workflowKind,
};

/**
 * The names of every file kind, workspace-level kinds first, in a fixed order.
 *
 * @example
 * for (const name of kindNames()) console.log(name, fileKinds[name].about);
 */
export function kindNames(): readonly KindName[] {
  return Object.keys(fileKinds) as KindName[];
}

/**
 * Whether a text names a file kind, for input from outside such as a CLI
 * argument.
 *
 * @example
 * isKindName("agent"); // true
 * isKindName("toString"); // false
 */
export function isKindName(name: string): name is KindName {
  return Object.hasOwn(fileKinds, name);
}
