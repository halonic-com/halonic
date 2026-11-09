import { resolve } from "node:path";
import { FolderDefinitionStore } from "@halonicjs/adapter-fs-node";
import { loadWorkspace } from "@halonicjs/workspace";
import { type CliCommand, UsageError } from "../../command.ts";
import { exitCode } from "../../exit-code.ts";
import { hasErrors, validateReport } from "./report.ts";

/** `halonic validate <dir>`: checks every file of a workspace and prints each error and warning. */
export const validateCommand: CliCommand = {
  name: "validate",
  usage: "<dir>",
  summary: "Check every file of the workspace in dir and print each error and warning.",
  options: {},
  async run(input, io) {
    const [folder, ...extra] = input.positionals;
    if (folder === undefined || extra.length > 0) {
      throw new UsageError("Give one workspace folder.");
    }
    const workspace = await loadWorkspace(
      new FolderDefinitionStore(resolve(io.cwd, folder), folder),
    );
    for (const line of validateReport(workspace)) {
      io.out(line);
    }
    return hasErrors(workspace) ? exitCode.failed : exitCode.ok;
  },
};
