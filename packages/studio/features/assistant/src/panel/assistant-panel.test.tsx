// @vitest-environment jsdom
import { KindedError } from "@halonicjs/std";
import type { WorkspaceContext } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buttonNamed, chatOf, fakeHost, sendMessage, show, unmount } from "../test-support.tsx";
import { AssistantPanel } from "./assistant-panel.tsx";

afterEach(() => {
  unmount();
  vi.useRealTimers();
});

const routine = chatOf("c1", [{ role: "user", content: "Add a routine" }], "Add a routine");

function panel(
  fake: ReturnType<typeof fakeHost>,
  announce = vi.fn(),
  shownTitle?: WorkspaceContext["shownTitle"],
) {
  const services = { get: () => fake.host, find: () => fake.host };
  const context = { services, announcer: { announce }, shownTitle } as unknown as WorkspaceContext;
  return <AssistantPanel context={context} title="Assistant" onClose={() => {}} />;
}

const said = (page: HTMLElement) =>
  [...page.querySelectorAll("[data-chat-message] p")].map((line) => line.textContent);
const status = (page: HTMLElement) => page.querySelector("p.text-caption")?.textContent;

verifies("assistant.chat.panel-shortcut", () => {
  it("opens on the most recently used chat, named Assistant, with focus in the box", async () => {
    const page = await show(panel(fakeHost([routine])));
    expect(page.querySelector("aside")?.getAttribute("aria-label")).toBe("Assistant");
    expect(page.querySelector("h2")?.textContent).toBe("Add a routine");
    expect(said(page)).toEqual(["Add a routine"]);
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Message the assistant");
  });

  it("opens on a new Build chat when there is none, and New chat gives the box focus", async () => {
    const page = await show(panel(fakeHost()));
    expect(page.querySelector("h2")?.textContent).toBe("Assistant");
    (page.querySelector("h2") as HTMLElement).focus();
    await act(async () => buttonNamed(page, "New chat")?.click());
    expect(document.activeElement?.tagName).toBe("TEXTAREA");
  });
});

verifies("assistant.chat.first-load", () => {
  it("shows an empty chat's heading and line at the top", async () => {
    const page = await show(panel(fakeHost()));
    expect(page.querySelector("h3")?.textContent).toBe("What should we build?");
    expect(page.textContent).toContain(
      "I make changes in your files and mark them; you accept or reject each one.",
    );
  });

  it("shows skeleton lines after 300 ms while the chat is read, then the chat", async () => {
    vi.useFakeTimers();
    const fake = fakeHost([routine]);
    let release = () => {};
    const read = fake.host.chat;
    fake.host.chat = (id) =>
      new Promise((resolve) => (release = () => void read(id).then(resolve)));
    const page = await show(panel(fake));
    expect(page.querySelector('[aria-busy="true"]')?.children.length).toBe(0);
    await act(async () => vi.advanceTimersByTime(300));
    expect(page.querySelector('[role="status"]')?.textContent).toBe("Loading this chat");
    // The lines fill the transcript's place, so the box sits at the bottom before the chat comes.
    const lines = page.querySelector('[aria-busy="true"]')?.parentElement;
    expect(lines?.parentElement?.className).toContain("flex-1");
    await act(async () => release());
    expect(said(page)).toEqual(["Add a routine"]);
  });

  it("shows a chat it showed before at once, without reading it again", async () => {
    const fake = fakeHost([routine]);
    await show(panel(fake));
    unmount();
    const page = await show(panel(fake));
    expect(fake.reads()).toBe(1);
    expect(said(page)).toEqual(["Add a routine"]);
  });

  it("says a chat couldn't load, with Try again", async () => {
    const fake = fakeHost([routine]);
    fake.failReads(new KindedError("unavailable", "The engine isn't answering."));
    const page = await show(panel(fake));
    expect(page.textContent).toContain("Couldn't load this chat");
    expect(page.textContent).toContain("The engine isn't answering.");
    fake.failReads(undefined);
    await act(async () => buttonNamed(page, "Try again")?.click());
    expect(said(page)).toEqual(["Add a routine"]);
  });

  it("shows No chat open with New chat when the chat is gone", async () => {
    const fake = fakeHost([routine]);
    fake.failReads(new KindedError("not_found", "No chat c1"));
    const page = await show(panel(fake));
    expect(page.textContent).toContain("No chat open");
    // At the top, left-aligned, as the failed chat and the empty chat: the panel doesn't centre.
    const title = [...page.querySelectorAll("p")].find(
      (line) => line.textContent === "No chat open",
    );
    expect(title?.parentElement?.className).toContain("items-start");
    expect(title?.closest(".place-items-center")).toBeNull();
    fake.failReads(undefined);
    await act(async () => buttonNamed(page, "New chat")?.click());
    expect(page.querySelector("h3")?.textContent).toBe("What should we build?");
  });
});

