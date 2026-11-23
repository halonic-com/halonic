import type { FileKind, KindCheckProblem } from "../../kind.ts";
import { checkKeysIn } from "../../shared/key-in-value.ts";
import { checkReservedSecretName, checkSecretName } from "../../shared/secret-name.ts";
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

/*
 * The words are the team's, as the connector's and the routine's are: a
 * small wording on a check already approved (HAL-14566, HAL-16691).
 */
const reservedNameMessage =
  "This secret name belongs to Halonic or to a plugin, so a provider can't use it. Store the key under a name of your own, such as anthropic-api-key.";

/**
 * The secret is named in the file, so a bad name, a pasted key or a name
 * that belongs to Halonic or a plugin is caught here, not at run time, and
 * the first run never saves a model key under it (HAL-16691). A key pasted
 * into `options` is caught too, and so is a type Halonic can't call, or a
 * `baseUrl` it can't reach, which would only fail once a run reached the
 * model (HAL-14260), and a model listed twice in `searchesWeb`.
 */
function checkProvider(provider: Provider): KindCheckProblem[] {
  return [
    ...checkType(provider),
    ...checkBaseUrl(provider),
    ...checkSecret(provider),
    ...checkKeysIn(provider.options, ["options"], "provider-option"),
    ...checkSearchesWebOnce(provider),
  ];
}

function checkSecret(provider: Provider): KindCheckProblem[] {
  const { secret } = provider;
  if (secret === undefined) return [];
  const problem =
    checkSecretName(secret, ["secret"]) ??
    checkReservedSecretName(secret, ["secret"], reservedNameMessage);
  return problem === undefined ? [] : [problem];
}

/**
 * `duplicate` on each `searchesWeb` entry after the first with the same id.
 * The list is a set; a repeat is most likely a typo for another model.
 */
function checkSearchesWebOnce(provider: Provider): KindCheckProblem[] {
  const seen = new Set<string>();
  const problems: KindCheckProblem[] = [];
  (provider.searchesWeb ?? []).forEach((model, index) => {
    if (seen.has(model)) {
      problems.push({
        severity: "error",
        code: "duplicate",
        path: ["searchesWeb", index],
        message: `searchesWeb lists ${model} twice in providers/${provider.id}.yaml`,
      });
    }
    seen.add(model);
  });
  return problems;
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

/**
 * `provider-base-url` on the `baseUrl:` line when it doesn't start with
 * http:// or https://. `localhost:11434` passes as a URL, but its scheme is
 * "localhost:", so the run would try to reach an empty address.
 */
function checkBaseUrl(provider: Provider): KindCheckProblem[] {
  if (provider.baseUrl === undefined || /^https?:\/\//iu.test(provider.baseUrl)) return [];
  return [
    {
      severity: "error",
      code: "provider-base-url",
      path: ["baseUrl"],
      message: "baseUrl needs http:// or https://, such as http://localhost:11434",
    },
  ];
}
