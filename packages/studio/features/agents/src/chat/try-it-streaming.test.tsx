// @vitest-environment jsdom
import type { ChatAnswerListener } from "@halonicjs/app";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { buttonNamed, show, unmount } from "../test-support.tsx";
import {
  emptyTranscript,
  endTurn,
  shownSteps,
  startTurn,
  withMessage,
  withText,
} from "./transcript.ts";
import { Chat, said, scriptedHost, sendMessage } from "./try-it-test-support.tsx";

afterEach(() => {
  unmount();
  vi.restoreAllMocks();
});

/** Lets the frame the chat waits for pass. */
const nextFrame = () => act(() => new Promise<void>((done) => requestAnimationFrame(() => done())));

/** Writes `pieces` as the model would, then lets the frame pass. */
async function write(listener: ChatAnswerListener | undefined, ...pieces: string[]) {
  await act(async () => {
    for (const text of pieces) listener?.onText?.({ kind: "delta", text });
  });
  await nextFrame();
}

const reply = (page: HTMLElement) => page.querySelector("[data-chat-message=reply]") as HTMLElement;

verifies("agents.chat.streaming", () => {
  it("shows the text as it is written, once a frame, and the message replaces it", async () => {
    const { host, requests, finish } = scriptedHost();
    const announce = vi.fn();
    const page = await show(<Chat host={host} announce={announce} />);
    await sendMessage(page, "Sort this mail");
    const listener = requests[0]?.listener;
    const frame = vi.spyOn(window, "requestAnimationFrame");
    await act(async () => {
      for (const text of ["It's ", "about ", "a refund"])
        listener?.onText?.({ kind: "delta", text });
    });
    expect(said(page)).toEqual(["Sort this mail"]);
    expect(frame).toHaveBeenCalledOnce();
    await nextFrame();
    expect(said(page)).toEqual(["Sort this mail", "It's about a refund"]);
    expect(reply(page).getAttribute("aria-busy")).toBe("true");
    expect(announce).not.toHaveBeenCalled();
    await act(async () =>
      listener?.onMessage?.({ role: "assistant", content: "It's about a refund." }),
    );
    await finish({ messages: [], end: { reason: "answered" } });
    expect(said(page)).toEqual(["Sort this mail", "It's about a refund."]);
    expect(reply(page).hasAttribute("aria-busy")).toBe(false);
    expect(announce).toHaveBeenCalledExactlyOnceWith("Sorter replied.");
  });

  it("starts the text again on a restart", async () => {
    const { host, requests } = scriptedHost();
    const page = await show(<Chat host={host} announce={vi.fn()} />);
    await sendMessage(page, "Sort this mail");
    const listener = requests[0]?.listener;
    await write(listener, "Refu");
    await act(async () => listener?.onText?.({ kind: "restart" }));
    await write(listener, "Billing");
    expect(said(page)).toEqual(["Sort this mail", "Billing"]);
  });

  it("shows half-written bold and code as written until they close", async () => {
    const { host, requests } = scriptedHost();
    const page = await show(<Chat host={host} announce={vi.fn()} />);
    await sendMessage(page, "Add a schedule");
    const listener = requests[0]?.listener;
    await write(listener, "I added **morn");
    expect(said(page)).toEqual(["Add a schedule", "I added **morn"]);
    expect(reply(page).querySelector("strong")).toBeNull();
    await write(listener, "ing-sort**, at `0 8");
    expect(reply(page).querySelector("strong")?.textContent).toBe("morning-sort");
    expect(reply(page).textContent).toContain("at `0 8");
    expect(reply(page).querySelector("code")).toBeNull();
    await write(listener, " * * 1-5`.\n\n```yaml\ncron: 0 8");
    expect(reply(page).querySelector("code")?.textContent).toBe("0 8 * * 1-5");
    // An open code block shows as one while it fills, as the finished reply would show it.
    expect(reply(page).querySelector("pre")?.textContent).toBe("cron: 0 8");
  });

  it("keeps the text written so far when the person stops the reply", async () => {
    const { host, requests, finish } = scriptedHost();
    const page = await show(<Chat host={host} announce={vi.fn()} />);
    await sendMessage(page, "Sort this mail");
    await write(requests[0]?.listener, "It's about");
    await act(async () => buttonNamed(page, "Stop")?.click());
    await finish({ messages: [], end: { reason: "stopped", toolsRan: false } });
    expect(said(page)).toEqual(["Sort this mail", "It's about", "Stopped by you."]);
    expect(reply(page).hasAttribute("aria-busy")).toBe(false);
  });

  it("keeps the text written so far before a failure's line, and never sends it", async () => {
    const { host, requests, finish } = scriptedHost();
    const page = await show(<Chat host={host} announce={vi.fn()} />);
    await sendMessage(page, "Sort this mail");
    await write(requests[0]?.listener, "It's about");
    await finish({
      messages: [],
      end: { reason: "failed", error: new Error("Anthropic was busy"), toolsRan: false },
    });
    expect(said(page)).toEqual([
      "Sort this mail",
      "It's about",
      "Sorter's reply failed: Anthropic was busy.",
    ]);
    await act(async () => buttonNamed(page, "Try again")?.click());
    expect(requests[1]?.messages).toEqual([{ role: "user", content: "Sort this mail" }]);
  });

  it("keeps the text out of the conversation, and a blank text out of the steps", () => {
    let transcript = withText(startTurn(emptyTranscript, "Hi"), { kind: "delta", text: "  " });
    expect(endTurn(transcript, { kind: "stopped" }).turns[0]?.steps).toEqual([]);
    transcript = withText(transcript, { kind: "delta", text: "Hello" });
    expect(shownSteps(transcript.turns[0] ?? { message: "", steps: [] })).toEqual([
      { kind: "text", text: "  Hello" },
    ]);
    transcript = withMessage(transcript, { role: "assistant", content: "Hello." });
    expect(transcript.turns[0]).toEqual({
      message: "Hi",
      steps: [{ kind: "text", text: "Hello." }],
    });
    expect(transcript.conversation).toEqual([
      { role: "user", content: "Hi" },
      { role: "assistant", content: "Hello." },
    ]);
  });
});
