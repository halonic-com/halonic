import type { Path, Schema } from "@halonicjs/schema-kit";

/**
 * Where files of a kind sit in a workspace, in the one layout the new loader
 * reads (plan 4.2): `agents/` and `workflows/` (with `workflows/routines/`)
 * and `library/`, at the workspace root and inside each `hubs/<hub>/`.
 */
export interface FilePlace {
  /**
   * `workspace`: at the workspace root only. `hub`: inside each
   * `hubs/<hub>/` folder only. `workspace-and-hub`: both; at the root the
   * item is shared with every hub (for agents and workflows the root acts as
   * a hub of its own).
   */
  readonly scope: "workspace" | "hub" | "workspace-and-hub";
  /** The folder inside that place, such as `library/connectors`; `""` for the place itself. */
  readonly folder: string;
  /**
   * The file name. `<id>` stands for the item's id: `<id>.agent.yaml` is an
   * agent whose id is the file name without `.agent.yaml`, and
   * `<id>/SKILL.md` is a skill whose id is its folder.
   */
  readonly name: string;
}

/** How a kind's text is read: plain YAML, or Markdown with YAML front matter (`SKILL.md`). */
export type KindSyntax = "yaml" | "front-matter";

/** A problem a kind's own checks find in a value that passed its schema. */
export interface KindCheckProblem {
  /** An error makes the file fail; a warning only informs. */
  readonly severity: "error" | "warning";
  /** A stable name for the rule, such as `default-deployment-not-listed`. */
  readonly code: string;
  /** Where the problem sits in the file. */
  readonly path: Path;
  readonly message: string;
}

/**
 * One kind of workspace file: how it's read, its schema with every default,
 * the checks that need more than one field, and where its files sit.
 * The registry lists every kind, so the loader and the tooling need no
 * switch over kind names.
 */
export interface FileKind<Value = unknown> {
  /** The kind's name, as the old schema export named it: `workspace`, `workflowTest`, … */
  readonly name: string;
  /** One line on what the file is for. */
  readonly about: string;
  readonly syntax: KindSyntax;
  /** The schema of the file's content, with every default. Its JSON Schema is the kind's. */
  readonly schema: Schema<Value, unknown>;
  /** Where the kind's files sit. Empty for none. */
  readonly places: readonly FilePlace[];
  /**
   * How the id the file's place gives (its file name or folder) is used:
   * `fallback` fills `id` in when the file has none, `always` overrides it,
   * `none` ignores it.
   */
  readonly idFromPlace: "fallback" | "always" | "none";
  /**
   * Reads old key names as their new ones before the schema sees the data,
   * so older files keep loading (for example `flow:` for `workflow:`).
   */
  readonly upgradeKeys?: (data: Readonly<Record<string, unknown>>) => Record<string, unknown>;
  /** Checks that span several fields, run after the schema passed. */
  readonly check?: (value: Value) => readonly KindCheckProblem[];
}
