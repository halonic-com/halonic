import { err, ok, type Result } from "@halonicjs/std";
import { editYaml, type YamlEdit } from "@halonicjs/yaml";

/** The fields of a provider's page that can be changed (`models.providers.edit`). */
export type ProviderField = "name" | "type" | "baseUrl" | "secret" | "local";

/** What is wrong with a field, in the words the field shows under itself. */
export interface ProviderProblem {
  readonly field: ProviderField | "yaml";
  readonly message: string;
}

const URL_MESSAGE = "Enter a full address, like http://localhost:11434/v1.";

/** True for an address with a scheme and a host, like `http://localhost:11434/v1`. */
function isUrl(text: string): boolean {
  try {
    return new URL(text).host !== "";
  } catch {
    return false;
  }
}

/** The edit that gives the field its value; a text field left empty takes its key out of the file. */
function editFor(field: ProviderField, value: string | boolean): Result<YamlEdit, ProviderProblem> {
  if (typeof value === "boolean") return ok({ kind: "set", path: [field], value });
  const text = value.trim();
  if (field === "type" && text === "") {
    return err({ field, message: "Give the provider a type, like anthropic or ollama." });
  }
  if (field === "baseUrl" && text !== "" && !isUrl(text)) {
    return err({ field, message: URL_MESSAGE });
  }
  return ok(
    text === "" && field !== "type"
      ? { kind: "delete", path: [field] }
      : { kind: "set", path: [field], value: text },
  );
}

/**
 * Changes one field of `providers/<id>.yaml`. A problem with the value writes nothing and comes
 * back as the message for its field.
 *
 * @param text - the text of the provider's file
 *
 * @example
 * editProvider(text, "baseUrl", "http://localhost:11434/v1"); // ok: the file with `baseUrl` set
 * editProvider(text, "baseUrl", "localhost:11434"); // err: Enter a full address, …
 */
export function editProvider(
  text: string,
  field: ProviderField,
  value: string | boolean,
): Result<string, ProviderProblem> {
  const edit = editFor(field, value);
  if (!edit.ok) return edit;
  const edited = editYaml(text, [edit.value]);
  return edited.ok
    ? ok(edited.value.text)
    : err({
        field: "yaml",
        message: "The provider's file could not be changed. Fix the file first.",
      });
}
