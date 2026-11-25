import { MemoryChatSessions } from "@halonicjs/adapter-memory";
import { builtInAuthoringInstructions } from "@halonicjs/assistant";
import type { ChatTurnResponse, ToolCall } from "@halonicjs/ports";
import { errorKindOf } from "@halonicjs/std";
import { EngineNotAnswering, isUntrustedRefusal } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { acme, answered, device, setup } from "./workspace-assistant.test-helper.ts";

verifies("studio.workspace-assistant", () => {
  describe("WorkspaceAssistant", () => {
    it("Build chats are kept in the chat sessions store and come back", async () => {
      const sessions = new MemoryChatSessions();
      let second = 0;
      const now = () => new Date(Date.UTC(2026, 10, 24, 8, 0, second++));
      const first = setup({ sessions, now });
      const kept = await first.assistant.newChat("build");
      await first.assistant.answer({ chatId: kept.id, message: "Add a routine" });
      await first.assistant.newChat("agent:support/triage");
      await first.assistant.saved();
      expect((await sessions.list("memory:acme")).map((chat) => chat.id)).toEqual([kept.id]);

      const reopened = setup({ sessions, now }).assistant;
      expect((await reopened.chats()).map((chat) => chat.title)).toEqual(["Add a routine"]);
      expect((await reopened.chat(kept.id)).messages.map((message) => message.content)).toEqual([
        "Add a routine",
        "Done.",
      ]);

      for (let index = 0; index < 40; index++) {
        const chat = await reopened.newChat("build");
        await reopened.answer({ chatId: chat.id, message: `Chat ${index}` });
      }
      await reopened.saved();
      const saved = await sessions.list("memory:acme");
      expect(saved).toHaveLength(40);
      expect(saved.map((chat) => chat.id)).not.toContain(kept.id);
    });

    it("lists the item a chat is about, after a restart too, and only for a chat about one", async () => {
      const sessions = new MemoryChatSessions();
      const about = { kind: "workflow", hub: "support", id: "triage" } as const;
      const first = setup({ sessions });
      const triage = await first.assistant.newChat("build", about);
      expect(triage.about).toEqual(about);
      await first.assistant.answer({ chatId: triage.id, message: "Add a step" });
      const plain = await first.assistant.newChat("build");
      await first.assistant.answer({ chatId: plain.id, message: "Add a routine" });
      await first.assistant.saved();

      const chats = await setup({ sessions }).assistant.chats();
      expect(chats.find((chat) => chat.id === triage.id)?.about).toEqual(about);
      expect(chats.find((chat) => chat.id === plain.id)?.about).toBeUndefined();
    });

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
        "integration_guide",
        "validate",
        "propose_file",
        "propose_delete",
        "show",
      ]);
      expect(requests[0]?.turnLimit).toBe(9);
      expect(turnRequests[0]).toMatchObject({ hubId: "support", alias: "default" });
      const kept = await assistant.chat(chat.id);
      expect(kept).toMatchObject({ title: "Add a routine", draft: false, answering: false });
      expect(kept.messages.map((message) => message.content)).toEqual(["Add a routine", "Done."]);
    });

    it("tells the model what Show in chat put in the chat, with this answer only", async () => {
      const { assistant, requests } = setup();
      const chat = await assistant.newChat("build");
      const triage = { item: { kind: "workflow", hub: "support", id: "triage" }, name: "Triage" };
      await assistant.answer({ chatId: chat.id, message: "Add a step", shown: [triage] });
      await assistant.answer({ chatId: chat.id, message: "Thanks" });
      // The first message is the Build chat's authoring skill (assistant.build.authoring-skill-override).
      expect(requests[0]?.messages.slice(1)).toEqual([
        {
          role: "system",
          content: 'The person showed you these items: workflow "Triage" (support/triage).',
        },
        { role: "user", content: "Add a step" },
      ]);
      expect(requests[1]?.messages.map((message) => message.role)).toEqual([
        "system",
        "user",
        "assistant",
        "user",
      ]);
    });

    it("gives the model the notes on decided cards with the message, and keeps only the message", async () => {
      const { assistant, requests } = setup();
      const chat = await assistant.newChat("build");
      const notes = ["(The person accepted the changes to models.yaml.)"];
      await assistant.answer({ chatId: chat.id, message: "Thanks", notes });
      expect(requests[0]?.messages.at(-1)).toEqual({
        role: "user",
        content: "(The person accepted the changes to models.yaml.)\n\nThanks",
      });
      const kept = await assistant.chat(chat.id);
      expect(kept.messages.map((message) => message.content)).toEqual(["Thanks", "Done."]);
    });

    it("reads a file as saved, for a card to tell an Accept from a Reject", async () => {
      const { assistant } = setup({ files: { "notes.md": "Hello\n" } });
      expect(await assistant.savedText("notes.md")).toBe("Hello\n");
      expect(await assistant.savedText("missing.md")).toBeNull();
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

    it("answers an agent chat as the agent, with no authoring tools (5.3)", async () => {
      const files = { "hubs/support/agents/triage.agent.yaml": "id: triage\nname: Triage\n" };
      const { assistant, requests } = setup({ files });
      const chat = await assistant.newChat("agent:support/triage");
      await assistant.answer({ chatId: chat.id, message: "Sort this mail" });
      expect(requests[0]).toMatchObject({
        settings: { hubId: "support", agentId: "triage" },
        tools: [],
        turnLimit: 6,
      });
      expect((await assistant.agents()).map((agent) => agent.kind)).toEqual([
        "agent:support/triage",
      ]);
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

    it("lets go of the oldest chat and its tools once a 41st chat answers", async () => {
      let seconds = 0;
      const { assistant, requests } = setup({
        now: () => new Date(Date.UTC(2026, 10, 24, 8, 0, seconds++)),
      });
      const ids: string[] = [];
      for (let index = 0; index < 41; index++) {
        const chat = await assistant.newChat("build");
        await assistant.answer({ chatId: chat.id, message: `Chat ${index}` });
        ids.push(chat.id);
      }
      expect(requests).toHaveLength(41);
      const kept = (await assistant.chats()).map((chat) => chat.id);
      expect(kept).toHaveLength(40);
      expect(kept).not.toContain(ids[0]);
      await expect(assistant.chat(ids[0] ?? "")).rejects.toSatisfy(
        (error) => errorKindOf(error) === "not_found",
      );
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

verifies("assistant.build.authoring-skill-accepted", () => {
  const skillPath = "library/skills/halonic-authoring/SKILL.md";
  const dutch =
    "---\nname: halonic-authoring\ndescription: Ours.\n---\n\nAlways answer in Dutch.\n";

  it("follows a skill the assistant proposed only once the person accepts it", async () => {
    const propose: ToolCall = {
      id: "call-1",
      name: "propose_file",
      arguments: { path: skillPath, content: dutch, why: "Answer in Dutch." },
    };
    const { assistant, requests } = setup({ turns: [answered("", [propose])] });
    const chat = await assistant.newChat("build");
    await assistant.answer({ chatId: chat.id, message: "Answer in Dutch from now on" });
    await assistant.answer({ chatId: chat.id, message: "Add a routine" });
    expect(requests[1]?.messages[0]?.content).toBe(builtInAuthoringInstructions);
    await assistant.accept({ kind: "card", card: { chatId: chat.id, cardId: "call-1" } });
    await assistant.answer({ chatId: chat.id, message: "Add a routine" });
    expect(requests[2]?.messages[0]?.content).toBe("Always answer in Dutch.");
  });

  it("keeps the accepted skill while the assistant's edit of it waits for review", async () => {
    const read: ToolCall = { id: "call-1", name: "read_file", arguments: { path: skillPath } };
    const french = dutch.replace("Dutch", "French");
    const propose: ToolCall = {
      id: "call-2",
      name: "propose_file",
      arguments: { path: skillPath, content: french, why: "Answer in French." },
    };
    const { assistant, requests } = setup({
      files: { [skillPath]: dutch },
      turns: [answered("", [read]), answered("", [propose])],
    });
    const chat = await assistant.newChat("build");
    await assistant.answer({ chatId: chat.id, message: "Answer in French from now on" });
    expect(await assistant.itemsToReview(chat.id)).toHaveLength(1);
    await assistant.answer({ chatId: chat.id, message: "Add a routine" });
    expect(requests[1]?.messages[0]?.content).toBe("Always answer in Dutch.");
  });
});

verifies("studio.workspace-assistant-send", () => {
  it("says when the engine stops answering, and that it doesn't (H12)", async () => {
    const { assistant, stopEngine } = setup();
    const changes: string[] = [];
    assistant.onDidChange((change) => changes.push(change.kind));
    expect(assistant.engineAnswering()).toBe(true);
    stopEngine();
    expect(assistant.engineAnswering()).toBe(false);
    expect(changes).toEqual(["engine"]);
    expect(assistant.workspaceName()).toBe("Acme");
  });

  describe("in a workspace this computer doesn't trust", () => {
    it("refuses a model from the workspace before anything is sent (H16)", async () => {
      const { assistant, requests } = setup({ trusted: false, settings: device });
      const chat = await assistant.newChat("build");
      await assistant.setModel(chat.id, { kind: "alias", name: "smart" });
      await expect(assistant.answer({ chatId: chat.id, message: "Hi" })).rejects.toSatisfy(
        isUntrustedRefusal,
      );
      expect(requests).toEqual([]);
      expect(await assistant.chat(chat.id)).toMatchObject({ draft: true, messages: [] });
    });

    it("keeps the Settings model after the assistant adds an alias with its name (R1)", async () => {
      const propose = (id: string, path: string, content: string): ToolCall => ({
        id,
        name: "propose_file",
        arguments: { path, content, why: "Use my own address." },
      });
      const models = `${acme["models.yaml"]}\n  claude-sonnet-5-5: { provider: elsewhere, model: echo }\n`;
      const elsewhere =
        "id: elsewhere\nname: Elsewhere\ntype: openai\nbaseUrl: https://models.example.test/v1\n";
      const { assistant, store, turnRequests } = setup({
        trusted: false,
        settings: device,
        turns: [
          // A write to a file that exists needs the model to have read it first (HAL-3247).
          answered("", [{ id: "call-0", name: "read_file", arguments: { path: "models.yaml" } }]),
          answered("", [
            propose("call-1", "models.yaml", models),
            propose("call-2", "providers/elsewhere.yaml", elsewhere),
          ]),
        ],
      });
      const chat = await assistant.newChat("build");
      await assistant.answer({ chatId: chat.id, message: "Point the model somewhere else" });
      expect(await store.read("models.yaml")).toBe(models);
      await assistant.answer({ chatId: chat.id, message: "Hi" });
      const next = turnRequests.at(-1);
      expect(next?.alias).toBeUndefined();
      expect(next?.agent).toEqual({
        type: "anthropic",
        model: "claude-sonnet-5-5",
        secret: "ANTHROPIC_API_KEY",
        local: false,
      });
    });
  });
});
