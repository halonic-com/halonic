// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { click, render, unmountAll } from "../test/render.tsx";
import { ChatBoxLine } from "./chat-box-line.tsx";
import { ChatComposer, type ChatComposerProps } from "./chat-composer.tsx";

afterEach(() => {
  unmountAll();
});

function composer(overrides: Partial<ChatComposerProps> = {}) {
  const props: ChatComposerProps = {
    label: "Message Sorter",
    placeholder: "Message Sorter…",
    value: "Sort this mail",
    onChange: vi.fn(),
    onSend: vi.fn(),
    onStop: vi.fn(),
    answering: false,
    ...overrides,
  };
  return { props, element: <ChatComposer {...props} /> };
}

function pressEnter(box: HTMLTextAreaElement, init: KeyboardEventInit = {}) {
  const event = new KeyboardEvent("keydown", {
    key: "Enter",
    bubbles: true,
    cancelable: true,
    ...init,
  });
  act(() => {
    box.dispatchEvent(event);
  });
  return event;
}

verifies("kit.chat-composer", () => {
  it("names the box and shows its placeholder", () => {
    const { container } = render(composer().element);
    const box = container.querySelector("textarea") as HTMLTextAreaElement;
    expect(box.getAttribute("aria-label")).toBe("Message Sorter");
    expect(box.placeholder).toBe("Message Sorter…");
    expect(container.querySelector("button")?.textContent).toBe("Send");
  });

  it("sends once on Enter, and on Send", async () => {
    const { props, element } = composer();
    const { container } = render(element);
    const event = pressEnter(container.querySelector("textarea") as HTMLTextAreaElement);
    expect(event.defaultPrevented).toBe(true);
    expect(props.onSend).toHaveBeenCalledTimes(1);
    await click(container.querySelector("button") as HTMLButtonElement);
    expect(props.onSend).toHaveBeenCalledTimes(2);
  });

  it("adds a line on Shift Enter, and sends nothing", () => {
    const { props, element } = composer();
    const { container } = render(element);
    const event = pressEnter(container.querySelector("textarea") as HTMLTextAreaElement, {
      shiftKey: true,
    });
    expect(event.defaultPrevented).toBe(false);
    expect(props.onSend).not.toHaveBeenCalled();
  });

  it("sends nothing while an input method is composing", () => {
    const { props, element } = composer();
    const { container } = render(element);
    pressEnter(container.querySelector("textarea") as HTMLTextAreaElement, { isComposing: true });
    expect(props.onSend).not.toHaveBeenCalled();
  });

  it.each([
    ["the message is blank", { value: "  \n " }],
    ["a reply is being written", { answering: true }],
    ["Send waits", { sendUnavailable: { reason: "engine-line" } }],
  ])("sends nothing on Enter when %s, and keeps the text", (_, overrides) => {
    const { props, element } = composer(overrides);
    const { container } = render(element);
    const event = pressEnter(container.querySelector("textarea") as HTMLTextAreaElement);
    expect(event.defaultPrevented).toBe(true);
    expect(props.onSend).not.toHaveBeenCalled();
    expect(props.onChange).not.toHaveBeenCalled();
  });

  it("lets a waiting Send keep focus, ignore clicks and name its reason", async () => {
    const { props, element } = composer({ sendUnavailable: { reason: "engine-line" } });
    const { container } = render(element);
    const send = container.querySelector("button") as HTMLButtonElement;
    expect(send.getAttribute("aria-disabled")).toBe("true");
    expect(send.getAttribute("aria-describedby")).toBe("engine-line");
    expect(send.hasAttribute("disabled")).toBe(false);
    await click(send);
    expect(props.onSend).not.toHaveBeenCalled();
  });

  it("turns Send into Stop and back on the same button, which keeps focus", async () => {
    const { props, element } = composer();
    const { container, rerender } = render(element);
    const send = container.querySelector("button") as HTMLButtonElement;
    send.focus();
    rerender(<ChatComposer {...props} answering />);
    const stop = container.querySelector("button") as HTMLButtonElement;
    expect(stop).toBe(send);
    expect(stop.textContent).toBe("Stop");
    expect(document.activeElement).toBe(stop);
    await click(stop);
    expect(props.onStop).toHaveBeenCalledTimes(1);
    expect(props.onSend).not.toHaveBeenCalled();
    rerender(<ChatComposer {...props} answering={false} />);
    expect(container.querySelector("button")).toBe(send);
    expect(send.textContent).toBe("Send");
    expect(document.activeElement).toBe(send);
  });

  it("shows its line in a status region that's there before the line", () => {
    const { props, element } = composer();
    const { container, rerender } = render(element);
    const status = container.querySelector("[role=status]") as HTMLElement;
    expect(status.textContent).toBe("");
    rerender(
      <ChatComposer
        {...props}
        line={
          <ChatBoxLine tone="warning">Sorter can't run until Claude Code is installed.</ChatBoxLine>
        }
      />,
    );
    expect(container.querySelector("[role=status]")).toBe(status);
    expect(status.textContent).toBe("Sorter can't run until Claude Code is installed.");
  });
});

verifies("kit.chat-box-line", () => {
  it("shows a warning's triangle, its sentence, then its actions in order", async () => {
    const goToKey = vi.fn();
    const sendAnyway = vi.fn();
    const { container } = render(
      <ChatBoxLine
        tone="warning"
        actions={[
          { label: "Go to the key field ›", onClick: goToKey, look: "link" },
          { label: "Send anyway", onClick: sendAnyway },
        ]}
      >
        This looks like an API key. Keys go in the key field, so they stay out of chats and files.
      </ChatBoxLine>,
    );
    const line = container.firstElementChild as HTMLElement;
    expect(line.className).toContain("text-small text-fg");
    const mark = line.firstElementChild as HTMLElement;
    expect(mark.getAttribute("aria-hidden")).toBe("true");
    expect(mark.className).toContain("text-warning");
    expect(line.querySelector("p")?.className).toContain("wrap-break-word");
    const [link, button] = [...line.querySelectorAll("button")];
    expect(link?.textContent).toBe("Go to the key field ›");
    expect(button?.textContent).toBe("Send anyway");
    await click(button as HTMLButtonElement);
    expect(sendAnyway).toHaveBeenCalledTimes(1);
    expect(goToKey).not.toHaveBeenCalled();
  });

  it("shows a muted line without a mark", () => {
    const { container } = render(
      <ChatBoxLine tone="muted">
        Not trusted yet · it can read and propose, but not run anything.
      </ChatBoxLine>,
    );
    const line = container.firstElementChild as HTMLElement;
    expect(line.className).toContain("text-fg-muted");
    expect(line.querySelector("svg")).toBeNull();
  });
});
