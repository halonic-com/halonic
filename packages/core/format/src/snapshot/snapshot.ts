import { type Path, parse } from "@halonicjs/schema-kit";
import { canonicalJson, encodeUtf8, err, ok, type Result } from "@halonicjs/std";
import type { Signal } from "../kinds/signal/schema.ts";
import { templateKind } from "../kinds/template/kind.ts";
import type { Template } from "../kinds/template/schema.ts";
import { checkTool } from "../kinds/tool/checks.ts";
import type { Tool } from "../kinds/tool/schema.ts";
import { checkKeysIn } from "../shared/key-in-value.ts";
import { checkRouting, type Routing } from "./routing.ts";
import { MAX_SNAPSHOT_BYTES, WorkspaceSnapshot } from "./schema.ts";
import { signalProblems } from "./signals.ts";

/**
 * Why a snapshot is refused. A refused snapshot is never used in part:
 * the plugin keeps the last good one, and the builder builds nothing.
 */
export interface SnapshotProblem {
  /** schema-kit's issue code, or the rule's name, such as `tool-name-twice`. */
  readonly code: string;
  /** Where in the snapshot, such as `["tools", 2, "name"]`. */
  readonly path: Path;
  /** What is wrong. It never repeats a value that looks like a key. */
  readonly message: string;
}

/** What a snapshot is made from: the workspace, its commit, its parsed tool, template and signal files and its routing. */
export interface SnapshotInput {
  readonly name: string;
  readonly commit: string;
  readonly tools: readonly Tool[];
  /** The workspace's templates; none when left out. */
  readonly templates?: readonly Template[];
  readonly routing?: Routing;
  /** The workspace's signals; none when left out. */
  readonly signals?: readonly Signal[];
}

/** One of the snapshot's lists, by the name it has in the snapshot and what one item is called. */
interface SnapshotList<Item> {
  readonly list: "tools" | "templates";
  readonly item: "tool" | "template";
  readonly items: readonly Item[];
}

/** Each place where a value is used a second time, as `code` at `<list>[i].<key>`. */
function repeated<Item extends Readonly<Record<Key, string>>, Key extends string>(
  { list, item, items }: SnapshotList<Item>,
  key: Key,
  code: string,
): SnapshotProblem[] {
  const seen = new Set<string>();
  return items.flatMap((entry, index) => {
    if (!seen.has(entry[key])) {
      seen.add(entry[key]);
      return [];
    }
    return [
      {
        code,
        path: [list, index, key],
        message: `another ${item} already has the ${key} '${entry[key]}'`,
      },
    ];
  });
}

/** The first item out of `key` order, so two equal snapshots are always written alike. */
function outOfOrder<Item extends Readonly<Record<Key, string>>, Key extends string>(
  { list, items }: SnapshotList<Item>,
  key: Key,
): SnapshotProblem[] {
  const index = items.findIndex((entry, at) => at > 0 && (items[at - 1]?.[key] ?? "") > entry[key]);
  return index === -1
    ? []
    : [
        {
          code: `${list}-not-sorted`,
          path: [list, index],
          message: `list the ${list} sorted by ${key}`,
        },
      ];
}

/** Each template's own refusals (a key in its title or text), at `templates[i]`. */
function templateProblems(templates: readonly Template[]): SnapshotProblem[] {
  return templates.flatMap((template, index) =>
    (templateKind.check?.(template) ?? []).map(({ code, path, message }) => ({
      code,
      path: ["templates", index, ...path],
      message,
    })),
  );
}

/** The items sorted by `key`, without changing the list given. */
function sortedBy<Item extends Readonly<Record<Key, string>>, Key extends string>(
  items: readonly Item[],
  key: Key,
): Item[] {
  return [...items].sort((first, second) =>
    first[key] < second[key] ? -1 : Number(first[key] > second[key]),
  );
}

/**
 * Reads a snapshot and runs every check a tool file gets, again: the
 * plugin's loader calls this on the snapshot built into it and on every
 * newer one it fetches, so a snapshot changed after the build is refused
 * the same way a tool file is. Nothing is filled in or left out: the
 * snapshot passes whole, or not at all.
 *
 * Refused besides the schema: a key in any text or name, the workspace's
 * name included (`value-looks-like-key`),
 * a parameter that asks for a key (`parameter-asks-for-key`), an empty
 * number range (`parameter-range-empty`), a tool name or id used twice
 * (`tool-name-twice`, `tool-id-twice`), tools out of name order
 * (`tools-not-sorted`), a key in a template (`value-looks-like-key`), a
 * template id used twice (`template-id-twice`), templates out of id order
 * (`templates-not-sorted`), in the routing a key in an agent's name
 * (`value-looks-like-key`) or an area named like an account or credential
 * field (`routing-area-looks-like-account`), and the signals' problems from
 * `signalProblems` (a signal's own refusals, an id or rule used twice,
 * signals out of id order). The schema already refuses an unknown role, an
 * unknown field and a name that isn't an agent's url key.
 *
 * @param data - the snapshot as JSON data
 * @returns the snapshot, or every problem found
 *
 * @example
 * readSnapshot({ format: 1, workspace: { name: "Acme", commit: "ab…" }, tools: [] }); // ok
 */
