import type { ChatTool } from "@halonicjs/app";
import { BuildChat, type BuildToolsOptions } from "./build-chat.ts";
import { readDocsTool } from "./docs/read-docs-tool.ts";
import { integrationGuideTool } from "./integration-guide/guide-tool.ts";
import { listFilesTool, readFileTool, schemaTool, validateTool } from "./read-tools.ts";
import { showTool } from "./show-tool.ts";
import { proposeDeleteTool, proposeFileTool } from "./write-tools.ts";

/**
 * The Build chat's authoring tools for one chat
 * (`assistant.build.authoring-tools`): `list_files`, `read_file`, `schema`,
 * `validate`, `propose_file` and `propose_delete`, `show`
 * (`assistant.build.show-tool`) and `integration_guide`
 * (`assistant.build.integration-guide`), and `read_docs` when the host gives
 * `docs` (`assistant.build.read-docs`). Build them once per chat and keep them:
 * they remember what the model last read in it, so a write checks the file
 * is still what the model saw.
 *
 * @example
 * const tools = buildChatTools({ chatId: "c1", files: store, review, isTrusted, digest, show });
 * const answer = await chatService.answer({ settings, messages, tools });
 */
export function buildChatTools(options: BuildToolsOptions): readonly ChatTool[] {
  const chat = new BuildChat(options);
  return [
    listFilesTool(chat),
    readFileTool(chat),
    schemaTool(),
    integrationGuideTool(),
    validateTool(chat),
    proposeFileTool(chat),
    proposeDeleteTool(chat),
    showTool(chat),
    ...(options.docs === undefined ? [] : [readDocsTool(chat, options.docs)]),
  ];
}
