// What Try it and Test leave out of the assistant's changes to review
// (HAL-65 section F, `workspace.trust.try-it-leaves-out`, HAL-3277): the
// parts of each kind that give an item more reach. Try it takes the
// baseline's value for them until the person accepts the change. Files
// that aren't items are held back whole.

import type { LeftOutReason } from "@halonicjs/events";
import type { KindName } from "@halonicjs/format";
import { isPlainObject } from "@halonicjs/std";
import { placeOf } from "@halonicjs/workspace";
import { readYaml } from "@halonicjs/yaml";
import type { ItemPath } from "./changes/revert-parts.ts";

/** The groups a part can be held back for, in the order a file's one reason is picked from. */
export type HeldBackGroup = Exclude<LeftOutReason, "before-trust">;

const groupOrder: readonly HeldBackGroup[] = [
  "permissions",
  "trust-and-sandbox",
  "connections",
  "models",
];

/** One part of an item that Try it takes from the baseline. */
export interface HeldBackPart {
  readonly path: ItemPath;
  readonly group: HeldBackGroup;
  /**
   * The entry the part belongs to, such as one method, when that is less
   * than the whole file. When the baseline doesn't have the entry, there
   * is no value to set the part back to, and leaving the part out could
   * reach further than either text (a method without `tools` may use all
   * of the agent's tools). So Try it leaves out the whole entry instead.
   */
  readonly entry?: ItemPath;
}

/**
 * What Try it holds back in a file of one kind:
 * - `whole`: the whole file, because all of it is about the group, as
 *   `models.yaml` or a connector is;
 * - `parts`: only these parts, worked out from the file's texts, because
 *   a method's parts are named by its key.
 */
export type HeldBack =
  | { readonly kind: "whole"; readonly group: HeldBackGroup }
  | { readonly kind: "parts"; readonly parts: (texts: readonly string[]) => HeldBackPart[] };

/** The same parts for every file of the kind. */
function fixedParts(parts: readonly HeldBackPart[]): HeldBack {
  return { kind: "parts", parts: () => [...parts] };
}

/**
 * Each part of an agent that gives it more reach, by group. An agent's
 * `knowledge` and `skills` aren't here on purpose: knowledge is only read,
 * and the requirement lists exactly what is held, `collections` included.
 */
const agentParts: readonly HeldBackPart[] = [
  { path: ["maxSteps"], group: "permissions" },
  { path: ["runLogs"], group: "permissions" },
  { path: ["collections"], group: "permissions" },
  { path: ["subagents"], group: "permissions" },
  { path: ["harness"], group: "trust-and-sandbox" },
  { path: ["workingFolder"], group: "trust-and-sandbox" },
  { path: ["allowedSites"], group: "trust-and-sandbox" },
  { path: ["connectors"], group: "connections" },
];

/** The parts of each method that limit what it may do; `model` stays, as for the agent. */
const methodParts: readonly { readonly key: string; readonly group: HeldBackGroup }[] = [
  { key: "tools", group: "permissions" },
  { key: "maxSteps", group: "permissions" },
];

/**
 * What Try it holds back for each kind it holds anything back for. A model
 * alias an agent, method or hub names stays: switching to an alias that
 * exists is used, and an alias only the change adds is held back with
 * `models.yaml`.
 */
const heldBackByKind: Partial<Record<KindName, HeldBack>> = {
  agent: {
    kind: "parts",
    parts: (texts) => [
      ...agentParts,
      ...methodNames(texts).flatMap((method) =>
        methodParts.map(({ key, group }) => ({
          path: ["methods", method, key],
          group,
          entry: ["methods", method],
        })),
      ),
    ],
  },
  // A connector is all connection: how to reach it, its secret, and which
  // of its tools may run, with or without asking (`tools.approve`).
  connector: { kind: "whole", group: "connections" },
  // Unlike a model alias, a switch to another runtime that exists is held:
  // the runtime decides how fenced the run is.
  workspace: fixedParts([
    { path: ["budget"], group: "permissions" },
    { path: ["privacy"], group: "trust-and-sandbox" },
    { path: ["defaults", "runtime"], group: "trust-and-sandbox" },
  ]),
  hub: fixedParts([
    { path: ["defaults", "runtime"], group: "trust-and-sandbox" },
    { path: ["uses"], group: "connections" },
    { path: ["models"], group: "models" },
  ]),
  knowledge: fixedParts([
    { path: ["provider"], group: "connections" },
    { path: ["config"], group: "connections" },
  ]),
  routine: fixedParts([{ path: ["trigger"], group: "connections" }]),
  runtime: { kind: "whole", group: "trust-and-sandbox" },
  models: { kind: "whole", group: "models" },
  provider: { kind: "whole", group: "models" },
};

/**
 * A file that isn't a Halonic item, such as a script a connector or a
 * harness agent runs, or a file one of those reads, is held back whole
 * (Julian, HAL-4663). We can't tell which files a command reads, and a
 * list of extensions would be easy to get round. Deleting one is held
 * back too: a script may check an allowlist or a lock file.
 */
const notAnItem: HeldBack = { kind: "whole", group: "trust-and-sandbox" };

/** What Try it holds back in the file at `path`; `null` when it uses all of it. */
export function heldBackAt(path: string): HeldBack | null {
  const kind = placeOf(path)?.kind;
  return kind === undefined ? notAnItem : (heldBackByKind[kind] ?? null);
}

/** The first group, in the fixed order, that one of `groups` is. */
export function firstGroup(groups: Iterable<HeldBackGroup>): HeldBackGroup | null {
  const found = new Set(groups);
  return groupOrder.find((group) => found.has(group)) ?? null;
}

/** The method names in any of the agent texts that read as YAML, sorted. */
function methodNames(texts: readonly string[]): string[] {
  const names = new Set<string>();
  for (const text of texts) {
    const read = readYaml(text);
    const methods = read.ok && isPlainObject(read.value.data) ? read.value.data["methods"] : null;
    if (isPlainObject(methods)) {
      for (const name of Object.keys(methods)) {
        names.add(name);
      }
    }
  }
  return [...names].sort();
}
