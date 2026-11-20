import type { FileKind, KindCheckProblem } from "../../kind.ts";
import { checkKeysIn } from "../../shared/key-in-value.ts";
import { checkSecretName } from "../../shared/secret-name.ts";
import { Provider } from "./schema.ts";
import { isProviderType, providerTypesInWords } from "./types.ts";

/** `providers/<id>.yaml` at the workspace root. */
export const providerKind: FileKind<Provider> = {
  name: "provider",
  about: "A connection to something that serves models.",
  syntax: "yaml",
  schema: Provider,
  places: [{ scope: "workspace", folder: "providers", name: "<id>.yaml" }],
  idFromPlace: "fallback",
  check: checkProvider,
};

/**
 * The secret is named in the file, so a bad name or a pasted key is caught
 * here, not at run time. A key pasted into `options` is caught too, and so
 * is a type Halonic can't call, which would only fail once a run reached
 * the model (HAL-14260).
 */
function checkProvider(provider: Provider): KindCheckProblem[] {
  const problem =
    provider.secret === undefined ? undefined : checkSecretName(provider.secret, ["secret"]);
  return [
    ...checkType(provider),
    ...(problem === undefined ? [] : [problem]),
    ...checkKeysIn(provider.options, ["options"], "provider-option"),
  ];
}

/**
 * `provider-type` on the `type:` line, worded like the run's fix:
 * "Halonic can't call provider type antropic: set type in
 * providers/mock.yaml to one of anthropic, … or mock".
 */
function checkType(provider: Provider): KindCheckProblem[] {
  if (isProviderType(provider.type)) return [];
  return [
    {
      severity: "error",
      code: "provider-type",
      path: ["type"],
      message: `Halonic can't call provider type ${provider.type}: set type in providers/${provider.id}.yaml to one of ${providerTypesInWords}`,
    },
  ];
}
