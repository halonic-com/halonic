import { basename, posix, resolve } from "node:path";
import { FolderDefinitionStore } from "@halonicjs/adapter-fs-node";
import { type InitializedWorkspace, initWorkspace } from "@halonicjs/workspace";
import { type CliCommand, type CommandInput, UsageError } from "../../command.ts";
import { exitCode } from "../../exit-code.ts";

/** `halonic init <dir>`: makes a folder a new workspace. */
export const initCommand: CliCommand = {
  name: "init",
  usage: "<dir> [--name <name>] [--id <id>]",
  summary: "Make dir a new workspace, with a .gitignore that keeps .env files out of git.",
  options: {
    name: {
      type: "string",
      valueName: "name",
      description: "The workspace's name (default: the folder's name).",
    },
    id: {
      type: "string",
      valueName: "id",
      description: "The workspace's id (default: made from the name).",
    },
  },
  async run(input, io) {
    const [folder, ...extra] = input.positionals;
    if (folder === undefined || extra.length > 0) {
      throw new UsageError("Give one folder for the new workspace.");
    }
    const root = resolve(io.cwd, folder);
    const id = textOption(input, "id");
    const result = await initWorkspace(new FolderDefinitionStore(root, folder), {
      name: textOption(input, "name") ?? basename(root),
      ...(id === undefined ? {} : { id }),
    });
    if (result.ok) {
      for (const line of initReport(folder, result.value)) {
        io.out(line);
      }
      return exitCode.ok;
    }
    const error = result.error;
    if (error.kind === "already_a_workspace") {
      io.err(`${folder} is already a workspace: it has a workspace.yaml.`);
      return exitCode.failed;
    }
    const problems = error.problems.map(
      (problem) => `${problem.path.join(".")}: ${problem.message}`,
    );
    throw new UsageError(`The workspace settings won't do. ${problems.join("; ")}`);
  },
};

/** What `halonic init` prints once the workspace is laid out. */
function initReport(folder: string, workspace: InitializedWorkspace): string[] {
  const lines = workspace.files.map(
    (file) =>
      `${file.change === "created" ? "Created" : "Updated"} ${posix.join(folder, file.path)}`,
  );
  lines.push(`Workspace "${workspace.name}" (${workspace.id}) is ready.`);
  lines.push(`Check it with: halonic validate ${folder}`);
  return lines;
}

/** A string option's value, or `undefined` when it wasn't given. */
function textOption(input: CommandInput, name: string): string | undefined {
  const value = input.options[name];
  return typeof value === "string" ? value : undefined;
}
