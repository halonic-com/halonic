// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { click, render, unmountAll } from "../test/render.tsx";
import { ChatLoading } from "./chat-loading.tsx";
import { ChatStart } from "./chat-start.tsx";

afterEach(() => {
  unmountAll();
});

verifies("kit.chat-start", () => {
  it("shows the hidden figure, the heading, then the description in muted text", () => {
    const { container } = render(
      <ChatStart
        figure={<svg data-orb="" />}
        heading="Chat with Sorter"
        description="Sorts incoming mail by topic"
      />,
    );
    const start = container.firstElementChild as HTMLElement;
    const [figure, heading, description] = [...start.children] as HTMLElement[];
    expect(figure?.getAttribute("aria-hidden")).toBe("true");
    expect(figure?.querySelector("[data-orb]")).not.toBeNull();
    expect(heading?.tagName).toBe("H2");
    expect(heading?.className).toContain("text-heading");
    expect(heading?.textContent).toBe("Chat with Sorter");
    expect(description?.className).toContain("text-fg-muted");
    expect(description?.textContent).toBe("Sorts incoming mail by topic");
    expect(container.querySelector("button")).toBeNull();
  });

  it("shows only the heading without a figure or a description", () => {
    const { container } = render(
      <ChatStart heading="What should we build?" headingLevel={3} description="" />,
    );
    const start = container.firstElementChild as HTMLElement;
    expect(start.children).toHaveLength(1);
    expect(start.firstElementChild?.tagName).toBe("H3");
  });
});

verifies("kit.chat-loading", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function wait(ms: number) {
    act(() => {
      vi.advanceTimersByTime(ms);
    });
  }

  it("shows nothing before 300ms, with its status line already there", () => {
    const { container } = render(<ChatLoading label="Loading this chat" onRetry={() => {}} />);
    const status = container.querySelector("[role=status]") as HTMLElement;
    expect(status.textContent).toBe("");
    expect(container.querySelector("[aria-busy] [aria-hidden]")).toBeNull();
  });

  it("shows three hidden lines after 300ms and says what's loading", () => {
    const { container } = render(<ChatLoading label="Loading this chat" onRetry={() => {}} />);
    wait(300);
    const lines = container.querySelectorAll("[aria-busy] > [aria-hidden=true]");
    expect(lines).toHaveLength(3);
    expect(container.querySelector("[role=status]")?.textContent).toBe("Loading this chat");
    expect(container.querySelector("button")).toBeNull();
  });

  it("offers Try again after 10 seconds and keeps the lines", async () => {
    const retry = vi.fn();
    const { container } = render(<ChatLoading label="Loading this chat" onRetry={retry} />);
    wait(10_000);
    expect(container.querySelector("[role=status]")?.textContent).toBe("Still loading");
    expect(container.querySelectorAll("[aria-busy] > [aria-hidden=true]")).toHaveLength(3);
    const tryAgain = container.querySelector("button") as HTMLButtonElement;
    expect(tryAgain.textContent).toBe("Try again");
    await click(tryAgain);
    expect(retry).toHaveBeenCalledTimes(1);
  });
});
