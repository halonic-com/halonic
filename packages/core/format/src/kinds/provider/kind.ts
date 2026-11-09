import type { FileKind, KindCheckProblem } from "../../kind.ts";
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

/** The secret is named in the file, so a bad name or a pasted key is caught here, not at run time. */
function checkProvider(provider: Provider): KindCheckProblem[] {
  if (provider.secret === undefined) {
    return [];
  }
  const problem = checkSecretName(provider.secret, ["secret"]);
  return problem === undefined ? [] : [problem];
}
