// @vitest-environment jsdom
import type { SandboxStartCheck, SandboxStartResult } from "@halonicjs/app";
import { KindedError } from "@halonicjs/std";
import { createToastStore, ToastStoreProvider } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import type { AgentHarnessId } from "../api.ts";
import type { HarnessStrip } from "../configuration/harness-strip.ts";
import { buttonNamed, show, typeIntoArea, unmount } from "../test-support.tsx";
import { Chat, said, scriptedHost, sendMessage } from "./try-it-test-support.tsx";

const ways = { goToKeyField: vi.fn(), openHarness: vi.fn(), setTheKey: vi.fn() };

afterEach(() => {
  unmount();
  vi.clearAllMocks();
});

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

  it("stops the reply when the page closes, and announces nothing", async () => {
    const { host, requests, finish } = scriptedHost();
    const announce = vi.fn();
    const page = await show(<Chat host={host} announce={announce} />);
    await sendMessage(page, "Sort this mail");
    unmount();
    expect(requests[0]?.signal?.aborted).toBe(true);
    await finish({ messages: [], end: { reason: "stopped", toolsRan: false } });
    expect(announce).not.toHaveBeenCalled();
  });
});

verifies("agents.chat.try-it", () => {
  it("announces a failure after a tool with its whole line", async () => {
    const { host, requests, finish } = scriptedHost();
    const announce = vi.fn();
    const page = await show(<Chat host={host} announce={announce} />);
    await sendMessage(page, "Sort this mail");
    await act(async () =>
      requests[0]?.listener?.onToolCall?.({ id: "c1", name: "send_reply", arguments: {} }),
    );
    await finish({
      messages: [],
      end: { reason: "failed", error: new Error("Anthropic was busy"), toolsRan: true },
    });
    expect(announce).toHaveBeenCalledExactlyOnceWith(
      "Sorter's reply failed: Anthropic was busy. Some tool calls already ran. Send a new message to continue.",
      "assertive",
    );
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

  it("offers Try again when the engine stopped before any tool, once it answers again", async () => {
    const { host, finish } = scriptedHost();
    const page = await show(<Chat host={host} announce={vi.fn()} />);
    await sendMessage(page, "Sort this mail");
    await finish(new KindedError("unavailable", "The engine isn't answering."));
    expect(page.querySelector(".text-danger")?.textContent).toBe(
      "Stopped when Halonic's engine stopped.",
    );
    expect(buttonNamed(page, "Try again")).toBeUndefined();
    await act(async () => window.dispatchEvent(new Event("focus")));
    expect(buttonNamed(page, "Try again")).toBeDefined();
  });

  it("offers Open Models › before Try again when the model's key was the cause, and only then", async () => {
    const { host, finish } = scriptedHost();
    const goToKeyField = vi.fn();
    const ways = { goToKeyField, openHarness: () => {}, setTheKey: () => {} };
    const page = await show(<Chat host={host} announce={vi.fn()} ways={ways} />);
    await sendMessage(page, "Sort this mail");
    await finish({
      messages: [],
      end: { reason: "failed", error: new Error("busy"), toolsRan: false },
    });
    expect(buttonNamed(page, "Open Models")).toBeUndefined();
    await sendMessage(page, "Sort it again");
    const noKey = new Error("Anthropic has no key");
    await finish({
      messages: [],
      end: { reason: "failed", error: noKey, toolsRan: false, cause: { reason: "key-refused" } },
    });
    const line = page.querySelectorAll(".text-danger")[1]?.parentElement;
    expect(
      [...(line?.querySelectorAll("button") ?? [])].map((button) => button.textContent),
    ).toEqual(["Open Models ›", "Try again"]);
    await act(async () => buttonNamed(page, "Open Models")?.click());
    expect(goToKeyField).toHaveBeenCalledOnce();
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
  // Invented, shaped like the real thing: a prefix and random-looking characters.
  const key = `sk-${"a1B2".repeat(6)}`;
  const googleSecret = `GOCSPX-${"aB3".repeat(8)}`;

  it("holds a message that looks like it has a key, with the way to the key field", async () => {
    const { host, requests } = scriptedHost();
    const page = await show(<Chat host={host} announce={vi.fn()} ways={ways} />);
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

  it("holds a Google client secret with its own line and no way to the key field", async () => {
    const { host, requests } = scriptedHost();
    const page = await show(<Chat host={host} announce={vi.fn()} ways={ways} />);
    await sendMessage(page, `The secret is ${googleSecret}`);
    expect(requests).toHaveLength(0);
    const status = page.querySelector("[role=status]") as HTMLElement;
    expect(status.textContent).toContain(
      "This looks like a Google client secret. It goes in the Google setup or in a connector in the Library, so it stays out of chats and files.",
    );
    expect(status.textContent).not.toContain("aB3");
    expect(buttonNamed(page, "Go to the key field")).toBeUndefined();
    await act(async () => buttonNamed(page, "Send anyway")?.click());
    expect(requests).toHaveLength(1);
  });

  it("sends the held message once, as it is, on Send anyway", async () => {
    const { host, requests } = scriptedHost();
    const page = await show(<Chat host={host} announce={vi.fn()} />);
    await sendMessage(page, `My key is ${key}`);
    await act(async () => buttonNamed(page, "Send anyway")?.click());
    expect(requests).toHaveLength(1);
    expect(requests[0]?.messages).toEqual([{ role: "user", content: `My key is ${key}` }]);
    expect(page.querySelector("[role=status]")?.textContent).toBe("");
    expect(document.activeElement).toBe(page.querySelector("textarea"));
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
    ["signed-out", "Sorter can't run until it's signed in to Claude Code."],
  ] as const)(
    "makes Send wait when the harness is %s, with the line as its reason",
    async (strip, line) => {
      const { host, requests } = scriptedHost();
      const page = await show(
        <Chat host={host} announce={vi.fn()} harnessStrip={strip} ways={ways} />,
      );
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
verifies("agents.chat.sandbox", () => {
  /** A check that answers each call with the next of `answers`; the last one repeats. */
  function checkSaying(...answers: SandboxStartResult[]) {
    return {
      check: vi.fn(
        async () => (answers.length > 1 ? answers.shift() : answers[0]) as SandboxStartResult,
      ),
    };
  }
  const refused: SandboxStartResult = { ok: false, reason: "bubblewrap-missing" };

  async function chatWith(
    check: SandboxStartCheck,
    options: { harness?: AgentHarnessId; harnessStrip?: HarnessStrip } = {},
  ) {
    const { host, requests } = scriptedHost();
    const announce = vi.fn();
    const page = await show(
      <ToastStoreProvider store={createToastStore()}>
        <Chat host={host} announce={announce} sandboxStartCheck={check} {...options} />
      </ToastStoreProvider>,
    );
    await act(async () => undefined);
    return { page, requests, announce };
  }

  it("shows the Callout under the box and makes Send wait with its first line as the reason", async () => {
    const { page, requests } = await chatWith(checkSaying(refused));
    const firstLine = "Sorter can't run: the sandbox can't start on this computer.";
    expect(page.textContent).toContain(firstLine);
    const send = buttonNamed(page, "Send") as HTMLButtonElement;
    expect(send.getAttribute("aria-disabled")).toBe("true");
    const reason = page.querySelector(`[id="${send.getAttribute("aria-describedby")}"]`);
    expect(reason?.textContent).toBe(firstLine);
    await sendMessage(page, "Sort this mail");
    const box = page.querySelector("textarea") as HTMLTextAreaElement;
    await act(async () => {
      box.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    expect(requests).toHaveLength(0);
    expect(box.value).toBe("Sort this mail");
  });

  it("reads only the Callout's first line, once, and keeps its buttons out of the live region", async () => {
    const { page, announce } = await chatWith(checkSaying(refused));
    const live = page.querySelectorAll("[role=status], [aria-live]");
    for (const region of live) {
      expect(region.querySelector("button, a")).toBeNull();
      expect(region.textContent).not.toContain("Check again");
    }
    expect(announce.mock.calls).toEqual([
      ["Sorter can't run: the sandbox can't start on this computer."],
    ]);
  });

  it("lets the message go and puts focus in the box once Check again finds the sandbox ready", async () => {
    const { page, requests, announce } = await chatWith(checkSaying(refused, { ok: true }));
    await act(async () => buttonNamed(page, "Check again")?.click());
    expect(page.textContent).not.toContain("can't run");
    expect(document.activeElement).toBe(page.querySelector("textarea"));
    expect(announce).toHaveBeenCalledWith("The sandbox works now. You can run Sorter.");
    await sendMessage(page, "Sort this mail");
    expect(requests).toHaveLength(1);
  });

  it("makes Send wait, saying the agent host is still starting, until the check answers", async () => {
    let answer: (result: SandboxStartResult) => void = () => {};
    const check = vi.fn(() => new Promise<SandboxStartResult>((resolve) => (answer = resolve)));
    const { page, announce } = await chatWith({ check });
    const send = buttonNamed(page, "Send") as HTMLButtonElement;
    expect(send.getAttribute("aria-disabled")).toBe("true");
    const reason = page.querySelector(`[id="${send.getAttribute("aria-describedby")}"]`);
    expect(reason?.textContent).toBe("Starting the agent host…");
    expect(announce).not.toHaveBeenCalled();
    await act(async () => answer({ ok: true }));
    expect(page.textContent).not.toContain("Starting the agent host…");
    expect(buttonNamed(page, "Send")?.hasAttribute("aria-disabled")).toBe(false);
  });

  it("doesn't check the sandbox for an agent on Halonic's own loop", async () => {
    const check = checkSaying(refused);
    const { page } = await chatWith(check, { harness: "halonic" });
    expect(check.check).not.toHaveBeenCalled();
    expect(page.textContent).not.toContain("can't run");
  });

  it("puts a harness that isn't installed before the sandbox", async () => {
    const { page } = await chatWith(checkSaying(refused), { harnessStrip: "not-installed" });
    expect(page.textContent).toContain("Sorter can't run until Claude Code is installed.");
    expect(page.textContent).not.toContain("the sandbox can't start");
  });
});