verifies("assistant.chat.enter-sends", () => {
  it("sends, builds the reply step by step with the status line, and announces the end once", async () => {
    const fake = fakeHost();
    const announce = vi.fn();
    const page = await show(panel(fake, announce));
    await sendMessage(page, "Add a routine");
    expect((page.querySelector("textarea") as HTMLTextAreaElement).value).toBe("");
    expect(fake.requests[0]?.message).toBe("Add a routine");
    expect(status(page)).toBe("Running · thinking");
    const call = {
      id: "t1",
      name: "read_file",
      arguments: { path: "hubs/acme/workflows/triage.workflow.yaml" },
    };
    const listener = fake.requests[0]?.listener;
    await act(async () => {
      listener?.onMessage?.({ role: "assistant", content: "Let me look.", toolCalls: [call] });
      listener?.onToolCall?.(call);
    });
    expect(status(page)).toBe("Running · reading triage.workflow.yaml");
    expect(page.textContent).toContain("Using read file…");
    expect(announce).not.toHaveBeenCalled();
    fake.leaveToReview(2);
    const result = {
      role: "tool" as const,
      content: "kind: workflow",
      toolCallId: "t1",
      name: "read_file",
    };
    const added = [
      { role: "assistant" as const, content: "Let me look.", toolCalls: [call] },
      result,
    ];
    await fake.finish({
      messages: [...added, { role: "assistant", content: "Done." }],
      end: { reason: "answered" },
    });
    expect(said(page)).toEqual(["Add a routine", "Let me look.", "Used read file", "Done."]);
    expect(page.querySelector("h2")?.textContent).toBe("Add a routine");
    expect(announce).toHaveBeenCalledExactlyOnceWith(
      "Answer finished. 2 items to review.",
      "polite",
    );
  });

  it("sends nothing for a box with only spaces", async () => {
    const fake = fakeHost();
    const page = await show(panel(fake));
    await sendMessage(page, "   ");
    expect(fake.requests).toEqual([]);
  });
});

verifies("assistant.chat.stop", () => {
  it("Stop takes Send's place, stops the answer and ends it with Stopped by you.", async () => {
    const fake = fakeHost();
    const announce = vi.fn();
    const page = await show(panel(fake, announce));
    await sendMessage(page, "Add a routine");
    await sendMessage(page, "Also add a test");
    expect(fake.requests).toHaveLength(1);
    await act(async () => buttonNamed(page, "Stop")?.click());
    expect(fake.requests[0]?.signal?.aborted).toBe(true);
    await fake.finish({ messages: [], end: { reason: "stopped", toolsRan: false } });
    expect(page.textContent).toContain("Stopped by you.");
    expect(status(page)).toBe("Stopped by you");
    expect(buttonNamed(page, "Send")).toBeDefined();
    expect(announce).toHaveBeenCalledWith("Stopped by you.", "polite");
  });

  it("ends a chat that was answering as Halonic closed with its line", async () => {
    const page = await show(panel(fakeHost([{ ...routine, stoppedWhenClosed: true }])));
    expect(page.textContent).toContain("Stopped when Halonic closed.");
  });
});

/** A window's page name that the test changes, as a tab switch does. */
function shownTitleOf(first: string) {
  let title = first;
  const listeners = new Set<() => void>();
  const source = {
    get: () => title,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  const show = (next: string) => {
    title = next;
    act(() => {
      for (const listener of listeners) listener();
    });
  };
  return { source, show };
}

verifies("assistant.chat.looking-at", () => {
  it("says which page the window shows while it waits, following the active tab", async () => {
    const shownTitle = shownTitleOf("Support triage");
    const page = await show(panel(fakeHost([routine]), vi.fn(), shownTitle.source));
    expect(status(page)).toBe("Looking at: Support triage");
    shownTitle.show("Changes");
    expect(status(page)).toBe("Looking at: Changes");
  });

  it("gives way to Running while it answers, and comes back when the answer ends", async () => {
    const fake = fakeHost();
    const page = await show(panel(fake, vi.fn(), shownTitleOf("Home").source));
    await sendMessage(page, "Add a routine");
    expect(status(page)).toBe("Running · thinking");
    await fake.finish({ messages: [], end: { reason: "answered" } });
    expect(status(page)).toBe("Looking at: Home");
  });

  it("says nothing of a page in a window without tabs", async () => {
    const page = await show(panel(fakeHost([routine])));
    expect(status(page)).toBe("");
  });
});

verifies("assistant.build.step-limit", () => {
  it("ends at the limit with Continue, which continues the answer without a message", async () => {
    const fake = fakeHost();
    const announce = vi.fn();
    const page = await show(panel(fake, announce));
    await sendMessage(page, "Add a routine");
    await fake.finish({ messages: [], end: { reason: "turn-limit", turns: 16 } });
    const line = "Stopped after 16 model calls. Ask it to continue.";
    expect(page.textContent).toContain(line);
    expect(announce).toHaveBeenCalledWith(line, "polite");
    await act(async () => buttonNamed(page, "Continue")?.click());
    expect(fake.requests[1]?.message).toBeUndefined();
    expect(page.textContent).not.toContain(line);
  });
});

describe("a failed answer", () => {
  it("says a failure assertively, and that tools already ran", async () => {
    const fake = fakeHost();
    const announce = vi.fn();
    const page = await show(panel(fake, announce));
    await sendMessage(page, "Add a routine");
    await fake.finish({
      messages: [],
      end: { reason: "failed", error: new Error("Anthropic was busy."), toolsRan: true },
    });
    const line =
      "Couldn't reach the model: Anthropic was busy. Some tool calls already ran. Send a new message to continue.";
    expect(page.textContent).toContain(line);
    expect(announce).toHaveBeenCalledWith(line, "assertive");
  });
});
