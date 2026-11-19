// @vitest-environment jsdom
import type { ChatAnswer } from "@halonicjs/app";
import { KindedError } from "@halonicjs/std";
import { createToastStore, ToastStoreProvider } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import type { AgentChatRequest } from "../api.ts";
import type { HarnessStrip } from "../configuration/harness-strip.ts";
import { memoryAgentsHost } from "../memory-host.ts";
import { buttonNamed, show, typeIntoArea, unmount } from "../test-support.tsx";
import { TryItChatView } from "./try-it-chat.tsx";
import { useTryItChat } from "./use-try-it-chat.ts";

afterEach(() => {
  unmount();
  vi.clearAllMocks();
});

const sorter = {
  hubId: "acme",
  id: "sorter",
  name: "Sorter",
  description: "Sorts incoming mail by topic",
};

/** A host whose answers the test gives one by one, and what each request held. */
function scriptedHost() {
  const requests: AgentChatRequest[] = [];
  const pending: ((answer: ChatAnswer | Error) => void)[] = [];
  const host = memoryAgentsHost({
    hubs: [{ id: "acme", name: "Acme" }],
    agents: [sorter],
    answer: (_ref, request) => {
      // A copy, since the chat's conversation grows after the request.
      requests.push({ ...request, messages: [...request.messages] });
      return new Promise((resolve, reject) => {
        pending.push((answer) => (answer instanceof Error ? reject(answer) : resolve(answer)));
      });
    },
  });
  /** Ends the oldest answer still being written. */
  const finish = async (answer: ChatAnswer | Error) => {
    await act(async () => pending.shift()?.(answer));
  };
  return { host, requests, finish };
}

const ways = { goToKeyField: vi.fn(), openHarness: vi.fn() };

function Chat({
  host,
  announce,
  harnessStrip = null,
}: {
  readonly host: ReturnType<typeof memoryAgentsHost>;
  readonly announce: (text: string, politeness?: "polite" | "assertive") => void;
  readonly harnessStrip?: HarnessStrip | null;
}) {
  const chat = useTryItChat({ host, agent: sorter, name: "Sorter", announce });
  return (
    <TryItChatView
      chat={chat}
      name="Sorter"
      description={sorter.description}
      harness="claude-code"
      harnessStrip={harnessStrip}
      ways={ways}
    />
  );
}

async function sendMessage(page: HTMLElement, text: string) {
  await typeIntoArea(page.querySelector("textarea") as HTMLTextAreaElement, text);
  await act(async () => buttonNamed(page, "Send")?.click());
}

const said = (page: HTMLElement) =>
  [...page.querySelectorAll("[data-chat-message] p")].map((line) => line.textContent);

