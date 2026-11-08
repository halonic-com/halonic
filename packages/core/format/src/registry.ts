import type { FileKind } from "./kind.ts";
import { workspaceKind } from "./kinds/workspace/kind.ts";
import type { WorkspaceSettings } from "./kinds/workspace/schema.ts";

/** The value each file kind parses to, by kind name. */
export interface KindValues {
  workspace: WorkspaceSettings;
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
