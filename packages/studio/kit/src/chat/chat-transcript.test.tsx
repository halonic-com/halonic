// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it } from "vitest";
import { render, unmountAll } from "../test/render.tsx";
import { ChatMessage, ChatText } from "./chat-message.tsx";
import { ChatTranscript } from "./chat-transcript.tsx";

afterEach(() => {
  unmountAll();
});

/** jsdom lays nothing out, so the test says how tall the transcript and its content are. */
function setHeights(scroller: HTMLElement, content: number, visible: number) {
  Object.defineProperty(scroller, "scrollHeight", { configurable: true, value: content });
  Object.defineProperty(scroller, "clientHeight", { configurable: true, value: visible });
}

function transcript(steps: readonly string[], notice?: string) {
  return (
    <ChatTranscript label="Chat with Sorter" notice={notice} noticeId="engine-line">
      <ChatMessage from="you">Sort this mail</ChatMessage>
      <ChatMessage from="reply" heading="Sorter said">
        {steps.map((step) => (
          <ChatText key={step}>{step}</ChatText>
        ))}
      </ChatMessage>
    </ChatTranscript>
  );
}

verifies("kit.chat-transcript", () => {
  it("is a region named by its label, not a live region", () => {
    const { container } = render(transcript(["Reading it."]));
    const region = container.querySelector("section") as HTMLElement;
    expect(region.getAttribute("aria-label")).toBe("Chat with Sorter");
    expect(region.className).toContain("overflow-y-auto");
    expect(container.querySelector("[aria-live], [role=log], [role=status]")).toBeNull();
  });

  it("stays at the end while a reply grows", () => {
    const { container, rerender } = render(transcript(["Reading it."]));
    const scroller = container.querySelector("section") as HTMLElement;
    setHeights(scroller, 900, 300);
    rerender(transcript(["Reading it.", "It's about a refund."]));
    expect(scroller.scrollTop).toBe(900);
  });

  it("leaves the scroll alone once the reader has scrolled up", () => {
    const { container, rerender } = render(transcript(["Reading it."]));
    const scroller = container.querySelector("section") as HTMLElement;
    setHeights(scroller, 900, 300);
    act(() => {
      scroller.scrollTop = 100;
      scroller.dispatchEvent(new Event("scroll"));
    });
    rerender(transcript(["Reading it.", "It's about a refund."]));
    expect(scroller.scrollTop).toBe(100);
  });

  it("shows the notice at the top, with the warning mark, and keeps the messages", () => {
    const notice = "The engine isn't answering. Showing what it said last.";
    const { container } = render(transcript(["Reading it."], notice));
    const region = container.querySelector("section") as HTMLElement;
    const top = region.firstElementChild as HTMLElement;
    expect(top.textContent).toBe(notice);
    expect(top.id).toBe("engine-line");
    expect(top.querySelector("[aria-hidden] svg path")).not.toBeNull();
    expect(region.querySelector("[data-chat-message=reply]")?.textContent).toContain("Reading it.");
  });

  it("shows no line at the top without a notice", () => {
    const { container } = render(transcript(["Reading it."]));
    const region = container.querySelector("section") as HTMLElement;
    expect(region.children).toHaveLength(1);
    expect(region.firstElementChild?.className).toContain("max-w-reading");
  });
});
