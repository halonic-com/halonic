// A workspace's `template.yaml` (format.workspace-template-file): how a
// shared workspace presents itself. It only changes what a command shows, so
// one that can't be read is skipped with a warning and never stops a command.
import {
  parseFile,
  type TryFirst,
  type WorkspaceTemplate,
  workspaceTemplatePath,
} from "@halonicjs/format";
import type { DefinitionStore } from "@halonicjs/ports";
import type { Phrase } from "./messages/phrase.ts";
import { workspaceTemplateMessages } from "./messages/workspace-template.ts";
import { printable } from "./output/printable.ts";

/** What a workspace's `template.yaml` gave: its template, or a warning to show instead. */
export type WorkspaceTemplateRead =
  | { readonly ok: true; readonly template: WorkspaceTemplate | null }
  | { readonly ok: false; readonly warning: Phrase };

/**
 * Reads the text of a workspace's `template.yaml`.
 *
 * @param text - the file's text, or `null` when the workspace has none
 * @returns the template (`null` for no file), or the `!` line for one that can't be read
 */
export function readWorkspaceTemplate(text: string | null): WorkspaceTemplateRead {
  if (text === null) return { ok: true, template: null };
  const parsed = parseFile("workspaceTemplate", text);
  if (parsed.ok) return { ok: true, template: parsed.value.value };
  const [first] = parsed.error;
  const warning = workspaceTemplateMessages.unreadable(
    first?.line ?? 1,
    // The message may end in a full stop of its own; the line adds one.
    printable(first?.message ?? "it isn't a template").replace(/\.$/u, ""),
  ).phrase;
  return { ok: false, warning };
}

/**
 * The first thing to try that a workspace's template names, for a command's
 * `Next:` block. A template that can't be read gives none, after its `!` line.
 *
 * @param store - the workspace's files
 * @param warn - shows the `!` line
 */
export async function firstThingToTry(
  store: DefinitionStore,
  warn: (line: Phrase) => void,
): Promise<TryFirst | undefined> {
  const read = readWorkspaceTemplate(await store.read(workspaceTemplatePath));
  if (!read.ok) {
    warn(read.warning);
    return undefined;
  }
  return read.template?.tryFirst[0];
}
