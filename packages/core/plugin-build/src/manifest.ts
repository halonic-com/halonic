// The two generated files of a plugin package: `package.json` and
// `manifest.js`. Both are written from checked data only (the plugin id and
// version, the snapshot, and the runtime's capabilities and settings), as
// canonical JSON, so no workspace text is ever written as code and the same
// inputs always give the same bytes.

import type { Tool, ToolParameter, WorkspaceSnapshot } from "@halonicjs/format";
import { canonicalJson } from "@halonicjs/std";
import { pluginFileNames } from "./plugin-archive.ts";

/** The plugin API version of Paperclip's manifest that the runtime is written against. */
export const manifestApiVersion = 1;

/** What a plugin's manifest is written from. */
export interface ManifestInput {
  /** The plugin id, already checked, such as `halonic-ws.acme`. */
  readonly pluginId: string;
  /** The plugin's version, already checked, strict `x.y.z`. */
  readonly version: string;
  /** The snapshot the plugin serves; its tools become the manifest's tools. */
  readonly snapshot: WorkspaceSnapshot;
  /** The Paperclip capabilities the runtime and the used actions need. */
  readonly capabilities: readonly string[];
  /** The plugin's settings, as JSON Schema properties, from the runtime. Never a value. */
  readonly settings: Readonly<Record<string, unknown>>;
}

/** One tool as Paperclip's manifest declares it. */
export interface ToolDeclaration {
  readonly name: string;
  readonly displayName: string;
  readonly description: string;
  readonly parametersSchema: Readonly<Record<string, unknown>>;
}

/**
 * A tool's parameters as the JSON Schema an agent sees: an object with each
 * parameter's own keywords, the required ones listed, and no others allowed.
 * An object parameter becomes the same kind of object of its fields, and a
 * list parameter an `array` of its items.
 *
 * @example
 * toolParametersSchema({ parameters: { pr: { type: "integer", description: "The PR.", required: true } } });
 * // { type: "object", properties: { pr: { type: "integer", description: "The PR." } },
 * //   required: ["pr"], additionalProperties: false }
 */
export function toolParametersSchema(tool: Pick<Tool, "parameters">): Record<string, unknown> {
  return objectSchema(tool.parameters);
}

/** Parameters, or an object parameter's fields, as one JSON Schema object. */
function objectSchema(
  parameters: Readonly<Record<string, ToolParameter>>,
): Record<string, unknown> {
  const entries = Object.entries(parameters);
  // `fromEntries` defines each key, so a parameter named like an object's own member stays a parameter.
  const properties = Object.fromEntries(
    entries.map(([name, parameter]) => [name, parameterSchema(parameter)]),
  );
  const required = entries.filter(([, parameter]) => parameter.required).map(([name]) => name);
  return { type: "object", properties, required: required.sort(), additionalProperties: false };
}

/** One parameter's JSON Schema: its own keywords, without `required`, which its object lists. */
function parameterSchema(parameter: ToolParameter): Record<string, unknown> {
  if (parameter.type === "object") {
    return { ...objectSchema(parameter.fields), description: parameter.description };
  }
  if (parameter.type === "list") {
    const { items, maxItems, description } = parameter;
    return { type: "array", description, items: withoutUndefined(items), maxItems };
  }
  const { required: _required, ...keywords } = parameter;
  return withoutUndefined(keywords);
}

/** Each tool of a snapshot as the manifest declares it, in the snapshot's order. */
export function toolDeclarations(snapshot: WorkspaceSnapshot): ToolDeclaration[] {
  return snapshot.tools.map((tool) => ({
    name: tool.name,
    displayName: tool.name,
    description: tool.description,
    parametersSchema: toolParametersSchema(tool),
  }));
}

/**
 * Writes `manifest.js`: one ES module whose default export is the manifest,
 * as canonical JSON. Capabilities are sorted and listed once.
 *
 * @example
 * pluginManifestText({ pluginId: "halonic-ws.acme", version: "0.1.0", snapshot, capabilities, settings });
 * // '// Written by halonic build paperclip-plugin. …\nexport default {"apiVersion":1,…};\n'
 */
export function pluginManifestText(input: ManifestInput): string {
  const { name } = input.snapshot.workspace;
  const manifest = {
    id: input.pluginId,
    apiVersion: manifestApiVersion,
    version: input.version,
    displayName: name,
    description: `The tools of the ${name} workspace, built by Halonic.`,
    author: name,
    categories: ["automation"],
    capabilities: [...new Set(input.capabilities)].sort(),
    entrypoints: { worker: pluginFileNames.worker },
    tools: toolDeclarations(input.snapshot),
    instanceConfigSchema: { type: "object", properties: input.settings },
  };
  return [
    "// Written by halonic build paperclip-plugin. Build the plugin again instead of changing it.",
    `export default ${canonicalJson(manifest)};`,
    "",
  ].join("\n");
}

/**
 * Writes the package's `package.json`: its name and version, and where
 * Paperclip finds the manifest and the worker.
 *
 * @example
 * pluginPackageJsonText("halonic-ws.acme", "0.1.0");
 * // '{"name":"halonic-ws.acme","paperclipPlugin":{…},"private":true,"type":"module","version":"0.1.0"}\n'
 */
export function pluginPackageJsonText(pluginId: string, version: string): string {
  const packageJson = {
    name: pluginId,
    version,
    private: true,
    type: "module",
    paperclipPlugin: {
      manifest: `./${pluginFileNames.manifest}`,
      worker: `./${pluginFileNames.worker}`,
    },
  };
  return `${canonicalJson(packageJson)}\n`;
}

function withoutUndefined(keywords: Readonly<Record<string, unknown>>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(keywords).filter(([, value]) => value !== undefined));
}
