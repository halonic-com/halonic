// @vitest-environment jsdom

import { gatewayMaxPromptLength } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import {
  remoteApproval,
  remoteSession,
  remoteView,
  staleView,
} from "../test-support/fake-phone-remote.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { AgentsList } from "./agents-list.tsx";
import { PromptBox } from "./prompt-box.tsx";
import type { RemoteSendOutcome, RemoteView } from "./remote-view.ts";
import { promptWords, sendOutcomeLine } from "./send-words.ts";

afterEach(unmountAll);

const sorter = { sessionId: "sorter", title: "Sorter" };

function show(view: RemoteView, outcome: RemoteSendOutcome = { kind: "done" }) {
  const onSend = vi.fn(async () => outcome);
  const screen = render(<PromptBox view={view} agent={sorter} onSend={onSend} />);
  const box = () => screen.querySelector("textarea");
  const send = () => screen.querySelector("button");
  const line = () => screen.querySelector('[role="status"]')?.textContent;
  const type = (text: string) =>
    act(() => {
      const element = box();
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(
        element,
        text,
      );
      element?.dispatchEvent(new Event("input", { bubbles: true }));
    });
  const press = () => act(async () => send()?.click());
  return { screen, box, send, line, type, press, onSend };
}

verifies("remote.phone-prompt-box", () => {
  it("is off with the reason readable under it while the phone can't answer, agent in view or not", () => {
    const { box, send } = show(staleView(remoteView(), "unreachable"));
    // Off but focusable, so the keyboard reaches it and hears the reason.
    expect(box()?.disabled).toBe(false);
    expect(box()?.readOnly).toBe(true);
    expect(box()?.getAttribute("aria-disabled")).toBe("true");
    expect(box()?.getAttribute("aria-label")).toBe("Prompt");
    expect(box()?.placeholder).toBe("");
    const reason = document.getElementById(box()?.getAttribute("aria-describedby") ?? "");
    expect(reason?.textContent).toBe("You can send a prompt once your phone reconnects.");
    expect(reason?.className).toContain("text-fg-muted");
    expect(send()).toBeNull();

    unmountAll();
    const screen = render(
      <PromptBox
        view={staleView(remoteView(), "reconnecting")}
        agent={undefined}
        onSend={vi.fn()}
      />,
    );
    expect(screen.querySelector("textarea")?.getAttribute("aria-disabled")).toBe("true");
    expect(screen.textContent).toBe("You can send a prompt once your phone reconnects.");
  });

  it("shows nothing while live with no agent in view", () => {
    const screen = render(<PromptBox view={remoteView()} agent={undefined} onSend={vi.fn()} />);
    expect(screen.innerHTML).toBe("");
  });

  it("sends a prompt that isn't blank once, then empties and says so", async () => {
    const { box, line, type, press, onSend } = show(remoteView());
    expect(box()?.placeholder).toBe("Message Sorter…");
    type("   ");
    await press();
    expect(onSend).not.toHaveBeenCalled();

    type("Only the urgent ones");
    await press();
    expect(onSend).toHaveBeenCalledExactlyOnceWith("sorter", "Only the urgent ones");
    expect(box()?.value).toBe("");
    expect(line()).toBe("Prompt sent.");

    type("And file the rest");
    await press();
    expect(line()).toBe("Prompt sent. ");
  });

  it("keeps the text and says why when it wasn't carried out", async () => {
    const { box, line, type, press } = show(remoteView(), {
      kind: "refused",
      code: "unknown-session",
    });
    type("Only the urgent ones");
    await press();
    expect(box()?.value).toBe("Only the urgent ones");
    expect(line()).toBe("This agent isn't on your computer any more.");
  });

  it("turns Send off past the protocol's length, with the reason", async () => {
    const { send, line, type, press, onSend } = show(remoteView());
    type("x".repeat(gatewayMaxPromptLength + 1));
    expect(line()).toBe("A prompt can be at most 10,000 characters.");
    expect(send()?.getAttribute("aria-disabled")).toBe("true");
    await press();
    expect(onSend).not.toHaveBeenCalled();
    expect(promptWords.tooLong).toContain(gatewayMaxPromptLength.toLocaleString("en-GB"));
  });

  it("says a prompt or an answer whose port rejected was cut off, and sends nothing again", async () => {
    // A rejection the screens didn't catch would also fail this test run.
    const onSend = vi.fn(async (): Promise<RemoteSendOutcome> => {
      throw new Error("port bug");
    });
    const prompt = render(<PromptBox view={remoteView()} agent={sorter} onSend={onSend} />);
    const box = prompt.querySelector("textarea");
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(box, "Hi");
      box?.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => prompt.querySelector("button")?.click());
    expect(onSend).toHaveBeenCalledOnce();
    expect(box?.value).toBe("Hi");
    expect(prompt.querySelector('[role="status"]')?.textContent).toBe(
      sendOutcomeLine("prompt", { kind: "cut-off" }),
    );

    const onAnswer = vi.fn(async (): Promise<RemoteSendOutcome> => {
      throw new Error("port bug");
    });
    const agents = render(
      <AgentsList
        view={remoteView({
          sessions: [remoteSession({ id: "sorter", title: "Sorter", state: "waiting" })],
          openApprovals: [remoteApproval({ sessionId: "sorter" })],
        })}
        onOpen={vi.fn()}
        onAnswer={onAnswer}
      />,
    );
    const approve = [...agents.querySelectorAll("button")].find(
      (b) => b.textContent === "Approve Sorter",
    );
    await act(async () => approve?.click());
    expect(onAnswer).toHaveBeenCalledOnce();
    expect(agents.querySelector('[role="status"]')?.textContent).toBe(
      sendOutcomeLine("answer", { kind: "cut-off" }),
    );
  });

  it("words what became of an answer or a prompt, and adds nothing when it was done or off", () => {
    expect(sendOutcomeLine("answer", { kind: "done" })).toBeUndefined();
    expect(sendOutcomeLine("prompt", { kind: "not-sent", reason: "off" })).toBeUndefined();
    expect(sendOutcomeLine("answer", { kind: "refused", code: "unknown-approval" })).toBe(
      "This was already answered, or the agent stopped asking.",
    );
    expect(sendOutcomeLine("answer", { kind: "refused", code: "not-allowed-remotely" })).toBe(
      "Answer this on your computer.",
    );
    expect(sendOutcomeLine("prompt", { kind: "refused", code: "not-allowed-remotely" })).toBe(
      "Your computer didn't accept this prompt. Send it from your computer instead.",
    );
    expect(sendOutcomeLine("prompt", { kind: "not-sent", reason: "not-open" })).toBe(
      "Not sent. Try again once your phone reconnects.",
    );
    expect(sendOutcomeLine("prompt", { kind: "not-sent", reason: "too-large" })).toBe(
      promptWords.tooLong,
    );
    expect(sendOutcomeLine("prompt", { kind: "not-sent", reason: "not-allowed" })).toBe(
      "Your phone can't send this. Send it from your computer.",
    );
    expect(sendOutcomeLine("answer", { kind: "not-sent", reason: "not-allowed" })).toBe(
      "Answer this on your computer.",
    );
    expect(sendOutcomeLine("answer", { kind: "not-sent", reason: "not-confirmed" })).toBe(
      "Not sent. Your phone couldn't confirm it's you. Try again, or answer this on your computer.",
    );
    expect(sendOutcomeLine("answer", { kind: "cut-off" })).toBe(
      "The connection dropped before your computer confirmed your answer. Once your phone reconnects, you'll see whether it arrived.",
    );
    expect(sendOutcomeLine("prompt", { kind: "cut-off" })).toContain(
      "Once your phone reconnects, you'll see in the agent's messages whether it arrived.",
    );
  });

  it("writes under Approve and Reject what became of an answer", async () => {
    const view = remoteView({
      sessions: [remoteSession({ id: "sorter", title: "Sorter", state: "waiting" })],
      openApprovals: [remoteApproval({ sessionId: "sorter" })],
    });
    const onAnswer = vi.fn(async (): Promise<RemoteSendOutcome> => ({ kind: "cut-off" }));
    const screen = render(<AgentsList view={view} onOpen={vi.fn()} onAnswer={onAnswer} />);
    const approve = [...screen.querySelectorAll("button")].find(
      (b) => b.textContent === "Approve Sorter",
    );
    await act(async () => approve?.click());
    expect(screen.querySelector('[role="status"]')?.textContent).toBe(
      sendOutcomeLine("answer", { kind: "cut-off" }),
    );
  });
});
