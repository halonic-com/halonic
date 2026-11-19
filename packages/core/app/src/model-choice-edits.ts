// The changes to the workspace's files that save a tested model choice: the
// provider's file when it is missing, the `default` alias, and on the key
// path Local only (first-run-flow 3.3 and 10.2 R4). This file works out the
// new texts and the facts the "Changed …" line is built from; it writes
// nothing, and the words are Studio's.

import { parseFile } from "@halonicjs/format";
import { err, ok, type Result } from "@halonicjs/std";
import { editYaml, type YamlEdit } from "@halonicjs/yaml";
import {
  choiceModel,
  choiceProvider,
  type FirstRunProvider,
  type ModelChoice,
} from "./model-choice.ts";

/** The alias the first run points at the chosen model: the one Acme's agents use. */
export const firstRunAlias = "default";

/** The texts of the files a choice may change, as they are now. */
export interface ChoiceFiles {
  /** `models.yaml`. */
  readonly models: string;
  /** `workspace.yaml`. */
  readonly workspace: string;
  /** `providers/<id>.yaml` of the choice's provider ({@link choiceProvider}); `undefined` when it is missing. */
  readonly provider: string | undefined;
}

/** One file's new text. */
export interface ChoiceFileText {
  /** The file's path from the workspace's folder, such as `providers/anthropic.yaml`. */
  readonly path: string;
  readonly text: string;
}

/**
 * One fact for the "Changed …" line, with the file it is in:
 * - `provider-added`: the provider's file was missing and is added.
 * - `alias-repointed`: the alias now uses the provider's model.
 * - `local-only-off`: the workspace was Local only and no longer is.
 */
export type ChoiceChange =
  | { readonly kind: "provider-added"; readonly file: string; readonly provider: string }
  | {
      readonly kind: "alias-repointed";
      readonly file: "models.yaml";
      readonly alias: string;
      readonly provider: string;
      readonly providerName: string;
      readonly model: string;
      readonly local: boolean;
    }
  | { readonly kind: "local-only-off"; readonly file: "workspace.yaml" };

/** What saving a choice changes. */
export interface ChoiceEdits {
  /** The files to write, in the order to write them: the provider's file, `models.yaml`, then `workspace.yaml`. Only files that change. */
  readonly files: readonly ChoiceFileText[];
  /** What changed, in the same order. */
  readonly changes: readonly ChoiceChange[];
  /** The secret name to save the tested key under, from the provider's file; `undefined` on the local path. */
  readonly secretName: string | undefined;
}

/**
 * Why a choice can't be saved into these files:
 * - `unreadable`: the file isn't valid, or the edit can't be made to it.
 * - `provider-differs`: the workspace has a file for the provider, but it isn't
 *   one the choice can use (another type or address, no key name, or not local).
 *   The first run never rewrites a provider file the person may have made.
 */
export interface ChoiceProblem {
  readonly kind: "unreadable" | "provider-differs";
  readonly file: string;
}

/**
 * The changes that save a tested `choice` into `files`. It points the
 * `default` alias at the choice's model, adds the provider's file when it is
 * missing, and on the key path turns Local only off, as a Local only
 * workspace refuses every cloud model. The local path leaves Local only as it
 * is. Comments in the files are kept.
 *
 * When the alias moves to another model, its `description`, `params` and
 * `price` go with the old model: they described it, not the new one.
 *
 * @returns the edits, or the first file that stops them; a choice already saved gives no files
 */
export function choiceEdits(
  choice: ModelChoice,
  files: ChoiceFiles,
): Result<ChoiceEdits, ChoiceProblem> {
  const provider = choiceProvider(choice);
  const providerPath = `providers/${provider.id}.yaml`;
  const texts: ChoiceFileText[] = [];
  const changes: ChoiceChange[] = [];

  const secretName = providerSecretName(provider, files.provider);
  if (!secretName.ok) return err({ kind: "provider-differs", file: providerPath });
  if (files.provider === undefined) {
    texts.push({ path: providerPath, text: provider.fileText });
    changes.push({ kind: "provider-added", file: providerPath, provider: provider.id });
  }

  const models = repointAlias(files.models, provider, choiceModel(choice));
  if (!models.ok) return models;
  if (models.value !== files.models) {
    texts.push({ path: "models.yaml", text: models.value });
    changes.push({
      kind: "alias-repointed",
      file: "models.yaml",
      alias: firstRunAlias,
      provider: provider.id,
      providerName: provider.name,
      model: choiceModel(choice),
      local: provider.local,
    });
  }

  if (choice.kind === "key") {
    const workspace = turnLocalOnlyOff(files.workspace);
    if (!workspace.ok) return workspace;
    if (workspace.value !== files.workspace) {
      texts.push({ path: "workspace.yaml", text: workspace.value });
      changes.push({ kind: "local-only-off", file: "workspace.yaml" });
    }
  }
  return ok({ files: texts, changes, secretName: secretName.value });
}

/**
 * The secret name the choice's key goes under: the one in the workspace's own
 * provider file when it has one that fits, else the table's. A cloud
 * provider's file must have the table's address exactly, none for Anthropic
 * and OpenAI: the pasted key is tested and saved for that address, and must
 * never go to another one. Ollama may sit on another port.
 */
function providerSecretName(
  provider: FirstRunProvider,
  text: string | undefined,
): Result<string | undefined, "differs"> {
  if (text === undefined) return ok(provider.secretName);
  const parsed = parseFile("provider", text, { id: provider.id });
  if (!parsed.ok) return err("differs");
  const file = parsed.value.value;
  const sameAddress = provider.local || file.baseUrl === provider.baseUrl;
  if (file.type !== provider.type || !sameAddress || file.local !== provider.local) {
    return err("differs");
  }
  if (provider.local) return ok(undefined);
  return file.secret === undefined ? err("differs") : ok(file.secret);
}

function repointAlias(
  text: string,
  provider: FirstRunProvider,
  model: string,
): Result<string, ChoiceProblem> {
  const unreadable: ChoiceProblem = { kind: "unreadable", file: "models.yaml" };
  const parsed = parseFile("models", text);
  if (!parsed.ok) return err(unreadable);
  const aliases = parsed.value.value.aliases;
  const current = Object.hasOwn(aliases, firstRunAlias) ? aliases[firstRunAlias] : undefined;
  if (current?.provider === provider.id && current.model === model) return ok(text);
  const path = ["aliases", firstRunAlias];
  const edits: YamlEdit[] = [
    { kind: "set", path: [...path, "provider"], value: provider.id },
    { kind: "set", path: [...path, "model"], value: model },
  ];
  for (const stale of ["description", "params", "price"]) {
    edits.push({ kind: "delete", path: [...path, stale] });
  }
  const edited = editYaml(text, edits);
  return edited.ok ? ok(edited.value.text) : err(unreadable);
}

function turnLocalOnlyOff(text: string): Result<string, ChoiceProblem> {
  const unreadable: ChoiceProblem = { kind: "unreadable", file: "workspace.yaml" };
  const parsed = parseFile("workspace", text);
  if (!parsed.ok) return err(unreadable);
  if (!parsed.value.value.privacy.localOnly) return ok(text);
  const edited = editYaml(text, [{ kind: "set", path: ["privacy", "localOnly"], value: false }]);
  return edited.ok ? ok(edited.value.text) : err(unreadable);
}
