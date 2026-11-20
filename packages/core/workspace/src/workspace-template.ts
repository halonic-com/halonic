import { writeYamlFile } from "@halonicjs/yaml";
import { defaultHubPath, defaultHubText } from "./default-hub.ts";

/** The workspace's model aliases. */
export const modelsPath = "models.yaml";

/** The built-in test model's provider file, which a new workspace starts with. */
export const testProviderPath = "providers/mock.yaml";

/**
 * A new workspace's `models.yaml`: the alias `default` on the test model, so
 * a first agent runs with no key (the board on HAL-12723). The comment says
 * how to move to a real model, since `default` keeps pointing at the test
 * model when a provider is added beside it.
 */
const modelsYaml = [
  "# `default` is the test model: it needs no key, sends nothing and echoes the prompt.",
  "# Add your own provider in providers/, then change `default` to your own model.",
  "aliases:",
  "  default:",
  "    description: The test model. Echoes the prompt, no network and no key.",
  "    provider: mock",
  "    model: echo",
  "",
].join("\n");

/**
 * A new workspace's test model provider: local, so `privacy.localOnly: true`
 * keeps working, and without the Acme example's `script:`, so it echoes the
 * prompt back.
 */
const testProviderYaml = writeYamlFile({
  id: "mock",
  name: "Test model",
  type: "mock",
  local: true,
});

/** One file of the template: where it goes and what it holds. */
export type TemplateFile = readonly [path: string, content: string];

/**
 * The files a new workspace starts with besides `.gitignore` and
 * `workspace.yaml`, in the order they are written: the Default hub, then the
 * test model. Paths `existing` makes unwanted are left out: the hub when the
 * store has a `hubs/` folder, and the test model, both files together, when it
 * has a `models.yaml` or a `providers/` folder, so a person's own setup is
 * never pointed at the test model.
 *
 * @param existing - the paths the store already lists
 * @returns the files to write, and the template paths left out because of what is there
 *
 * @example
 * const { files, leftOut } = starterFiles(new Set(["providers/openai.yaml"]));
 * // files holds the hub; leftOut is ["models.yaml", "providers/mock.yaml"]
 */
export function starterFiles(existing: ReadonlySet<string>): {
  readonly files: readonly TemplateFile[];
  readonly leftOut: readonly string[];
} {
  const paths = [...existing];
  const hasHubs = paths.some((path) => path.startsWith("hubs/"));
  const hasModels = existing.has(modelsPath) || paths.some((path) => path.startsWith("providers/"));
  const hub: TemplateFile[] = [[defaultHubPath, defaultHubText()]];
  const testModel: TemplateFile[] = [
    [modelsPath, modelsYaml],
    [testProviderPath, testProviderYaml],
  ];
  const files = [...(hasHubs ? [] : hub), ...(hasModels ? [] : testModel)];
  const leftOut = [...(hasHubs ? hub : []), ...(hasModels ? testModel : [])].map(([path]) => path);
  return { files, leftOut };
}
