// @vitest-environment jsdom
import { KindedError } from "@halonicjs/std";
import { createToastStore, ToastStoreProvider } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import type { AgentChatRequest } from "../api.ts";
import { memoryAgentsHost } from "../memory-host.ts";
import { buttonNamed, show, unmount } from "../test-support.tsx";
import { Chat, said, scriptedHost, sendMessage, sorter } from "./try-it-test-support.tsx";
import { ASK_ENGINE_EVERY_MS } from "./use-try-it-chat.ts";

/** Text shaped like a key, so Send holds it and offers Send anyway. */
const key = `sk-${"a1B2".repeat(6)}`;

afterEach(() => {
  unmount();
  vi.clearAllMocks();
});

verifies("agents.chat.not-trusted", () => {
  /** A chat in a workspace this computer doesn't trust, with the gate a test answers. */
  async function untrusted(ask?: () => Promise<"trusted" | "declined">) {
    let trusted = false;
    const requests: AgentChatRequest[] = [];
    const host = memoryAgentsHost({
      hubs: [{ id: "acme", name: "Acme" }],
      agents: [sorter],
      answer: async (_ref, request) => {
        requests.push(request);
        return { messages: [], end: { reason: "answered" } };
      },
      trust: {
        mayStart: () => trusted,
        ask:
          ask &&
          (async () => {
            const answer = await ask();
            trusted = answer === "trusted";
            return answer;
          }),
        workspaceName: "Acme",
      },
    });
    const toasts = createToastStore();
    const page = await show(
      <ToastStoreProvider store={toasts}>
        <Chat host={host} announce={vi.fn()} />
      </ToastStoreProvider>,
    );
    const box = () => (page.querySelector("textarea") as HTMLTextAreaElement).value;
    return { page, requests, toasts, box };
  }

  it("sends nothing, keeps the message and says why when there is no gate", async () => {
    const { page, requests, toasts, box } = await untrusted();
    await sendMessage(page, "Sort this mail");
    expect(requests).toHaveLength(0);
    expect(box()).toBe("Sort this mail");
    expect(toasts.list()).toMatchObject([
      { tone: "warning", title: "Not started: Acme isn't trusted yet" },
    ]);
  });

  it("sends the message once the person trusts the workspace in the gate", async () => {
    const ask = vi.fn(async () => "trusted" as const);
    const { page, requests, toasts, box } = await untrusted(ask);
    await sendMessage(page, "Sort this mail");
    expect(ask).toHaveBeenCalledTimes(1);
    expect(requests.map((request) => request.messages.at(-1)?.content)).toEqual(["Sort this mail"]);
    expect(box()).toBe("");
    expect(toasts.list()).toHaveLength(0);
  });

  /** A chat whose engine refuses each answer as `denied`, as an untrusted workspace's engine does. */
  async function refusedByEngine(ask?: () => Promise<"trusted" | "declined">) {
    const { host, requests, finish } = scriptedHost();
    const withGate = Object.assign(host, {
      askTrust: ask,
      workspaceName: () => "Acme",
    });
    const toasts = createToastStore();
    const page = await show(
      <ToastStoreProvider store={toasts}>
        <Chat host={withGate} announce={vi.fn()} />
      </ToastStoreProvider>,
    );
    await sendMessage(page, "Sort this mail");
    await finish(new KindedError("denied", "This workspace isn't trusted."));
    const box = () => (page.querySelector("textarea") as HTMLTextAreaElement).value;
    return { page, requests, toasts, box };
  }

  it("puts the message back and says why when the engine refuses it, with no failure line", async () => {
    const { page, toasts, box } = await refusedByEngine();
    expect(box()).toBe("Sort this mail");
    expect(said(page)).toEqual([]);
    expect(page.querySelector(".text-danger")).toBeNull();
    expect(toasts.list()[0]?.title).toBe("Not started: Acme isn't trusted yet");
  });

  it("opens the gate when the engine refuses, and sends the message again once trusted", async () => {
    const ask = vi.fn(async () => "trusted" as const);
    const { page, requests, box } = await refusedByEngine(ask);
    expect(ask).toHaveBeenCalledTimes(1);
    expect(requests.map((request) => request.messages.at(-1)?.content)).toEqual([
      "Sort this mail",
      "Sort this mail",
    ]);
    expect(said(page)).toEqual(["Sort this mail"]);
    expect(box()).toBe("");
  });

  it("keeps the message and shows the toast after Not now", async () => {
    const { page, requests, toasts, box } = await untrusted(async () => "declined");
    await sendMessage(page, "Sort this mail");
    expect(requests).toHaveLength(0);
    expect(box()).toBe("Sort this mail");
    expect(toasts.list()[0]?.title).toBe("Not started: Acme isn't trusted yet");
  });

  it("holds Send anyway as it holds Send", async () => {
    const { page, requests, toasts, box } = await untrusted();
    await sendMessage(page, `My key is ${key}`);
    await act(async () => buttonNamed(page, "Send anyway")?.click());
    expect(requests).toHaveLength(0);
    expect(box()).toBe(`My key is ${key}`);
    expect(toasts.list()[0]?.title).toBe("Not started: Acme isn't trusted yet");
  });
});

