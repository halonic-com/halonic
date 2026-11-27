import type { PluginApiRouteDeclaration } from "@paperclipai/plugin-sdk";
import { chatMemoryClearRouteKey, chatMemoryRouteKey } from "./front-bot-memory.ts";
import { chatNotesRouteKey } from "./front-bot-notes.ts";

/** The front bot's board-only routes, as the manifest declares them. */
export const frontBotRoutes: readonly PluginApiRouteDeclaration[] = (
  [
    // The front bot's own comment ids on one chat task, read by Messenger (front-bot-notes.ts).
    [chatNotesRouteKey, "GET", "/chat-notes/:taskId"],
    // The front bot's memory of one chat and the asking board user: read and clear (front-bot-memory.ts).
    [chatMemoryRouteKey, "GET", "/chat-memory/:taskId"],
    [chatMemoryClearRouteKey, "DELETE", "/chat-memory/:taskId"],
  ] as const
).map(([routeKey, method, path]) => ({
  routeKey,
  method,
  path,
  auth: "board" as const,
  capability: "api.routes.register" as const,
  companyResolution: { from: "query" as const, key: "companyId" },
}));
