import type {
  PluginApiRequestInput,
  PluginApiResponse,
  PluginStateClient,
} from "@paperclipai/plugin-sdk";
import { callCostMicroUsd } from "../front-bot/limits.ts";
import type { FrontBotLogRecord } from "../front-bot/log-record.ts";
import { notCalledRecord } from "../front-bot/log-record.ts";
import {
  type ChatMemory,
  emptyMemory,
  memoryRequest,
  parseMemoryUpdate,
  storableMemory,
} from "../front-bot/memory.ts";
import type { FrontBotInput } from "../front-bot/prompt.ts";
import type { SecretRef } from "../task-effort/settings.ts";
import type { FrontBotApi, RecordBase } from "./front-bot.ts";
import { countSpend, readBudget, recordCall } from "./front-bot-budget.ts";
import { askFrontBot, type FrontBotDeps } from "./front-bot-calls.ts";
import { chatMemoryClearRouteKey } from "./front-bot-notes.ts";

/**
 * Where the front bot keeps its memory (HAL-19597, front-bot/memory.ts): the
 * chat's summary on the chat task, a board user's notes on the company. Read
 * before a reply with two state reads; rewritten after a posted reply by one
 * background call; read and cleared by the board on the chat-memory route.
 */

type StateGet = Pick<PluginStateClient, "get">;
type StateGetSetDelete = Pick<PluginStateClient, "get" | "set" | "delete">;

function summaryKey(taskId: string) {
  return {
    scopeKind: "issue",
    scopeId: taskId,
    namespace: "front-bot",
    stateKey: "summary",
  } as const;
}

function userNotesKey(companyId: string, userId: string) {
  return {
    scopeKind: "company",
    scopeId: companyId,
    namespace: "front-bot",
    stateKey: `user-notes:${userId}`,
  } as const;
}

/** A stored part of the memory, tagged with its company so another company never reads it. */
interface Stored<T> {
  readonly companyId: string;
  readonly value: T;
}

function storedValue<T>(record: unknown, companyId: string): T | undefined {
  const stored = record as Stored<T> | null;
  return stored !== null && stored.companyId === companyId ? stored.value : undefined;
}

/** The chat's summary and the board user's notes, as stored; empty when there are none. */
export async function readMemory(
  state: StateGet,
  companyId: string,
  taskId: string,
  userId: string,
): Promise<ChatMemory> {
  const summary = storedValue<string>(await state.get(summaryKey(taskId)), companyId);
  const notes = storedValue<string[]>(await state.get(userNotesKey(companyId, userId)), companyId);
  return { summary: summary ?? emptyMemory.summary, notes: notes ?? emptyMemory.notes };
}

/** Stores the memory, after dropping everything shaped like a key (`storableMemory`). */
export async function writeMemory(
  state: Pick<PluginStateClient, "set">,
  companyId: string,
  taskId: string,
  userId: string,
  memory: ChatMemory,
): Promise<void> {
  const { summary, notes } = storableMemory(memory);
  await state.set(summaryKey(taskId), { companyId, value: summary });
  await state.set(userNotesKey(companyId, userId), { companyId, value: notes });
}

/** Forgets the chat's summary, when this company stored it, and the board user's notes. */
export async function clearMemory(
  state: StateGetSetDelete,
  companyId: string,
  taskId: string,
  userId: string,
): Promise<void> {
  const summary = storedValue<string>(await state.get(summaryKey(taskId)), companyId);
  if (summary !== undefined) await state.delete(summaryKey(taskId));
  await state.delete(userNotesKey(companyId, userId));
}

/** One exchange the memory learns from: who wrote, what the bot read and what it posted. */
export interface Exchange {
  readonly base: RecordBase;
  readonly keyRef: SecretRef;
  readonly userId: string;
  readonly input: FrontBotInput;
  readonly reply: readonly string[];
}

/**
 * Rewrites the memory after a posted reply: one Haiku call within the day's
 * cap and error stop, like any other call. It runs after the reply's lines are
 * out, so it never slows a reply; when it fails, the old memory stays.
 */
export async function updateMemory(
  ctx: FrontBotApi,
  deps: FrontBotDeps,
  exchange: Exchange,
): Promise<FrontBotLogRecord> {
  const { base, input, userId } = exchange;
  const { companyId, taskId } = base;
  const stop = (outcome: "capped" | "stopped", reason: "cap_reached" | "error_rate") =>
    notCalledRecord(base, outcome, reason, "memory");
  const started = deps.now();
  const budget = await readBudget(ctx, companyId, started);
  if (budget === "cap_reached") return stop("capped", budget);
  if (budget === "error_rate") return stop("stopped", budget);
  const old = input.memory ?? emptyMemory;
  const request = memoryRequest(input, exchange.reply, old);
  const call = await askFrontBot(ctx, deps, exchange.keyRef, companyId, request);
  await recordCall(ctx, companyId, budget.health, deps.now(), !call.answered);
  const latencyMs = deps.now().getTime() - started.getTime();
  if (!call.answered) {
    return { ...notCalledRecord(base, "failed", call.reason, "memory"), latencyMs };
  }
  const cost = callCostMicroUsd(call.usage);
  await countSpend(ctx, companyId, budget.spend, cost);
  const updated = parseMemoryUpdate(call.text);
  if (updated !== undefined) await writeMemory(ctx.state, companyId, taskId, userId, updated);
  return {
    ...base,
    callType: "memory",
    inputTokens: call.inputTokens,
    outputTokens: call.outputTokens,
    costMicroUsd: cost,
    latencyMs,
    outcome: updated === undefined ? "failed" : "saved",
    reason: updated === undefined ? "unreadable_answer" : undefined,
  };
}

/** A task id: Paperclip's ids are UUIDs; anything else is refused before reading state. */
const taskIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Answers `GET /chat-memory/{taskId}` and `DELETE /chat-memory/{taskId}`, board
 * only: the chat's summary and the asking board user's own notes, or clears
 * both. Messenger's screen for it is a separate task.
 */
export async function handleChatMemory(
  input: PluginApiRequestInput,
  ctx: { readonly state: StateGetSetDelete },
): Promise<PluginApiResponse> {
  const userId = input.actor.actorType === "user" ? input.actor.userId : undefined;
  if (typeof userId !== "string" || userId === "") {
    return { status: 403, body: { error: "Only the board can read or clear the chat's memory." } };
  }
  const taskId = input.params["taskId"] ?? "";
  if (!taskIdPattern.test(taskId)) {
    return { status: 404, body: { error: "No such task." } };
  }
  if (input.routeKey === chatMemoryClearRouteKey) {
    await clearMemory(ctx.state, input.companyId, taskId, userId);
    return { status: 200, body: { cleared: true } };
  }
  const memory = await readMemory(ctx.state, input.companyId, taskId, userId);
  return { status: 200, body: { summary: memory.summary, notes: memory.notes } };
}
