import { webCryptoDigest } from "@halonicjs/adapter-fs-tauri";
import { MemoryDefinitionStore } from "@halonicjs/adapter-memory";
import {
  type ChatAnswerRequest,
  ChatService,
  type HostSettings,
  ReviewService,
} from "@halonicjs/app";
import type { ChatTurnRequest, ChatTurnResponse, ToolCall } from "@halonicjs/ports";
import { errorKindOf } from "@halonicjs/std";
import { EngineNotAnswering } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { WorkspaceAssistant } from "./workspace-assistant.ts";

const acme = {
  "workspace.yaml": "id: acme\nname: Acme\n",
  "models.yaml": [
    "aliases:",
    "  smart: { provider: mock, model: echo }",
    "  default: { provider: mock, model: echo }",
  ].join("\n"),
  "providers/mock.yaml": "id: mock\nname: Test model\ntype: mock\nlocal: true\n",
  "hubs/support/hub.yaml": "id: support\nname: Support\n",
};

const answered = (content: string, toolCalls: ToolCall[] = []): ChatTurnResponse => ({
  content,
  toolCalls,
  usage: { inputTokens: 10, outputTokens: 5 },
  finishReason: toolCalls.length === 0 ? "stop" : "tool_calls",
  model: "echo",
});

type Turn = ChatTurnResponse | ((request: ChatTurnRequest) => Promise<ChatTurnResponse>);

