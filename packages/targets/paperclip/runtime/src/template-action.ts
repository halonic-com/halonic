import type { Template } from "@halonicjs/format";
import type { ActionCall, ActionHandler } from "./handlers.ts";
import type { ToolResult } from "./host.ts";

/**
 * `paperclip.template`: reads one of the served snapshot's templates by its
 * id, or lists them all when the call gives no id. It reads only the
 * snapshot, so it needs no key and no Paperclip capability, and it can't
 * change anything. The tool file declares an optional string parameter
 * `id` for it.
 */

/** The `id` the agent asked for: undefined for none, null when it isn't text. */
function askedId(params: unknown): string | undefined | null {
  if (typeof params !== "object" || params === null) {
    return undefined;
  }
  const id = (params as { readonly id?: unknown }).id;
  if (id === undefined || id === "") {
    return undefined;
  }
  return typeof id === "string" ? id : null;
}

/** One line per template, `id: title` or the id alone, for the agent to pick from. */
function listOf(templates: readonly Template[]): string {
  if (templates.length === 0) {
    return "The workspace has no templates.";
  }
  const lines = templates.map((template) =>
    template.title === undefined ? template.id : `${template.id}: ${template.title}`,
  );
  return `The workspace's templates:\n${lines.join("\n")}`;
}

function readTemplate(call: ActionCall): ToolResult {
  const { templates } = call;
  const id = askedId(call.params);
  if (id === null) {
    return { error: `${call.tool.name}: give the template's id as text.` };
  }
  if (id === undefined) {
    return {
      content: listOf(templates),
      data: templates.map(({ id: each, title }) => ({ id: each, title })),
    };
  }
  const template = templates.find((each) => each.id === id);
  if (template === undefined) {
    return { error: `${call.tool.name}: there is no template '${id}'. ${listOf(templates)}` };
  }
  return { content: template.body, data: template };
}

/** The handler the runtime ships for `paperclip.template`. */
export const templateHandler: ActionHandler = {
  capabilities: [],
  run: async (call) => readTemplate(call),
};
