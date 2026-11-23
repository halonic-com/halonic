// The Build chat's read tools (`assistant.build.authoring-tools`,
// `assistant.build.validate-with-proposals`). They see the workspace as
// saved, changes to review included, and keep to the limits of
// `propose_file` (HAL-16788): never `.git/`, `.halonic/`, a private file, a
// link or a path outside the workspace, and only Halonic items while the
// workspace is untrusted.

import { type ChatTool, isNeverWritten, proposalRefusal } from "@halonicjs/app";
import { isKindName, jsonSchemaOf, kindNames } from "@halonicjs/format";
import { loadWorkspace } from "@halonicjs/workspace";
import { type BuildChat, textArgument, unlessRefused } from "./build-chat.ts";
import { toolTexts } from "./tool-texts.ts";

/** The most paths `list_files` gives in one result. */
export const listLimit = 1000;

/** `list_files`: the paths the model may read, under a folder or in the whole workspace. */
export function listFilesTool(chat: BuildChat): ChatTool {
  return {
    definition: {
      name: "list_files",
      description:
        "Lists the workspace's files, as saved, changes to review included. Pass `under` to list one folder.",
      parameters: {
        type: "object",
        properties: { under: { type: "string", description: "A folder, such as hubs/sales." } },
      },
    },
    async call(toolCall) {
      const under = toolCall.arguments["under"];
      const folder = typeof under === "string" && under !== "" ? under : undefined;
      // A folder is never an item, so only the never-read rule applies to
      // it; the untrusted rule filters the paths listed in it.
      if (folder !== undefined && isNeverWritten(folder)) {
        return toolTexts.cantRead(folder);
      }
      const trusted = chat.options.isTrusted();
      const listed = await unlessRefused(() => chat.options.files.list(folder));
      if (listed === "not-allowed") {
        return toolTexts.cantRead(folder ?? "");
      }
      const paths = listed.filter((path) => proposalRefusal(path, trusted) === null);
      return listing(paths);
    },
  };
}

/** `read_file`: one file's text, remembered as what the model last read. */
export function readFileTool(chat: BuildChat): ChatTool {
  return {
    definition: {
      name: "read_file",
      description:
        "Reads one workspace file as saved, changes to review included. Read a file before you change it.",
      parameters: {
        type: "object",
        properties: { path: { type: "string", description: "The file's workspace path." } },
        required: ["path"],
      },
    },
    async call(toolCall) {
      const path = textArgument(toolCall.arguments, "path");
      const refusal = proposalRefusal(path, chat.options.isTrusted());
      if (refusal !== null) {
        return refusal === "untrusted" ? toolTexts.untrustedRead : toolTexts.cantRead(path);
      }
      const text = await unlessRefused(() => chat.options.files.read(path));
      if (text === "not-allowed") {
        return toolTexts.cantRead(path);
      }
      await chat.see(path, text);
      return text ?? toolTexts.doesNotExist(path);
    },
  };
}

/** `schema`: the JSON Schema of one file kind. */
export function schemaTool(): ChatTool {
  return {
    definition: {
      name: "schema",
      description: "Gives the JSON Schema of one kind of Halonic file, such as agent or workflow.",
      parameters: {
        type: "object",
        properties: { kind: { type: "string", enum: [...kindNames()] } },
        required: ["kind"],
      },
    },
    async call(toolCall) {
      const kind = textArgument(toolCall.arguments, "kind");
      if (!isKindName(kind)) {
        return toolTexts.unknownKind(kind, kindNames());
      }
      return JSON.stringify(jsonSchemaOf(kind), null, 2);
    },
  };
}

/**
 * `validate`: checks the workspace as saved, changes to review included,
 * and gives each problem as "<severity> <path>: <message>". While the
 * workspace is untrusted it names only Halonic items, as the reads do.
 */
export function validateTool(chat: BuildChat): ChatTool {
  return {
    definition: {
      name: "validate",
      description:
        "Checks the workspace as saved, changes to review included, and lists every error and warning.",
      parameters: { type: "object", properties: {} },
    },
    async call() {
      const trusted = chat.options.isTrusted();
      const { issues } = await loadWorkspace(chat.options.files);
      const lines = issues
        .filter((issue) => proposalRefusal(issue.file, trusted) === null)
        .map((issue) => `${issue.severity} ${issue.file}: ${issue.message}`);
      return lines.length === 0 ? toolTexts.noProblems : lines.join("\n");
    },
  };
}

function listing(paths: readonly string[]): string {
  if (paths.length === 0) {
    return toolTexts.noFiles;
  }
  const shown = paths.slice(0, listLimit).join("\n");
  return paths.length > listLimit
    ? `${shown}\n${toolTexts.moreFiles(paths.length - listLimit)}`
    : shown;
}
