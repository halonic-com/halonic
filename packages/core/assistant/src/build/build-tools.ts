import type { ChatTool } from "@halonicjs/app";
import { BuildChat, type BuildToolsOptions } from "./build-chat.ts";
import { listFilesTool, readFileTool, schemaTool, validateTool } from "./read-tools.ts";
import { proposeDeleteTool, proposeFileTool } from "./write-tools.ts";

/**
 * The Build chat's authoring tools for one chat
 * (`assistant.build.authoring-tools`): `list_files`, `read_file`, `schema`,
 * `validate`, `propose_file` and `propose_delete`. Build them once per chat
 * and keep them: they remember what the model last read in it, so a write
 * checks the file is still what the model saw.
 *
 * @example
 * const tools = buildChatTools({ chatId: "c1", files: store, review, isTrusted, digest });
 * const answer = await chatService.answer({ settings, messages, tools });
 */
export function buildChatTools(options: BuildToolsOptions): readonly ChatTool[] {
  const chat = new BuildChat(options);
  return [
    listFilesTool(chat),
    readFileTool(chat),
    schemaTool(),
    validateTool(chat),
    proposeFileTool(chat),
    proposeDeleteTool(chat),
  ];
}
