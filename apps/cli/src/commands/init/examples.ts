import { existsSync } from "node:fs";
import { join } from "node:path";

/** An example workspace that `halonic init --example <name>` copies. */
export interface InitExample {
  /** The name after `--example`, which is also the folder a copy goes in by default. */
  readonly name: string;
  /** The folder its files are copied from. */
  readonly folder: string;
  /** The workflow the `Next:` block starts: its id and its input file in the example. */
  readonly workflow: {
    readonly id: string;
    readonly input: string;
  };
}

/**
 * The `examples` folder: the repository's, found next to the sources, or the one the npm package
 * ships beside its `dist` folder (`tooling/publish` stages the CLI there).
 */
const examplesFolder = [
  join(import.meta.dirname, "..", "..", "..", "..", "..", "examples"),
  join(import.meta.dirname, "..", "..", "examples"),
].find((folder) => existsSync(folder)) as string;

/**
 * The examples there are, by name. Acme runs on the test model only and its
 * Support reply workflow uses no connector, so the `Next:` block can name
 * `halonic run` without a key or `halonic trust` first (cli-output 3.1).
 */
export const initExamples: Readonly<Record<string, InitExample>> = {
  acme: {
    name: "acme",
    folder: join(examplesFolder, "acme"),
    workflow: {
      id: "support-reply",
      input: "examples/refund-question.json",
    },
  },
};
