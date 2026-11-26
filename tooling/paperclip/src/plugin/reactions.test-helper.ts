import type { PluginApiRequestInput } from "@paperclipai/plugin-sdk";
import { fakeState } from "./fake-host.test-helper.ts";
import type { ReactionRoutesApi } from "./reactions.ts";

/** An invented chat task of the `acme` company, with the board's message and Liam's reply. */
export const chatTask = {
  id: "0b5c2f9e-4d1a-4c3b-9a8e-1f2d3c4b5a69",
  identifier: "HAL-9001",
  companyId: "acme",
};

/** The board's message on the chat task. */
export const boardMessage = {
  id: "6a1e2c3d-4b5f-4a6e-8d7c-9e0f1a2b3c4d",
  authorUserId: "user-board",
  authorAgentId: null,
  body: "Can you look at yesterday's run?",
};

/** Liam's reply on the chat task. */
export const agentReply = {
  id: "7b2f3d4e-5c6a-4b7f-9e8d-0f1a2b3c4d5e",
  authorUserId: null,
  authorAgentId: "agent-liam",
  body: "Looking now.",
};

/** The plugin context the reaction routes and the `react` tool use: the chat task in memory, state in memory. */
export function fakeReactionContext() {
  const { state, saved } = fakeState();
  const issues = {
    get: async (id: string, companyId: string) =>
      (id === chatTask.id || id === chatTask.identifier) && companyId === chatTask.companyId
        ? chatTask
        : null,
    listComments: async (id: string) => (id === chatTask.id ? [boardMessage, agentReply] : []),
  } as unknown as ReactionRoutesApi["issues"];
  return { state, saved, issues };
}

/** A signed-in board user, as a route sees them. */
export const boardActor = {
  actorType: "user",
  actorId: "user-board",
  userId: "user-board",
} as PluginApiRequestInput["actor"];

/** An agent's key, as a route sees it. */
export const agentActor = {
  actorType: "agent",
  actorId: "agent-liam",
  agentId: "agent-liam",
} as PluginApiRequestInput["actor"];

/** A request to a reactions route on `taskId`. */
export function reactionRequest(
  routeKey: string,
  actor: PluginApiRequestInput["actor"],
  body: unknown = null,
  taskId = chatTask.id,
  companyId = chatTask.companyId,
): PluginApiRequestInput {
  return {
    routeKey,
    method: body === null ? "GET" : "POST",
    path: `/reactions/${taskId}`,
    params: { taskId },
    query: { companyId },
    body,
    actor,
    companyId,
    headers: {},
  } as unknown as PluginApiRequestInput;
}
