import type { FileKind, KindCheckProblem } from "../../kind.ts";
import { checkKeysIn } from "../../shared/key-in-value.ts";
import { checkSecretName } from "../../shared/secret-name.ts";
import { Provider } from "./schema.ts";

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
 * here, not at run time. A key pasted into `options` is caught too.
 */
function checkProvider(provider: Provider): KindCheckProblem[] {
  const problem =
    provider.secret === undefined ? undefined : checkSecretName(provider.secret, ["secret"]);
  return [
    ...(problem === undefined ? [] : [problem]),
    ...checkKeysIn(provider.options, ["options"], "provider-option"),
  ];
}
