// @vitest-environment jsdom
import type { RunFailure } from "@halonicjs/app/run-failure";
import { KindedError } from "@halonicjs/std";
import { createToastStore, ToastStoreProvider } from "@halonicjs/studio-kit";
import { EngineNotAnswering, engineWords, type WorkspaceContext } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buttonNamed, chatOf, fakeHost, sendMessage, show, unmount } from "../test-support.tsx";
import { AssistantPanel } from "./assistant-panel.tsx";

afterEach(unmount);

const routine = chatOf("c1", [{ role: "user", content: "Add a routine" }], "Add a routine");
const key = `sk-ant-${"Ab3x".repeat(6)}`;

function panel(
  fake: ReturnType<typeof fakeHost>,
  runCommand = vi.fn(() => true),
  where: Partial<WorkspaceContext> = {},
) {
  const toasts = createToastStore();
  const services = { get: () => fake.host, find: () => fake.host };
  const context = {
    services,
    announcer: { announce: vi.fn() },
    runCommand,
    ...where,
  } as unknown as WorkspaceContext;
  const node = (
    <ToastStoreProvider store={toasts}>
      <AssistantPanel context={context} title="Assistant" onClose={() => {}} />
    </ToastStoreProvider>
  );
  return { node, toasts };
}

const box = (page: HTMLElement) => page.querySelector("textarea") as HTMLTextAreaElement;
const replies = (page: HTMLElement) =>
  [...page.querySelectorAll("[data-chat-message] p")].map((line) => line.textContent);

verifies("assistant.chat.engine-not-answering", () => {
  describe("the engine not answering", () => {
    it("says a chat can't load while the engine isn't answering yet (H11)", async () => {
      const fake = fakeHost([routine]);
      fake.failReads(new KindedError("unavailable", "fetch failed"));
      const page = await show(panel(fake).node);
      expect(page.textContent).toContain("Couldn't load this chat");
      expect(page.textContent).toContain("The engine isn't answering. It may still be starting.");
      expect(buttonNamed(page, "Try again")).toBeDefined();
    });

    it("keeps the chat under the line, Send waiting with it as its reason and the text kept (H12)", async () => {
      const fake = fakeHost([routine]);
      const page = await show(panel(fake).node);
      await fake.setEngineAnswering(false);
      const line = "The engine isn't answering. Showing what it said last.";
      expect(page.textContent).toContain(line);
      expect(replies(page)).toContain("Add a routine");
      await sendMessage(page, "Also add a test");
      expect(fake.requests).toEqual([]);
      expect(box(page).value).toBe("Also add a test");
      const reason = buttonNamed(page, "Send")?.getAttribute("aria-describedby") ?? "";
      expect(document.getElementById(reason)?.textContent).toContain(line);
      await fake.setEngineAnswering(true);
      expect(page.textContent).not.toContain(line);
      await act(async () => buttonNamed(page, "Send")?.click());
      expect(fake.requests[0]?.message).toBe("Also add a test");
    });

    it("keeps Try again in its place, waiting on the line, until the engine answers (D5)", async () => {
      const fake = fakeHost();
      const page = await show(panel(fake).node);
      await sendMessage(page, "Add a routine");
      await fake.finish(new EngineNotAnswering());
      await fake.setEngineAnswering(false);
      const tryAgain = buttonNamed(page, "Try again");
      const reason = tryAgain?.getAttribute("aria-describedby") ?? "";
      expect(document.getElementById(reason)?.textContent).toContain(
        "The engine isn't answering. Showing what it said last.",
      );
      await act(async () => tryAgain?.click());
      expect(fake.requests).toHaveLength(1);
      await fake.setEngineAnswering(true);
      await act(async () => buttonNamed(page, "Try again")?.click());
      expect(fake.requests[1]?.message).toBeUndefined();
    });

    it.each([
      ["served", "Halonic on the server isn't answering."],
      ["phone", "Halonic on your computer isn't answering."],
    ] as const)(
      "says in a %s Studio that the reply carries on there (H15)",
      async (where, line) => {
        const fake = fakeHost([routine]);
        const page = await show(panel(fake, undefined, { engineWords: engineWords[where] }).node);
        await fake.setEngineAnswering(false);
        expect(page.textContent).toContain(
          `${line} The reply carries on there, and shows here when it's back.`,
        );
      },
    );
  });
});

