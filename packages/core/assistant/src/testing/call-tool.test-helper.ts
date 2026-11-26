import type { ReviewService } from "@halonicjs/app";
import { buildChatTools } from "../build/build-tools.ts";
import type { DocsOptions } from "../build/docs/docs-sites.ts";
import type { RequestLogReading } from "../build/request-log-tool.ts";
import { digest, type TestStore } from "./test-workspace.test-helper.ts";

/** A workspace and its review service, as `testWorkspace` gives them. */
export interface ToolWorkspace {
  readonly store: TestStore;
  readonly trust: { trusted: boolean };
  readonly review: ReviewService;
}

/**
 * The Build chat's tools for chat "c1" over `workspace`, and a function that
 * calls one by name as the chat service would, numbering the calls.
 *
 * @param said - the person's own messages in the chat, for a scripted turn
 * @param docs - what `read_docs` fetches with; without it the chat has no `read_docs`
 * @param requestLog - what `read_request_log` reads; without it the chat has no `read_request_log`
 */
export function chatTools(
  workspace: ToolWorkspace,
  said: readonly string[] = [],
  docs?: DocsOptions,
  requestLog?: RequestLogReading,
) {
  const tools = buildChatTools({
    chatId: "c1",
    files: workspace.store,
    review: workspace.review,
    isTrusted: () => workspace.trust.trusted,
    digest,
    personMessages: async () => said,
    docs,
    requestLog,
  });
  let calls = 0;
  return (name: string, args: Record<string, unknown> = {}): Promise<string> => {
    const tool = tools.find((each) => each.definition.name === name);
    if (tool === undefined) {
      throw new Error(`no tool ${name}`);
    }
    calls += 1;
    return tool.call({ id: `call-${calls}`, name, arguments: args });
  };
}
