import { webCryptoDigest } from "@halonicjs/adapter-fs-tauri";
import { MemoryChatSessions, MemoryDefinitionStore } from "@halonicjs/adapter-memory";
import {
  type ChatAnswerRequest,
  ChatService,
  type HostSettings,
  ReviewService,
} from "@halonicjs/app";
import type { ChatTurnRequest, ChatTurnResponse, ToolCall } from "@halonicjs/ports";
import type { DocsReading } from "./chat-docs.ts";
import { WorkspaceAssistant } from "./workspace-assistant.ts";

/** An invented workspace with two mock model aliases and one hub. */
export const acme = {
  "workspace.yaml": "id: acme\nname: Acme\n",
  "models.yaml": [
    "aliases:",
    "  smart: { provider: mock, model: echo }",
    "  default: { provider: mock, model: echo }",
  ].join("\n"),
  "providers/mock.yaml": "id: mock\nname: Test model\ntype: mock\nlocal: true\n",
  "hubs/support/hub.yaml": "id: support\nname: Support\n",
};

/** A model turn that answers `content`, calling `toolCalls` when given. */
export const answered = (content: string, toolCalls: ToolCall[] = []): ChatTurnResponse => ({
  content,
  toolCalls,
  usage: { inputTokens: 10, outputTokens: 5 },
  finishReason: toolCalls.length === 0 ? "stop" : "tool_calls",
  model: "echo",
});

/** A model turn, or one worked out from its request. */
export type Turn = ChatTurnResponse | ((request: ChatTurnRequest) => Promise<ChatTurnResponse>);

/** A {@link WorkspaceAssistant} on `acme`, answering on a mock engine, with what it was asked. */
export function setup(
  options: {
    files?: Record<string, string>;
    settings?: Record<string, unknown>;
    turns?: Turn[];
    /** Refuses every answer before any model turn, as the engine refuses an untrusted start. */
    refuse?: Error;
    now?: () => Date;
    /** Whether this computer trusts the workspace; it does unless told otherwise. */
    trusted?: boolean;
    /** Where the chats are saved; a new store unless told otherwise. */
    sessions?: MemoryChatSessions;
    /** What `read_docs` reads with; without it the Build chat has no `read_docs`. */
    docs?: DocsReading;
  } = {},
) {
  const store = new MemoryDefinitionStore({ ...acme, ...options.files }, "memory:acme");
  const review = new ReviewService({
    store,
    records: new MemoryDefinitionStore({}, "memory:review"),
    digest: webCryptoDigest,
    isTrusted: () => options.trusted ?? true,
  });
  const turns = [...(options.turns ?? [])];
  const requests: ChatAnswerRequest[] = [];
  const turnRequests: ChatTurnRequest[] = [];
  const executor = {
    chatTurn: async (request: ChatTurnRequest) => {
      turnRequests.push(request);
      const next = turns.shift() ?? answered("Done.");
      return typeof next === "function" ? next(request) : next;
    },
  };
  const values = new Map(Object.entries(options.settings ?? {}));
  const settings = {
    get: (setting) => (values.has(setting.key) ? values.get(setting.key) : setting.fallback),
  } as Pick<HostSettings, "get">;
  const engineListeners = new Set<(answering: boolean) => void>();
  let engineAnswering = true;
  const assistant = new WorkspaceAssistant({
    files: store,
    review,
    digest: webCryptoDigest,
    isTrusted: () => options.trusted ?? true,
    answerChat: async (request) => {
      requests.push(request);
      if (options.refuse !== undefined) throw options.refuse;
      return new ChatService(executor).answer(request);
    },
    // Before trust a Build chat on the Settings model answers here, on no engine.
    answerAuthoring: (request) => new ChatService(executor).answer(request),
    settings,
    engine: {
      answering: () => engineAnswering,
      onChange: (listener) => {
        engineListeners.add(listener);
        return () => engineListeners.delete(listener);
      },
    },
    workspaceName: "Acme",
    chats: { sessions: options.sessions ?? new MemoryChatSessions(), location: "memory:acme" },
    now: options.now ?? (() => new Date("2026-11-23T10:00:00.000Z")),
    docs: options.docs,
  });
  const stopEngine = () => {
    engineAnswering = false;
    for (const listener of engineListeners) listener(false);
  };
  return { assistant, store, requests, turnRequests, stopEngine };
}

/** A Settings › Assistant model with its key's name. */
export const device = {
  "assistant.provider": "anthropic",
  "assistant.model": "claude-sonnet-5-5",
  "assistant.secret-name": "ANTHROPIC_API_KEY",
};