verifies("agents.chat.try-it", () => {
  it("shows the empty draft: the heading, the description and the box", async () => {
    const { host } = scriptedHost();
    const page = await show(<Chat host={host} announce={vi.fn()} />);
    expect(page.querySelector("h2")?.textContent).toBe("Chat with Sorter");
    expect(page.textContent).toContain("Sorts incoming mail by topic");
    const box = page.querySelector("textarea") as HTMLTextAreaElement;
    expect(box.getAttribute("aria-label")).toBe("Message Sorter");
    expect(box.placeholder).toBe("Message Sorter…");
  });

  it("sends the message, builds the reply step by step and announces it once", async () => {
    const { host, requests, finish } = scriptedHost();
    const announce = vi.fn();
    const page = await show(<Chat host={host} announce={announce} />);
    await sendMessage(page, "Sort this mail");
    expect((page.querySelector("textarea") as HTMLTextAreaElement).value).toBe("");
    expect(requests[0]?.messages).toEqual([{ role: "user", content: "Sort this mail" }]);
    const listener = requests[0]?.listener;
    const call = { id: "c1", name: "acme-mail__read_mail", arguments: {} };
    await act(async () => listener?.onToolCall?.(call));
    expect(said(page)).toEqual(["Sort this mail", "Using read mail…"]);
    await act(async () => {
      listener?.onMessage?.({ role: "assistant", content: "", toolCalls: [call] });
      listener?.onMessage?.({
        role: "tool",
        content: "One mail",
        toolCallId: "c1",
        name: call.name,
      });
      listener?.onMessage?.({ role: "assistant", content: "It's about a refund." });
    });
    expect(announce).not.toHaveBeenCalled();
    await finish({ messages: [], end: { reason: "answered" } });
    expect(said(page)).toEqual(["Sort this mail", "Used read mail", "It's about a refund."]);
    expect(page.querySelector("h3.sr-only")?.textContent).toBe("Sorter said");
    expect(announce).toHaveBeenCalledExactlyOnceWith("Sorter replied.");
    expect(page.textContent).not.toMatch(/Run #|See the run/);
  });

  it("sends the whole conversation with the next message", async () => {
    const { host, requests, finish } = scriptedHost();
    const page = await show(<Chat host={host} announce={vi.fn()} />);
    await sendMessage(page, "Sort this mail");
    await act(async () =>
      requests[0]?.listener?.onMessage?.({ role: "assistant", content: "Refunds." }),
    );
    await finish({ messages: [], end: { reason: "answered" } });
    await sendMessage(page, "And this one?");
    expect(requests[1]?.messages).toEqual([
      { role: "user", content: "Sort this mail" },
      { role: "assistant", content: "Refunds." },
      { role: "user", content: "And this one?" },
    ]);
  });

  it("puts Stop in Send's place, and Stop ends the reply with Stopped by you.", async () => {
    const { host, requests, finish } = scriptedHost();
    const announce = vi.fn();
    const page = await show(<Chat host={host} announce={announce} />);
    await sendMessage(page, "Sort this mail");
    const stop = buttonNamed(page, "Stop") as HTMLButtonElement;
    await act(async () => stop.click());
    expect(requests[0]?.signal?.aborted).toBe(true);
    await finish({ messages: [], end: { reason: "stopped", toolsRan: false } });
    expect(page.textContent).toContain("Stopped by you.");
    expect(buttonNamed(page, "Send")).toBe(stop);
    expect(buttonNamed(page, "Try again")).toBeUndefined();
    expect(announce).toHaveBeenCalledExactlyOnceWith("Stopped by you.");
  });
});

verifies("agents.chat.reply-ends", () => {
  it("ends a failure before any tool with its reason and Try again, announced assertively", async () => {
    const { host, finish } = scriptedHost();
    const announce = vi.fn();
    const page = await show(<Chat host={host} announce={announce} />);
    await sendMessage(page, "Sort this mail");
    await finish({
      messages: [],
      end: { reason: "failed", error: new Error("Anthropic was busy"), toolsRan: false },
    });
    expect(page.querySelector(".text-danger")?.textContent).toBe(
      "Sorter's reply failed: Anthropic was busy.",
    );
    expect(buttonNamed(page, "Try again")).toBeDefined();
    expect(announce).toHaveBeenCalledExactlyOnceWith(
      "Sorter's reply failed: Anthropic was busy.",
      "assertive",
    );
  });

  it("sends the same message again on Try again, with the conversation before it, and focuses the box", async () => {
    const { host, requests, finish } = scriptedHost();
    const page = await show(<Chat host={host} announce={vi.fn()} />);
    await sendMessage(page, "Sort this mail");
    await finish({
      messages: [],
      end: { reason: "failed", error: new Error("Anthropic was busy"), toolsRan: false },
    });
    await act(async () => buttonNamed(page, "Try again")?.click());
    expect(requests).toHaveLength(2);
    expect(requests[1]?.messages).toEqual([{ role: "user", content: "Sort this mail" }]);
    expect(said(page)).toEqual(["Sort this mail"]);
    expect(document.activeElement).toBe(page.querySelector("textarea"));
  });

  it("offers no Try again when the engine stopped after a tool was called", async () => {
    const { host, requests, finish } = scriptedHost();
    const page = await show(<Chat host={host} announce={vi.fn()} />);
    await sendMessage(page, "Sort this mail");
    await act(async () =>
      requests[0]?.listener?.onToolCall?.({ id: "c1", name: "send_reply", arguments: {} }),
    );
    await finish(new KindedError("unavailable", "The engine isn't answering."));
    expect(page.querySelector(".text-danger")?.textContent).toBe(
      "Stopped when Halonic's engine stopped. Some tool calls already ran. Send a new message to continue.",
    );
    expect(buttonNamed(page, "Try again")).toBeUndefined();
  });

  it("offers Try again when the engine stopped before any tool", async () => {
    const { host, finish } = scriptedHost();
    const page = await show(<Chat host={host} announce={vi.fn()} />);
    await sendMessage(page, "Sort this mail");
    await finish(new KindedError("unavailable", "The engine isn't answering."));
    expect(page.querySelector(".text-danger")?.textContent).toBe(
      "Stopped when Halonic's engine stopped.",
    );
    expect(buttonNamed(page, "Try again")).toBeDefined();
  });

  it("offers Try again only on the last reply, and none after an answer", async () => {
    const { host, finish } = scriptedHost();
    const page = await show(<Chat host={host} announce={vi.fn()} />);
    await sendMessage(page, "Sort this mail");
    await finish({
      messages: [],
      end: { reason: "failed", error: new Error("busy"), toolsRan: false },
    });
    await sendMessage(page, "Try once more");
    await finish({ messages: [], end: { reason: "answered" } });
    expect(buttonNamed(page, "Try again")).toBeUndefined();
    expect(page.querySelectorAll(".text-danger")).toHaveLength(1);
  });
});

verifies("agents.chat.box-lines", () => {
  const key = `sk-${"a1B2".repeat(6)}`;

  it("holds a message that looks like it has a key, with the way to the key field", async () => {
    const { host, requests } = scriptedHost();
    const page = await show(<Chat host={host} announce={vi.fn()} />);
    await sendMessage(page, `My key is ${key}`);
    expect(requests).toHaveLength(0);
    expect((page.querySelector("textarea") as HTMLTextAreaElement).value).toBe(`My key is ${key}`);
    const status = page.querySelector("[role=status]") as HTMLElement;
    expect(status.textContent).toContain(
      "This looks like an API key. Keys go in the key field, so they stay out of chats and files.",
    );
    await act(async () => buttonNamed(page, "Go to the key field")?.click());
    expect(ways.goToKeyField).toHaveBeenCalledTimes(1);
  });

  it("sends the held message once, as it is, on Send anyway", async () => {
    const { host, requests } = scriptedHost();
    const page = await show(<Chat host={host} announce={vi.fn()} />);
    await sendMessage(page, `My key is ${key}`);
    await act(async () => buttonNamed(page, "Send anyway")?.click());
    expect(requests).toHaveLength(1);
    expect(requests[0]?.messages).toEqual([{ role: "user", content: `My key is ${key}` }]);
    expect(page.querySelector("[role=status]")?.textContent).toBe("");
  });

  it("sends a message that only mentions a key prefix as usual", async () => {
    const { host, requests } = scriptedHost();
    const page = await show(<Chat host={host} announce={vi.fn()} />);
    await sendMessage(page, "my key starts with sk-abc");
    expect(requests).toHaveLength(1);
  });

  it("drops the held line when the text changes", async () => {
    const { host } = scriptedHost();
    const page = await show(<Chat host={host} announce={vi.fn()} />);
    await sendMessage(page, `My key is ${key}`);
    await typeIntoArea(page.querySelector("textarea") as HTMLTextAreaElement, "Sort this mail");
    expect(page.querySelector("[role=status]")?.textContent).toBe("");
  });

  it.each([
    ["not-installed", "Sorter can't run until Claude Code is installed."],
    ["too-old", "Sorter can't run until Claude Code is updated."],
  ] as const)(
    "makes Send wait when the harness is %s, with the line as its reason",
    async (strip, line) => {
      const { host, requests } = scriptedHost();
      const page = await show(<Chat host={host} announce={vi.fn()} harnessStrip={strip} />);
      const status = page.querySelector("[role=status]") as HTMLElement;
      expect(status.textContent).toContain(line);
      await sendMessage(page, "Sort this mail");
      expect(requests).toHaveLength(0);
      const send = buttonNamed(page, "Send") as HTMLButtonElement;
      const reason = document.getElementById(send.getAttribute("aria-describedby") ?? "");
      expect(reason?.textContent).toContain(line);
      await act(async () => buttonNamed(page, "Open Harness settings")?.click());
      expect(ways.openHarness).toHaveBeenCalledTimes(1);
    },
  );
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

  it("keeps the message and shows the toast after Not now", async () => {
    const { page, requests, toasts, box } = await untrusted(async () => "declined");
    await sendMessage(page, "Sort this mail");
    expect(requests).toHaveLength(0);
    expect(box()).toBe("Sort this mail");
    expect(toasts.list()[0]?.title).toBe("Not started: Acme isn't trusted yet");
  });
});
