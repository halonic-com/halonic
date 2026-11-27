// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, expect, it, vi } from "vitest";
import { click, render, unmountAll } from "../test/render.tsx";
import { ChatBoxLine } from "./chat-box-line.tsx";
import { ChatEndLine } from "./chat-end-line.tsx";
import { ChatMessage } from "./chat-message.tsx";
import { ChatText } from "./chat-text.tsx";
import { ChatToolLine, type ChatToolState } from "./chat-tool-line.tsx";

afterEach(() => {
  unmountAll();
});

verifies("kit.chat-message", () => {
  it("shows your message at the right, in a tinted box, keeping its line breaks", () => {
    const { container } = render(<ChatMessage from="you">{"Sort this mail\nPlease"}</ChatMessage>);
    const row = container.firstElementChild as HTMLElement;
    expect(row.className).toContain("justify-end");
    const box = row.querySelector("p") as HTMLElement;
    expect(box.textContent).toBe("Sort this mail\nPlease");
    expect(box.className).toContain("bg-surface-own-message");
    expect(box.className).toContain("whitespace-pre-wrap");
    expect(box.className).toContain("wrap-break-word");
  });

  it("starts a reply with a hidden level 3 heading, then its steps in order", () => {
    const { container } = render(
      <ChatMessage from="reply" heading="Sorter said">
        <ChatToolLine state="done">Read the mail</ChatToolLine>
        <ChatText>It's about a refund.</ChatText>
      </ChatMessage>,
    );
    const reply = container.firstElementChild as HTMLElement;
    const heading = reply.firstElementChild as HTMLElement;
    expect(heading.tagName).toBe("H3");
    expect(heading.className).toBe("sr-only");
    expect(heading.textContent).toBe("Sorter said");
    const steps = [...reply.querySelectorAll("p")].map((step) => step.textContent);
    expect(steps).toEqual(["Read the mail", "It's about a refund."]);
  });

  it("takes the heading level the feature sets", () => {
    const { container } = render(
      <ChatMessage from="reply" heading="The assistant said" headingLevel={2}>
        <ChatText>Done.</ChatText>
      </ChatMessage>,
    );
    expect(container.querySelector("h2")?.textContent).toBe("The assistant said");
  });

  it("shows a text step in reading type, keeping the model's line breaks", () => {
    const { container } = render(<ChatText>{"One\nTwo"}</ChatText>);
    const text = container.firstElementChild as HTMLElement;
    expect(text.className).toContain("text-reading");
    const paragraph = text.querySelector("p") as HTMLElement;
    expect(paragraph.className).toContain("whitespace-pre-line");
    expect(paragraph.textContent).toBe("One\nTwo");
  });
});

verifies("kit.chat-tool-line", () => {
  /** Renders a line and returns its mark: the svg inside its hidden 16px box. */
  function mark(state: ChatToolState) {
    const { container } = render(<ChatToolLine state={state}>Searching pages…</ChatToolLine>);
    const line = container.firstElementChild as HTMLElement;
    expect(line.className).toContain("text-small text-fg-muted");
    expect(line.textContent).toBe("Searching pages…");
    const box = line.firstElementChild as HTMLElement;
    expect(box.getAttribute("aria-hidden")).toBe("true");
    return { box, svg: box.querySelector("svg") as SVGElement };
  }

  it("shows the busy spinner while the call runs", () => {
    const { box, svg } = mark("running");
    expect(svg.getAttribute("class")).toBe("animate-spin");
    expect(box.className).toContain("text-fg-subtle");
  });

  it("shows a tick when the call is done", () => {
    const { box, svg } = mark("done");
    expect(svg.getAttribute("class")).toBeNull();
    expect(svg.querySelector("circle")).toBeNull();
    expect(box.className).toContain("text-fg-subtle");
  });

  it("shows the alert mark in danger when the call failed", () => {
    const { box, svg } = mark("failed");
    expect(svg.getAttribute("class")).toBeNull();
    expect(svg.querySelector("circle")).not.toBeNull();
    expect(box.className).toContain("text-danger");
  });

  it("isn't a live region", () => {
    const { container } = render(<ChatToolLine state="running">Searching pages…</ChatToolLine>);
    expect(container.querySelector("[aria-live], [role]")).toBeNull();
  });
});

