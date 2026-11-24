// The Build chat's `show` tool (`assistant.build.show-tool`, flow-assistant
// 3.8 and 5.7): the model shows the person an item next to the chat. Only
// items of the workspace's own hubs: any other hub gets the same answer as
// an item that isn't there, and nothing opens.

import type { ChatTool } from "@halonicjs/app";
import { loadWorkspace } from "@halonicjs/workspace";
import { type BuildChat, textArgument } from "./build-chat.ts";
import { toolTexts } from "./tool-texts.ts";

/** `show`: shows one item in the main view, next to the chat. */
export function showTool(chat: BuildChat): ChatTool {
  return {
    definition: {
      name: "show",
      description:
        "Shows the person one item in the main view, next to the chat, such as a run, an agent or a workflow.",
      parameters: {
        type: "object",
        properties: {
          kind: { type: "string", description: "The item's kind, such as run, agent or workflow." },
          hub: { type: "string", description: "The id of the hub the item belongs to." },
          id: { type: "string", description: "The item's id, such as r42." },
        },
        required: ["kind", "hub", "id"],
      },
    },
    async call(toolCall) {
      const item = {
        kind: textArgument(toolCall.arguments, "kind"),
        hub: textArgument(toolCall.arguments, "hub"),
        id: textArgument(toolCall.arguments, "id"),
      };
      const show = chat.options.show;
      if (show === undefined) {
        return toolTexts.nowhereToShow;
      }
      if (!(await hubsOf(chat)).has(item.hub)) {
        return toolTexts.noItem(item);
      }
      switch (await show(item)) {
        case "shown":
          return toolTexts.shown(item);
        case "unknown":
          return toolTexts.noItem(item);
        case "nowhere":
          return toolTexts.nowhereToShow;
      }
    },
  };
}

/** The hubs of the workspace as saved: the folders its items sit in. */
async function hubsOf(chat: BuildChat): Promise<ReadonlySet<string>> {
  const { files } = await loadWorkspace(chat.options.files);
  return new Set(files.flatMap((file) => (file.hub === null ? [] : [file.hub])));
}