function setup(
  options: {
    files?: Record<string, string>;
    settings?: Record<string, unknown>;
    turns?: Turn[];
    /** Refuses every answer before any model turn, as the engine refuses an untrusted start. */
    refuse?: Error;
  } = {},
) {
  const store = new MemoryDefinitionStore({ ...acme, ...options.files }, "memory:acme");
  const review = new ReviewService({
    store,
    records: new MemoryDefinitionStore({}, "memory:review"),
    digest: webCryptoDigest,
    isTrusted: () => true,
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
  const engineStopped = new Set<() => void>();
  const assistant = new WorkspaceAssistant({
    files: store,
    review,
    digest: webCryptoDigest,
    isTrusted: () => true,
    answerChat: async (request) => {
      requests.push(request);
      if (options.refuse !== undefined) throw options.refuse;
      return new ChatService(executor).answer(request);
    },
    settings,
    onEngineStopped: (listener) => {
      engineStopped.add(listener);
      return () => engineStopped.delete(listener);
    },
    now: () => new Date("2026-11-23T10:00:00.000Z"),
  });
  const stopEngine = () => {
    for (const listener of engineStopped) listener();
  };
  return { assistant, store, requests, turnRequests, stopEngine };
}

const device = {
  "assistant.provider": "anthropic",
  "assistant.model": "claude-sonnet-5-5",
  "assistant.secret-name": "ANTHROPIC_API_KEY",
};

verifies("studio.workspace-assistant", () => {
  describe("WorkspaceAssistant", () => {
    it("answers on the chat service with the Build chat's tools and the Settings model call limit", async () => {
      const { assistant, requests, turnRequests } = setup({
        settings: { "assistant.turn-limit": 9 },
      });
      const chat = await assistant.newChat("build");
      const answer = await assistant.answer({ chatId: chat.id, message: "Add a routine" });
      expect(answer.end).toEqual({ reason: "answered" });
      expect(requests[0]?.tools.map((tool) => tool.definition.name)).toEqual([
        "list_files",
        "read_file",
        "schema",
        "validate",
        "propose_file",
        "propose_delete",
      ]);
      expect(requests[0]?.turnLimit).toBe(9);
      expect(turnRequests[0]).toMatchObject({ hubId: "support", alias: "default" });
      const kept = await assistant.chat(chat.id);
      expect(kept).toMatchObject({ title: "Add a routine", draft: false, answering: false });
      expect(kept.messages.map((message) => message.content)).toEqual(["Add a routine", "Done."]);
    });

    it("takes the model call limit of workspace.yaml over Settings", async () => {
      const files = { "workspace.yaml": "id: acme\nname: Acme\nassistant:\n  maxSteps: 3\n" };
      const { assistant, requests } = setup({ files, settings: { "assistant.turn-limit": 9 } });
      const chat = await assistant.newChat("build");
      await assistant.answer({ chatId: chat.id, message: "Add a routine" });
      expect(requests[0]?.turnLimit).toBe(3);
    });

    it("starts a new chat on the workspace's own assistant model first", async () => {
      const files = { "workspace.yaml": "id: acme\nname: Acme\nassistant:\n  model: smart\n" };
      const { assistant, turnRequests } = setup({ files, settings: device });
      const chat = await assistant.newChat("build");
      expect(chat.model).toEqual({ kind: "assistant" });
      expect((await assistant.models())[0]).toMatchObject({ label: "smart", from: "workspace" });
      await assistant.answer({ chatId: chat.id, message: "Hi" });
      expect(turnRequests[0]).toMatchObject({ alias: "smart" });
    });

    it("then on the Settings › Assistant model, sending its key's name, never a key", async () => {
      const { assistant, turnRequests } = setup({ settings: device });
      const chat = await assistant.newChat("build");
      expect((await assistant.models())[0]).toMatchObject({
        label: "claude-sonnet-5-5",
        from: "settings",
      });
      await assistant.answer({ chatId: chat.id, message: "Hi" });
      expect(turnRequests[0]?.agent).toEqual({
        type: "anthropic",
        model: "claude-sonnet-5-5",
        secret: "ANTHROPIC_API_KEY",
        local: false,
      });
    });

    it("then on the last Build chat's model, else the alias default", async () => {
      const { assistant } = setup();
      const first = await assistant.newChat("build");
      expect(first.model).toEqual({ kind: "alias", name: "default" });
      await assistant.setModel(first.id, { kind: "alias", name: "smart" });
      await assistant.answer({ chatId: first.id, message: "Hi" });
      expect((await assistant.newChat("build")).model).toEqual({ kind: "alias", name: "smart" });
    });

    it("keeps nothing of a message the engine refused before any model turn", async () => {
      const refused = new Error("This workspace isn't trusted yet, so nothing was started.");
      const { assistant } = setup({ refuse: refused });
      const chat = await assistant.newChat("build");
      await expect(assistant.answer({ chatId: chat.id, message: "Hi" })).rejects.toBe(refused);
      expect(await assistant.chat(chat.id)).toMatchObject({ draft: true, messages: [] });
      expect(await assistant.chats()).toEqual([]);
    });

    it("writes a propose_file call as a change to review of this chat", async () => {
      const propose: ToolCall = {
        id: "call-1",
        name: "propose_file",
        arguments: { path: "notes/plan.md", content: "# Plan\n", why: "A plan." },
      };
      const { assistant, store } = setup({ turns: [answered("", [propose])] });
      const chat = await assistant.newChat("build");
      await assistant.answer({ chatId: chat.id, message: "Write a plan" });
      expect(await store.read("notes/plan.md")).toBe("# Plan\n");
      expect(await assistant.itemsToReview(chat.id)).toEqual([
        { path: "notes/plan.md", card: { chatId: chat.id, cardId: "call-1" } },
      ]);
      expect((await assistant.chats())[0]).toMatchObject({ id: chat.id, itemsToReview: 1 });
    });

    it("ends an answer as the engine not answering when the shell finds it stopped (K3)", async () => {
      const read: ToolCall = { id: "call-1", name: "list_files", arguments: {} };
      let stopEngine = () => {};
      const engine = setup({
        turns: [
          answered("", [read]),
          (request) => {
            const stopped = new Promise<ChatTurnResponse>((_, reject) =>
              request.signal?.addEventListener("abort", () => reject(new Error("aborted"))),
            );
            stopEngine();
            return stopped;
          },
        ],
      });
      stopEngine = engine.stopEngine;
      const chat = await engine.assistant.newChat("build");
      const answer = await engine.assistant.answer({ chatId: chat.id, message: "Look around" });
      expect(answer.end).toMatchObject({ reason: "failed", toolsRan: true });
      expect(answer.end.reason === "failed" && answer.end.error).toBeInstanceOf(EngineNotAnswering);
    });

    it("refuses a second answer while the chat answers, and a chat that isn't there", async () => {
      let release: (() => void) | undefined;
      let started: () => void = () => {};
      const turnStarted = new Promise<void>((resolve) => (started = resolve));
      const { assistant } = setup({
        turns: [
          () => {
            started();
            return new Promise((resolve) => (release = () => resolve(answered("Done."))));
          },
        ],
      });
      const chat = await assistant.newChat("build");
      const first = assistant.answer({ chatId: chat.id, message: "One" });
      await expect(assistant.answer({ chatId: chat.id, message: "Two" })).rejects.toSatisfy(
        (error) => errorKindOf(error) === "conflict",
      );
      await expect(assistant.chat(chat.id)).resolves.toMatchObject({ answering: true });
      await turnStarted;
      release?.();
      await first;
      await expect(assistant.chat("gone")).rejects.toSatisfy(
        (error) => errorKindOf(error) === "not_found",
      );
    });
  });
});

verifies("assistant.build.authoring-skill-override", () => {
  const skillPath = "library/skills/halonic-authoring/SKILL.md";
  const dutch =
    "---\nname: halonic-authoring\ndescription: Ours.\n---\n\nAlways answer in Dutch.\n";

  it("tells a Build chat's model the workspace's own skill before the messages", async () => {
    const { assistant, requests } = setup({ files: { [skillPath]: dutch } });
    const chat = await assistant.newChat("build");
    await assistant.answer({ chatId: chat.id, message: "Add a routine" });
    expect(requests[0]?.messages[0]).toEqual({
      role: "system",
      content: "Always answer in Dutch.",
    });
    expect((await assistant.chat(chat.id)).messages.map((message) => message.role)).toEqual([
      "user",
      "assistant",
    ]);
  });

  it("writes the built-in skill once as the person's own file, and then has one", async () => {
    const { assistant, store, requests } = setup();
    expect(await assistant.authoringSkill()).toBeNull();
    expect(await assistant.customizeSkill()).toBe(skillPath);
    expect(await assistant.authoringSkill()).toBe(skillPath);
    expect(await assistant.itemsToReview()).toEqual([]);
    const written = await store.read(skillPath);
    expect(written).toContain("name: halonic-authoring");
    expect(await assistant.customizeSkill()).toBe(skillPath);
    expect(await store.read(skillPath)).toBe(written);
    const chat = await assistant.newChat("build");
    await assistant.answer({ chatId: chat.id, message: "Hi" });
    expect(requests[0]?.messages[0]?.role).toBe("system");
  });

  it("keeps a skill file the workspace can't load as it is", async () => {
    const broken = "---\nname: halonic-authoring\n---\nMine.\n";
    const { assistant, store } = setup({ files: { [skillPath]: broken } });
    expect(await assistant.customizeSkill()).toBe(skillPath);
    expect(await store.read(skillPath)).toBe(broken);
  });
});
