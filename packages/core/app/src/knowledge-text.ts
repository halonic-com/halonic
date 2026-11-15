// A knowledge source file's text, read into the parts the knowledge page shows and changed again
// without touching the rest (requirement `app.knowledge-text`). Nothing is read from disk or
// written: the caller keeps the text and saves it as one change.

import { err, ok, type Result } from "@halonicjs/std";
import { editYaml, readYaml, type YamlEdit } from "@halonicjs/yaml";

/** How agents look a source up: `tools` when they decide to, `auto` also with the task text. */
export type KnowledgeLookupMode = "tools" | "auto";

/** What the knowledge page shows of `library/knowledge/<id>.yaml`. */
export interface KnowledgeParts {
  readonly name: string;
  /** The summary a person wrote or approved; empty when the file has none. */
  readonly summary: string;
  /** `tools` when the file has no `mode`. */
  readonly mode: KnowledgeLookupMode;
  /** Whether agents that list the source may write notes to it. */
  readonly writable: boolean;
  /** The provider type, such as `files`. */
  readonly provider: string;
}

/** A change to a knowledge source; a part left out stays as it is. */
export interface KnowledgeChange {
  /** Text is written as given, trimmed; `null` removes the summary. */
  readonly summary?: string | null;
  readonly mode?: KnowledgeLookupMode;
}

/** `unreadable` means the file isn't valid YAML or isn't a map, so only a person can fix it. */
export type KnowledgeTextError = "unreadable";

/** The fields of a knowledge file the page reads; each is checked before it is used. */
interface KnowledgeData {
  readonly name?: unknown;
  readonly summary?: unknown;
  readonly mode?: unknown;
  readonly writable?: unknown;
  readonly provider?: unknown;
}

function dataOf(text: string): KnowledgeData | undefined {
  const read = readYaml(text);
  if (!read.ok) {
    return undefined;
  }
  const data = read.value.data;
  return typeof data === "object" && data !== null && !Array.isArray(data)
    ? (data as KnowledgeData)
    : undefined;
}

function textOf(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/**
 * Reads the parts of a knowledge source file.
 *
 * @example
 * readKnowledgeText("id: kb\nprovider: files\nmode: auto\n");
 * // ok({ name: "", summary: "", mode: "auto", writable: false, provider: "files" })
 */
export function readKnowledgeText(text: string): Result<KnowledgeParts, KnowledgeTextError> {
  const data = dataOf(text);
  if (data === undefined) {
    return err("unreadable");
  }
  return ok({
    name: textOf(data.name),
    summary: textOf(data.summary),
    mode: data.mode === "auto" ? "auto" : "tools",
    writable: data.writable === true,
    provider: textOf(data.provider),
  });
}

/**
 * The source's text with the change made. Every other field keeps its value, its order and its
 * comments, and the text is returned as it was when the change changes nothing. Picking `tools`
 * removes `mode`, because the file's default is `tools`; an empty summary removes `summary`.
 *
 * @example
 * editKnowledgeText("id: kb\nprovider: files\nmode: auto\n", { mode: "tools" });
 * // ok("id: kb\nprovider: files\n")
 */
export function editKnowledgeText(
  text: string,
  change: KnowledgeChange,
): Result<string, KnowledgeTextError> {
  const data = dataOf(text);
  if (data === undefined) {
    return err("unreadable");
  }
  const edits: YamlEdit[] = [];
  const summary = change.summary === null ? "" : change.summary?.trim();
  if (summary !== undefined && summary !== textOf(data.summary).trim()) {
    edits.push(
      summary === ""
        ? { kind: "delete", path: ["summary"] }
        : { kind: "set", path: ["summary"], value: summary },
    );
  }
  if (change.mode !== undefined && change.mode !== (data.mode === "auto" ? "auto" : "tools")) {
    edits.push(
      change.mode === "auto"
        ? { kind: "set", path: ["mode"], value: "auto" }
        : { kind: "delete", path: ["mode"] },
    );
  }
  if (edits.length === 0) {
    return ok(text);
  }
  const edited = editYaml(text, edits);
  return edited.ok ? ok(edited.value.text) : err("unreadable");
}
