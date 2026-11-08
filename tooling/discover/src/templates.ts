import { defaultCoverageFloors } from "@halonicjs/tooling-check";
import { renderAgentsMd } from "./agents-md.ts";
import { featureExportName } from "./features.ts";

/** What `pnpm new` needs to know to write a package. */
export interface PackageSpec {
  readonly directory: string;
  readonly name: string;
  readonly layer: keyof typeof defaultCoverageFloors;
  readonly owner: string;
  readonly isFeature: boolean;
  readonly folder: string;
  /** One sentence for AGENTS.md; a to-do line is written when missing. */
  readonly purpose?: string;
}

/** The TypeScript preset each layer uses (tooling/config/tsconfig). */
function presetFor(layer: string): string {
  switch (layer) {
    case "core":
      return "core";
    case "studio":
      return "studio";
    default:
      return "node";
  }
}

function titleOf(folder: string): string {
  return folder
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

/** The files of a new, empty package or feature, keyed by path inside its folder. */
export function packageFiles(spec: PackageSpec): Record<string, string> {
  const files: Record<string, string> = {
    "package.json": packageJson(spec),
    "tsconfig.json": json({
      extends: `@halonicjs/tooling-config/tsconfig/${presetFor(spec.layer)}.json`,
      include: ["src"],
      exclude: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    }),
    "tsconfig.test.json": json({
      extends: "@halonicjs/tooling-config/tsconfig/node.json",
      include: ["src", "vitest.config.ts"],
    }),
    "vitest.config.ts": [
      'import { definePackageTestConfig } from "@halonicjs/tooling-config/vitest";',
      "",
      "export default definePackageTestConfig();",
      "",
    ].join("\n"),
    "README.md": readme(spec),
    "AGENTS.md": renderAgentsMd(spec),
  };
  return spec.isFeature
    ? { ...files, ...featureSources(spec) }
    : { ...files, ...packageSources(spec) };
}

function packageJson(spec: PackageSpec): string {
  const exports: Record<string, string> = { ".": "./src/index.ts" };
  if (spec.isFeature) {
    exports["./api"] = "./src/api.ts";
  }
  return json({
    name: spec.name,
    private: true,
    type: "module",
    description: spec.isFeature
      ? `The ${titleOf(spec.folder)} feature of the Studio.`
      : `${titleOf(spec.folder)}.`,
    exports,
    scripts: {
      typecheck: "tsc --noEmit -p . && tsc --noEmit -p tsconfig.test.json",
      lint: "biome check .",
      test: "vitest run",
    },
    devDependencies: {
      "@halonicjs/tooling-config": "workspace:*",
      "@types/node": "catalog:",
      typescript: "catalog:",
      vitest: "catalog:",
    },
    halonic: { layer: spec.layer, owner: spec.owner, coverage: defaultCoverageFloors[spec.layer] },
  });
}

function packageSources(spec: PackageSpec): Record<string, string> {
  return {
    "src/index.ts": [
      `/** The npm name of this package. A placeholder export, so the empty package has an API to test. */`,
      `export const packageName = "${spec.name}";`,
      "",
    ].join("\n"),
    "src/index.test.ts": [
      'import { describe, expect, it } from "vitest";',
      'import { packageName } from "./index.ts";',
      "",
      'describe("packageName", () => {',
      '  it("is the npm name", () => {',
      `    expect(packageName).toBe("${spec.name}");`,
      "  });",
      "});",
      "",
    ].join("\n"),
  };
}

function featureSources(spec: PackageSpec): Record<string, string> {
  const exportName = featureExportName(spec.folder);
  return {
    "src/feature.ts": [
      "/**",
      ` * The ${titleOf(spec.folder)} feature as the Studio shell sees it. Becomes`,
      " * defineFeature() from @halonicjs/studio-shell once the shell exists.",
      " */",
      `export const ${exportName} = {`,
      `  id: "${spec.folder}",`,
      `  title: "${titleOf(spec.folder)}",`,
      "} as const;",
      "",
    ].join("\n"),
    "src/index.ts": [`export { ${exportName} } from "./feature.ts";`, ""].join("\n"),
    "src/api.ts": [
      "/**",
      " * The services and types other features may use. Features",
      " * import each other only through this file. Empty until this feature",
      " * offers something.",
      " */",
      "export {};",
      "",
    ].join("\n"),
    "src/feature.test.ts": [
      'import { describe, expect, it } from "vitest";',
      `import { ${exportName} } from "./feature.ts";`,
      "",
      `describe("${exportName}", () => {`,
      '  it("is registered under its folder name", () => {',
      `    expect(${exportName}.id).toBe("${spec.folder}");`,
      "  });",
      "});",
      "",
    ].join("\n"),
  };
}

function readme(spec: PackageSpec): string {
  const entry = spec.isFeature
    ? `\`${spec.name}\` (the feature) and \`${spec.name}/api\``
    : `\`${spec.name}\``;
  return [
    `# ${spec.name}`,
    "",
    spec.isFeature
      ? `The ${titleOf(spec.folder)} feature of the Studio.`
      : "What this package does, in one or two sentences.",
    "",
    `- **Layer:** ${spec.layer}`,
    `- **Owner:** ${spec.owner}`,
    `- **Public API:** ${entry}`,
    "",
    "## Example",
    "",
    "Added together with the first real API.",
    "",
  ].join("\n");
}
