import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { HarnessEvent } from "@halonicjs/ports";
import { isPlainObject } from "@halonicjs/std";
import {
  AppServerEventReader,
  type AppServerNotification,
  TurnFailedError,
} from "./app-server-events.ts";

/** The token the recorded runs were given; made up. */
export const bridgeToken = "made-up-run-token-0123456789";
export const threadId = "thread-fixture";

/** The notifications of a recorded run in `fixtures/`, and the thread it ran in. */
export function recorded(name: string): {
  notifications: AppServerNotification[];
  threadId: string;
} {
  const path = fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));
  const messages = readFileSync(path, "utf8")
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => JSON.parse(line) as Record<string, unknown>);
  const notifications = messages.filter(
    (message): message is Record<string, unknown> & AppServerNotification =>
      typeof message["method"] === "string",
  );
  const started = notifications.find(({ method }) => method === "thread/started")?.params;
  const thread =
    isPlainObject(started) && isPlainObject(started["thread"]) ? started["thread"] : {};
  return { notifications, threadId: String(thread["id"]) };
}

/** Every event the notifications give, and the error the run ended with, if any. */
export function readAll(
  notifications: readonly AppServerNotification[],
  thread = threadId,
): { events: HarnessEvent[]; error?: unknown } {
  const reader = new AppServerEventReader({ agentId: "writer", bridgeToken, threadId: thread });
  const events: HarnessEvent[] = [];
  try {
    for (const notification of notifications) events.push(...reader.read(notification));
  } catch (error) {
    if (error instanceof TurnFailedError) events.push(...error.events);
    return { events, error };
  }
  return { events };
}

export function readRecorded(name: string): { events: HarnessEvent[]; error?: unknown } {
  const run = recorded(name);
  return readAll(run.notifications, run.threadId);
}

export function item(method: "item/started" | "item/completed", fields: Record<string, unknown>) {
  return { method, params: { threadId, turnId: "turn-1", item: fields } };
}

export function turnCompleted(turn: Record<string, unknown>): AppServerNotification {
  return { method: "turn/completed", params: { threadId, turn: { id: "turn-1", ...turn } } };
}

/** The task agent's turn, completed. */
export const done = turnCompleted({ status: "completed", error: null });
