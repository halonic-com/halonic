import { webCryptoDigest } from "@halonicjs/adapter-fs-tauri";
import { MemoryDefinitionStore } from "@halonicjs/adapter-memory";
import { ChatService, type HostSettings, ReviewService } from "@halonicjs/app";
import type { ChatTurnResponse, ToolCall } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it, vi } from "vitest";
import { WorkspaceAssistant } from "./workspace-assistant.ts";

const acme = {
  "workspace.yaml": "id: acme\nname: Acme\n",
  "models.yaml": "aliases:\n  default: { provider: mock, model: echo }\n",
  "providers/mock.yaml": "id: mock\nname: Test model\ntype: mock\nlocal: true\n",
  "hubs/support/hub.yaml": "id: support\nname: Support\n",
};

const r42 = { kind: "run", hub: "support", id: "r42" };

const answered = (content: string, toolCalls: ToolCall[] = []): ChatTurnResponse => ({
  content,
  toolCalls,
  usage: { inputTokens: 10, outputTokens: 5 },
  finishReason: toolCalls.length === 0 ? "stop" : "tool_calls",
  model: "echo",
});

/** The folder's Assistant on a model that calls `show` for `r42` once, then says "Done.". */
function setup() {
  const store = new MemoryDefinitionStore(acme, "memory:acme");
  const review = new ReviewService({
    store,
    records: new MemoryDefinitionStore({}, "memory:review"),
    digest: webCryptoDigest,
    isTrusted: () => true,
  });
  const turns = [answered("", [{ id: "s1", name: "show", arguments: r42 }]), answered("Done.")];
  const executor = { chatTurn: async () => turns.shift() ?? answered("Done.") };
  return new WorkspaceAssistant({
    files: store,
    review,
    digest: webCryptoDigest,
    isTrusted: () => true,
    answerChat: (request) => new ChatService(executor).answer(request),
    settings: { get: (setting) => setting.fallback } as Pick<HostSettings, "get">,
    workspaceName: "Acme",
  });
}

verifies("assistant.build.show-tool", () => {
  it("shows the item in the window of the answer that asked", async () => {
    const assistant = setup();
    const chat = await assistant.newChat("build");
    const show = vi.fn(async () => "shown" as const);
    await assistant.answer({ chatId: chat.id, message: "Show me r42", show });
    expect(show).toHaveBeenCalledWith(r42);
    const { messages } = await assistant.chat(chat.id);
    expect(messages.find((message) => message.role === "tool")?.content).toBe(
      "Showed run r42 in the main view, next to the chat.",
    );
  });

  it("says there is nowhere to show it when the answer brought no window", async () => {
    const assistant = setup();
    const chat = await assistant.newChat("build");
    await assistant.answer({ chatId: chat.id, message: "Show me r42" });
    const { messages } = await assistant.chat(chat.id);
    expect(messages.find((message) => message.role === "tool")?.content).toBe(
      "Error: there's nowhere to show items in this chat.",
    );
  });
});
