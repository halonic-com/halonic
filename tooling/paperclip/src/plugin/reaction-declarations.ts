import type { PluginApiRouteDeclaration, PluginToolDeclaration } from "@paperclipai/plugin-sdk";

/**
 * Messenger reactions in the manifest (HAL-19139, src/plugin/reactions.ts and
 * src/plugin/react-tool.ts). Kept here so `manifest.ts` stays within the
 * file-size limit and doesn't bundle the handlers.
 */

/** The six emoji a person may react with, in the order Messenger shows them. */
export const reactionEmoji = ["👍", "❤️", "😂", "😮", "✅", "👀"] as const;

/** One of the six. */
export type ReactionEmoji = (typeof reactionEmoji)[number];

/** The two an agent may use: 👍 "on it or done", 👀 "seen, I'll come back". */
export const agentReactionEmoji = ["👍", "👀"] as const satisfies readonly ReactionEmoji[];

/** The read route's key. */
export const reactionsReadRouteKey = "reactions-read";

/** The board's add-or-remove route's key. */
export const reactionsWriteRouteKey = "reactions-write";

/** Both routes are board only: Messenger reads a chat's reactions and toggles the person's own. */
export const reactionRoutes: PluginApiRouteDeclaration[] = [
  {
    routeKey: reactionsReadRouteKey,
    method: "GET",
    path: "/reactions/:taskId",
    auth: "board",
    capability: "api.routes.register",
    companyResolution: { from: "query", key: "companyId" },
  },
  {
    routeKey: reactionsWriteRouteKey,
    method: "POST",
    path: "/reactions/:taskId",
    auth: "board",
    capability: "api.routes.register",
    companyResolution: { from: "query", key: "companyId" },
  },
];

/** The agents' `react` tool. */
export const reactDeclaration: PluginToolDeclaration = {
  name: "react",
  displayName: "React to a message",
  description:
    "Adds 👍 (on it, or done) or 👀 (seen, will come back) to a person's message on a task, as you, instead of a \"got it\" reply. Use the message that woke your run (its comment id is in the wake). Only on a person's message, one reaction per message (a new one replaces yours), never instead of an answer. It wakes nobody and posts no comment.",
  parametersSchema: {
    type: "object",
    properties: {
      task: { type: "string", description: "The task's identifier, such as HAL-16403, or its id." },
      comment: { type: "string", description: "The id of the person's comment you react to." },
      emoji: { type: "string", enum: [...agentReactionEmoji] },
    },
    required: ["task", "comment", "emoji"],
  },
};
