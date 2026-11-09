import type { HubUses } from "@halonicjs/format";
import type { LoadedFileOf, WorkspaceIssue } from "../load-workspace.ts";
import type { CheckContext } from "./check-context.ts";
import { isAliasName, modelAliasesOf } from "./model-aliases.ts";

type Agent = LoadedFileOf<"agent">;

/** A list of shared items an agent names, and the kind of file each item is. */
interface LibraryList {
  /** The agent's key, which is also the key in a hub's `uses`. */
  readonly key: keyof HubUses;
  readonly kind: "skill" | "knowledge" | "collection" | "connector";
  /** How the old messages name one item. */
  readonly noun: string;
}

const libraryLists: readonly LibraryList[] = [
  { key: "skills", kind: "skill", noun: "skill" },
  { key: "knowledge", kind: "knowledge", noun: "knowledge" },
  { key: "collections", kind: "collection", noun: "collection" },
  { key: "connectors", kind: "connector", noun: "connector" },
];

/**
 * What an agent names in other files: its model aliases, its skills,
 * knowledge, collections and connectors, and its subagents. The messages
 * are the old loader's. An agent in a hub whose `hub.yaml` failed isn't
 * checked: the old loader left that hub out.
 */
export function checkAgents(context: CheckContext): WorkspaceIssue[] {
  const issues: WorkspaceIssue[] = [];
  for (const agent of context.filesOf("agent")) {
    if (context.hubFailed(agent.hub)) {
      continue;
    }
    issues.push(...modelIssues(context, agent));
    for (const list of libraryLists) {
      issues.push(...libraryIssues(context, agent, list));
    }
    issues.push(...subagentIssues(context, agent));
  }
  return issues;
}

function modelIssues(context: CheckContext, agent: Agent): WorkspaceIssue[] {
  const aliases = modelAliasesOf(context, agent.hub);
  const issues: WorkspaceIssue[] = [];
  const name = agent.value.id;
  const model = agent.value.model;
  if (model !== undefined && isAliasName(model) && !aliases.has(model)) {
    const message = `Agent "${name}" uses unknown model alias "${model}"`;
    issues.push(context.error(agent.path, ["model"], "unknown-model-alias", message));
  }
  for (const [methodId, method] of Object.entries(agent.value.methods)) {
    if (method.model !== undefined && isAliasName(method.model) && !aliases.has(method.model)) {
      const message = `Method "${name}.${methodId}" uses unknown model alias "${method.model}"`;
      const path = ["methods", methodId, "model"];
      issues.push(context.error(agent.path, path, "unknown-model-alias", message));
    }
  }
  return issues;
}

/**
 * An item is the agent's hub's own, or shared at the workspace root. A hub
 * that lists `uses` may use only the shared items it lists there.
 */
function libraryIssues(context: CheckContext, agent: Agent, list: LibraryList): WorkspaceIssue[] {
  const own = agent.hub === null ? new Set<string>() : context.idsOf(list.kind, agent.hub);
  const shared = context.idsOf(list.kind, null);
  const uses = usesOf(context, agent.hub);
  const name = agent.value.id;
  const issues: WorkspaceIssue[] = [];
  agent.value[list.key].forEach((item, index) => {
    const path = [list.key, index];
    if (own.has(item)) {
      return;
    }
    if (!shared.has(item)) {
      const message = `Agent "${name}" uses unknown ${list.noun} "${item}"`;
      issues.push(context.error(agent.path, path, `unknown-${list.kind}`, message));
      return;
    }
    if (uses !== undefined && !uses[list.key].includes(item)) {
      const message = `Agent "${name}" uses the shared ${list.noun} "${item}", which hub "${agent.hub}" does not list in uses.${list.key}`;
      issues.push(context.error(agent.path, path, "shared-not-in-uses", message));
    }
  });
  return issues;
}

/** A hub's `uses`; `undefined` at the root, for a hub without one, or when its `hub.yaml` didn't parse. */
function usesOf(context: CheckContext, hub: string | null): HubUses | undefined {
  if (hub === null) {
    return undefined;
  }
  return context.filesOf("hub", hub)[0]?.value.uses;
}

function subagentIssues(context: CheckContext, agent: Agent): WorkspaceIssue[] {
  const agents = context.idsOf("agent", agent.hub);
  const name = agent.value.id;
  const issues: WorkspaceIssue[] = [];
  agent.value.subagents.forEach((subagent, index) => {
    const path = ["subagents", index];
    if (subagent === name) {
      const message = `Agent "${name}" cannot be its own subagent`;
      issues.push(context.error(agent.path, path, "own-subagent", message));
    } else if (!agents.has(subagent)) {
      const message = `Agent "${name}" delegates to unknown agent "${subagent}"`;
      issues.push(context.error(agent.path, path, "unknown-subagent", message));
    }
  });
  return issues;
}
