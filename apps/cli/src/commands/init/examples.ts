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
 * The repository's `examples` folder. The CLI runs from its sources, so the
 * examples are found next to them; a packaged CLI must ship this folder with it.
 */
const examplesFolder = join(import.meta.dirname, "..", "..", "..", "..", "..", "examples");

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
