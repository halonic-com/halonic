import { join } from "node:path";
import { inNpmPackage } from "../../npm-package.ts";

/** An example workspace that `halonic init --example <name>` copies. */
export interface InitExample {
  /** The name after `--example`, which is also the folder a copy goes in by default. */
  readonly name: string;
  /**
   * The folder its files are copied from. Its `template.yaml` names the workflow and input
   * the `Next:` block starts.
   */
  readonly folder: string;
}

/**
 * The `examples` folder: in the npm package only the one it ships beside its `dist` folder
 * (`tooling/publish` bundles the CLI into `dist/cli`), never one in the folders around the
 * package; otherwise the repository's, next to the sources.
 */
const examplesFolder = examplesFolderFor(inNpmPackage, import.meta.dirname);

/**
 * The `examples` folder for code in `codeFolder`: the bundle's `dist/cli` in the npm package, or
 * `apps/cli/src/commands/init` in the repository.
 */
export function examplesFolderFor(npmPackage: boolean, codeFolder: string): string {
  if (npmPackage) return join(codeFolder, "..", "..", "examples");
  return join(codeFolder, "..", "..", "..", "..", "..", "examples");
}

/**
 * The examples there are, by name. Acme runs on the test model only and its
 * Support reply workflow uses no connector, so the `Next:` block can name
 * `halonic run` without a key or `halonic trust` first (cli-output 3.1).
 */
export const initExamples: Readonly<Record<string, InitExample>> = {
  acme: {
    name: "acme",
    folder: join(examplesFolder, "acme"),
  },
};