verifies("agents.chat.engine-quiet", () => {
  const line = "The engine isn't answering. Showing what it said last.";

  /** A chat whose first answer failed because the engine stopped answering. */
  async function quietChat() {
    const { host, requests, finish } = scriptedHost();
    const page = await show(<Chat host={host} announce={vi.fn()} />);
    await sendMessage(page, "Sort this mail");
    await finish(new KindedError("unavailable", "The engine isn't answering."));
    return { host, requests, page };
  }

  it("keeps the transcript under the line, and Send waits with the line as its reason", async () => {
    const { requests, page } = await quietChat();
    expect(page.textContent).toContain(line);
    expect(said(page)).toEqual(["Sort this mail", "Stopped when Halonic's engine stopped."]);
    await sendMessage(page, "And this one?");
    expect(requests).toHaveLength(1);
    expect((page.querySelector("textarea") as HTMLTextAreaElement).value).toBe("And this one?");
    const send = buttonNamed(page, "Send") as HTMLButtonElement;
    const reason = document.getElementById(send.getAttribute("aria-describedby") ?? "");
    expect(reason?.textContent).toBe(line);
  });

  it("drops the line when the engine answers as the window comes to the front", async () => {
    const { requests, page } = await quietChat();
    await act(async () => window.dispatchEvent(new Event("focus")));
    expect(page.textContent).not.toContain(line);
    await sendMessage(page, "And this one?");
    expect(requests).toHaveLength(2);
  });

  it("sends nothing on Send anyway once the engine stops answering", async () => {
    const { host, requests, finish } = scriptedHost();
    const page = await show(<Chat host={host} announce={vi.fn()} />);
    await sendMessage(page, "Sort this mail");
    await finish(new Error("The model didn't answer."));
    // The held message stays while Try again finds the engine gone.
    await sendMessage(page, `My key is ${key}`);
    await act(async () => buttonNamed(page, "Try again")?.click());
    await finish(new KindedError("unavailable", "The engine isn't answering."));
    expect(page.textContent).toContain(line);
    const anyway = buttonNamed(page, "Send anyway");
    expect(anyway).toBeDefined();
    await act(async () => anyway?.click());
    expect(requests).toHaveLength(2);
  });

  it("asks every 5 seconds and keeps the line until the engine answers", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    try {
      const { host, page } = await quietChat();
      const list = vi
        .spyOn(host, "list")
        .mockRejectedValueOnce(new KindedError("unavailable", "The engine isn't answering."));
      await act(async () => vi.advanceTimersByTime(ASK_ENGINE_EVERY_MS));
      expect(list).toHaveBeenCalledTimes(1);
      expect(page.textContent).toContain(line);
      await act(async () => vi.advanceTimersByTime(ASK_ENGINE_EVERY_MS));
      expect(list).toHaveBeenCalledTimes(2);
      expect(page.textContent).not.toContain(line);
    } finally {
      vi.useRealTimers();
    }
  });
});
