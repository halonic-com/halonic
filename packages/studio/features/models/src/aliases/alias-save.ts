import type { Result } from "@halonicjs/std";
import type { ModelsFiles } from "../api.ts";
import type { FieldProblem } from "./alias-edits.ts";

/**
 * Applies one edit to the current text of `models.yaml` and saves it as one undo step. A problem
 * with the edit writes nothing and comes back for the field to show.
 *
 * @param label - names the undo step, such as "Updated model alias smart"
 */
export async function saveModelsEdit(
  files: ModelsFiles,
  label: string,
  edit: (text: string) => Result<string, FieldProblem>,
): Promise<FieldProblem | undefined> {
  const text = await files.readModels();
  if (text === null) return { field: "yaml", message: "models.yaml could not be found." };
  const edited = edit(text);
  if (!edited.ok) return edited.error;
  if (edited.value !== text) files.changeModels(label, edited.value);
  return undefined;
}