verifies("kit.chat-end-line", () => {
  it("shows a failure in danger with the alert mark, and Try again calls back once", async () => {
    const tryAgain = vi.fn();
    const { container } = render(
      <ChatEndLine tone="danger" actions={[{ label: "Try again", onClick: tryAgain }]}>
        Sorter's reply failed: Anthropic was busy.
      </ChatEndLine>,
    );
    const sentence = container.querySelector("p") as HTMLElement;
    expect(sentence.className).toContain("text-danger");
    expect(sentence.querySelector("[aria-hidden] svg circle")).not.toBeNull();
    expect(sentence.textContent).toBe("Sorter's reply failed: Anthropic was busy.");
    await click(container.querySelector("button") as HTMLButtonElement);
    expect(tryAgain).toHaveBeenCalledTimes(1);
  });

  it("shows a plain end muted, with no mark and no action row", () => {
    const { container } = render(
      <ChatEndLine tone="plain">
        Some tool calls already ran. Send a new message to continue.
      </ChatEndLine>,
    );
    const line = container.firstElementChild as HTMLElement;
    expect(line.children).toHaveLength(1);
    const sentence = line.querySelector("p") as HTMLElement;
    expect(sentence.className).toContain("text-fg-muted");
    expect(sentence.querySelector("svg")).toBeNull();
    expect(container.querySelector("button, a")).toBeNull();
  });

  it("shows a button, then an inline link, in the order given", () => {
    const { container } = render(
      <ChatEndLine
        tone="danger"
        actions={[
          { label: "Try again", onClick: () => {} },
          { label: "Open Models ›", onClick: () => {}, look: "link" },
        ]}
      >
        Halonic couldn't reach Ollama at localhost:11434 for the model alias fast.
      </ChatEndLine>,
    );
    const [button, link] = [...container.querySelectorAll("button")];
    expect(button?.textContent).toBe("Try again");
    expect(button?.className).toContain("border-border-strong");
    expect(link?.textContent).toBe("Open Models ›");
    expect(link?.className).toContain("text-accent-text");
  });

  it("wraps a long sentence and isn't a live region", () => {
    const { container } = render(<ChatEndLine tone="plain">Stopped by you.</ChatEndLine>);
    expect(container.querySelector("p span")?.className).toContain("wrap-break-word");
    expect(container.querySelector("[aria-live], [role]")).toBeNull();
  });
});

verifies("kit.chat-action-waits", () => {
  it("keeps a waiting action in its place, pointing at its reason, and ignores its clicks", async () => {
    const tryAgain = vi.fn();
    const { container } = render(
      <>
        <p id="engine-line">The engine isn't answering. Showing what it said last.</p>
        <ChatEndLine
          tone="danger"
          actions={[
            { label: "Try again", onClick: tryAgain, unavailable: { reason: "engine-line" } },
          ]}
        >
          Stopped when Halonic's engine stopped.
        </ChatEndLine>
      </>,
    );
    const button = container.querySelector("button") as HTMLButtonElement;
    expect(button.textContent).toBe("Try again");
    expect(button.getAttribute("aria-describedby")).toContain("engine-line");
    await click(button);
    expect(tryAgain).not.toHaveBeenCalled();
  });

  it("keeps a waiting action in its place under the box too", async () => {
    const setKey = vi.fn();
    const { container } = render(
      <>
        <p id="engine-line">The engine isn't answering. Showing what it said last.</p>
        <ChatBoxLine
          tone="warning"
          actions={[
            { label: "Set the key", onClick: setKey, unavailable: { reason: "engine-line" } },
          ]}
        >
          The assistant has no model it can use.
        </ChatBoxLine>
      </>,
    );
    const button = container.querySelector("button") as HTMLButtonElement;
    expect(button.textContent).toBe("Set the key");
    expect(button.getAttribute("aria-describedby")).toContain("engine-line");
    await click(button);
    expect(setKey).not.toHaveBeenCalled();
  });
});