verifies("assistant.chat.failed", () => {
  it("offers Try again after a failure before any tool ran, which sends the chat again (H22, H23)", async () => {
    const fake = fakeHost();
    const page = await show(panel(fake).node);
    await sendMessage(page, "Add a routine");
    const failed = {
      reason: "failed" as const,
      error: new Error("Ollama didn't answer."),
      toolsRan: false,
    };
    await fake.finish({ messages: [], end: failed });
    expect(page.textContent).toContain("Couldn't reach the model: Ollama didn't answer.");
    await act(async () => buttonNamed(page, "Try again")?.click());
    expect(fake.requests[1]).toMatchObject({ chatId: "chat-1", message: undefined });
  });

  it("offers no Try again once a tool ran (H24)", async () => {
    const fake = fakeHost();
    const page = await show(panel(fake).node);
    await sendMessage(page, "Add a routine");
    const failed = { reason: "failed" as const, error: new Error("Overloaded."), toolsRan: true };
    await fake.finish({ messages: [], end: failed });
    expect(page.textContent).toContain(
      "Couldn't reach the model: Overloaded. Some tool calls already ran. Send a new message to continue.",
    );
    expect(buttonNamed(page, "Try again")).toBeUndefined();
  });

  const failedAt = (failure: RunFailure) => ({
    messages: [],
    end: { reason: "failed" as const, error: new Error("fetch failed"), toolsRan: false },
    failure,
  });

  it.each([
    [
      "a local model it couldn't reach",
      { provider: "Ollama", address: "localhost:11434", alias: "fast", local: true },
      "Halonic couldn't reach Ollama at localhost:11434 for the model alias fast. Ollama may not be running on this computer. Start Ollama, then try again.",
    ],
    [
      "a cloud model it couldn't reach (F7)",
      { provider: "Anthropic", address: "api.anthropic.com", alias: "smart", local: false },
      "Halonic couldn't reach Anthropic at api.anthropic.com for the model alias smart. This computer may be offline. Check your internet connection, then try again.",
    ],
  ] as const)(
    "says the provider's own sentence for %s, with Try again and Open Models ›",
    async (_, facts, line) => {
      const fake = fakeHost();
      const runCommand = vi.fn(() => true);
      const page = await show(panel(fake, runCommand).node);
      await sendMessage(page, "Add a routine");
      await fake.finish(failedAt({ reason: "model-unreachable", ...facts }));
      expect(page.textContent).toContain(line);
      expect(page.textContent).not.toContain("Couldn't reach the model");
      await act(async () => buttonNamed(page, "Open Models ›")?.click());
      expect(runCommand).toHaveBeenCalledWith("workspace.open-models");
      await act(async () => buttonNamed(page, "Try again")?.click());
      expect(fake.requests[1]).toMatchObject({ chatId: "chat-1", message: undefined });
    },
  );

  it("says a local model didn't fit in memory (F8), and keeps the tools line after it", async () => {
    const fake = fakeHost();
    const page = await show(panel(fake).node);
    await sendMessage(page, "Add a routine");
    const memory = { provider: "Ollama", model: "llama3.1:70b", alias: "big" };
    const failed = failedAt({ reason: "model-out-of-memory", ...memory });
    await fake.finish({ ...failed, end: { ...failed.end, toolsRan: true } });
    expect(page.textContent).toContain(
      "Ollama couldn't load llama3.1:70b: this computer doesn't have enough free memory for it. Close other programs, or pick a smaller model in Models. Some tool calls already ran. Send a new message to continue.",
    );
    expect(buttonNamed(page, "Try again")).toBeUndefined();
    expect(buttonNamed(page, "Open Models ›")).toBeDefined();
  });

  it("keeps its own words for a failure the provider has no sentence for", async () => {
    const fake = fakeHost();
    const page = await show(panel(fake).node);
    await sendMessage(page, "Add a routine");
    await fake.finish(failedAt({ reason: "error", message: "fetch failed" }));
    expect(page.textContent).toContain("Couldn't reach the model: fetch failed.");
    expect(buttonNamed(page, "Open Models ›")).toBeUndefined();
  });
});

verifies("assistant.chat.trust-check", () => {
  it("opens the trust check for a refused message and sends it once trusted (H16)", async () => {
    const fake = fakeHost();
    fake.untrusted("trusted");
    const page = await show(panel(fake).node);
    await sendMessage(page, "Add a routine");
    expect(fake.trustChecks()).toBe(1);
    expect(fake.requests.map((request) => request.message)).toEqual([
      "Add a routine",
      "Add a routine",
    ]);
    expect(box(page).value).toBe("");
  });

  it("after Not now keeps the message in the box, with the toast and its Review", async () => {
    const fake = fakeHost();
    fake.untrusted("declined");
    const { node, toasts } = panel(fake);
    const page = await show(node);
    await sendMessage(page, "Add a routine");
    expect(fake.requests).toHaveLength(1);
    expect(box(page).value).toBe("Add a routine");
    expect(replies(page)).toEqual([]);
    expect(page.querySelector("h3")?.textContent).toBe("What should we build?");
    const toast = toasts.list()[0];
    expect(toast?.title).toBe("Not started: Acme isn't trusted yet");
    await act(async () => toast?.action?.onClick());
    expect(fake.trustChecks()).toBe(2);
  });
});

verifies("assistant.chat.key-in-message", () => {
  it("holds a message that looks like it holds a key, with the key field and Send anyway (H29)", async () => {
    const fake = fakeHost();
    const runCommand = vi.fn(() => true);
    const page = await show(panel(fake, runCommand).node);
    await sendMessage(page, `My key is ${key}`);
    expect(fake.requests).toEqual([]);
    expect(box(page).value).toBe(`My key is ${key}`);
    expect(page.querySelector('[role="status"]')?.textContent).toContain(
      "This looks like an API key. Keys go in the key field, so they stay out of chats and files.",
    );
    await act(async () => buttonNamed(page, "Go to the key field ›")?.click());
    expect(runCommand).toHaveBeenCalledWith("workspace.open-models");
    await act(async () => buttonNamed(page, "Send anyway")?.click());
    expect(fake.requests[0]?.message).toBe(`My key is ${key}`);
    expect(box(page).value).toBe("");
  });

  it("sends a message that only names a key's start, and drops the line when the text changes", async () => {
    const fake = fakeHost();
    const page = await show(panel(fake).node);
    await sendMessage(page, `Use ${key}`);
    expect(page.textContent).toContain("This looks like an API key.");
    await sendMessage(page, "my key starts with sk-abc");
    expect(page.textContent).not.toContain("This looks like an API key.");
    expect(fake.requests[0]?.message).toBe("my key starts with sk-abc");
  });
});