export function readSnapshot(data: unknown): Result<WorkspaceSnapshot, SnapshotProblem[]> {
  const parsed = parse(WorkspaceSnapshot, data);
  if (!parsed.ok) {
    return err(parsed.error.map(({ code, path, message }) => ({ code, path, message })));
  }
  const tools: SnapshotList<Tool> = { list: "tools", item: "tool", items: parsed.value.tools };
  const templates: SnapshotList<Template> = {
    list: "templates",
    item: "template",
    items: parsed.value.templates ?? [],
  };
  const problems: SnapshotProblem[] = [
    ...checkKeysIn(parsed.value.workspace.name, ["workspace", "name"], "setting").map(
      ({ code, path, message }) => ({ code, path, message }),
    ),
    ...tools.items.flatMap((tool, index) =>
      checkTool(tool).map(({ code, path, message }) => ({
        code,
        path: ["tools", index, ...path],
        message,
      })),
    ),
    ...repeated(tools, "name", "tool-name-twice"),
    ...repeated(tools, "id", "tool-id-twice"),
    ...outOfOrder(tools, "name"),
    ...templateProblems(templates.items),
    ...repeated(templates, "id", "template-id-twice"),
    ...outOfOrder(templates, "id"),
    ...(parsed.value.routing === undefined ? [] : checkRouting(parsed.value.routing, ["routing"])),
    ...signalProblems(parsed.value.signals ?? []),
  ];
  return problems.length > 0 ? err(problems) : ok(parsed.value);
}

/**
 * Reads a snapshot file's text, as the plugin's loader gets it: refused
 * whole when it is over {@link MAX_SNAPSHOT_BYTES} (`snapshot-too-large`)
 * or isn't JSON (`snapshot-not-json`), both before it is parsed further;
 * otherwise checked by {@link readSnapshot}.
 *
 * @param text - the snapshot file's text
 * @returns the snapshot, or every problem found
 */
export function readSnapshotText(text: string): Result<WorkspaceSnapshot, SnapshotProblem[]> {
  if (encodeUtf8(text).length > MAX_SNAPSHOT_BYTES) {
    return err([
      {
        code: "snapshot-too-large",
        path: [],
        message: `keep the snapshot to at most ${MAX_SNAPSHOT_BYTES / (1024 * 1024)} MiB`,
      },
    ]);
  }
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return err([{ code: "snapshot-not-json", path: [], message: "write the snapshot as JSON" }]);
  }
  return readSnapshot(data);
}

/**
 * Makes the snapshot of one workspace commit from its parsed tool files,
 * sorted by name, and its templates and signals, each sorted by id, and checks it with {@link readSnapshot}, so the builder
 * can't write a snapshot the plugin would refuse.
 *
 * The `templates` and `signals` lists are left out when there are none, so
 * a workspace without them gets the same snapshot as before they existed.
 *
 * @param input - the workspace's name, the commit, its tools and its templates
 * @returns the snapshot, or every problem found
 */
export function makeSnapshot(input: SnapshotInput): Result<WorkspaceSnapshot, SnapshotProblem[]> {
  const templates = sortedBy(input.templates ?? [], "id");
  const signals = sortedBy(input.signals ?? [], "id");
  return readSnapshot({
    format: 1,
    workspace: { name: input.name, commit: input.commit },
    tools: sortedBy(input.tools, "name"),
    ...(templates.length > 0 ? { templates } : {}),
    ...(input.routing === undefined ? {} : { routing: input.routing }),
    ...(signals.length > 0 ? { signals } : {}),
  });
}

/**
 * The snapshot as text in one canonical form (keys sorted, no spaces), so
 * the same workspace commit always gives the same bytes and checksum.
 *
 * @param snapshot - a snapshot that passed {@link readSnapshot}
 * @returns its canonical JSON text
 */
export function snapshotText(snapshot: WorkspaceSnapshot): string {
  return canonicalJson(snapshot);
}
