// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, expect, it } from "vitest";
import { Button } from "../button/button.tsx";
import { ChatComposer, type ChatComposerProps } from "../chat/chat-composer.tsx";
import { buildCss } from "../test/build-css.spec.ts";
import { render, unmountAll } from "../test/render.tsx";
import { Input } from "./input.tsx";

afterEach(() => {
  unmountAll();
});

const noop = () => undefined;

function composer(overrides: Partial<ChatComposerProps> = {}) {
  return (
    <ChatComposer
      label="Message Chief"
      placeholder="Message Chief…"
      value=""
      onChange={noop}
      onSend={noop}
      onStop={noop}
      answering={false}
      {...overrides}
    />
  );
}

/** The box round the text: the element that draws the frame. */
function frameOf(container: HTMLElement): string[] {
  const text = container.querySelector("[data-field-text]") as HTMLElement;
  return (text.closest(".border") as HTMLElement).className.split(" ");
}

verifies("kit.prompt-look", () => {
  it("draws the composer as a rounded box with the prompt edge, surface and shadow", () => {
    const frame = frameOf(render(composer()).container);
    for (const name of [
      "rounded-prompt",
      "border-border-prompt",
      "bg-surface-prompt",
      "shadow-prompt",
      "focus-prompt",
    ]) {
      expect(frame).toContain(name);
    }
    expect(frame).not.toContain("focus-field");
  });

  it("puts a round Send inside the box, grey while blank and blue once there's text", () => {
    const { container, rerender } = render(composer());
    const text = container.querySelector("textarea") as HTMLTextAreaElement;
    const send = container.querySelector('button[aria-label="Send"]') as HTMLButtonElement;
    expect(text.parentElement?.contains(send)).toBe(true);
    expect(send.className).toContain("rounded-full");
    expect(send.className).toContain("size-9");
    expect(send.className).toContain("bg-surface-soft");
    rerender(composer({ value: "Ship it" }));
    expect(send.className).toContain("bg-primary");
  });

  it("puts Stop in Send's place while answering, and a leading button at the left", () => {
    const leading = <Button variant="soft" size="prompt" round icon={<span />} label="Attach" />;
    const { container } = render(composer({ answering: true, leading }));
    const [first, last] = [...container.querySelectorAll("button")];
    const text = container.querySelector("textarea") as HTMLTextAreaElement;
    expect(first?.getAttribute("aria-label")).toBe("Attach");
    expect(last?.getAttribute("aria-label")).toBe("Stop");
    expect(last?.className).toContain("rounded-full");
    expect(first?.compareDocumentPosition(text)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it("gives an Input the prompt look only when asked, so form fields keep their edge", () => {
    const prompt = frameOf(render(<Input look="prompt" aria-label="Search chats" />).container);
    expect(prompt).toContain("rounded-prompt");
    expect(prompt).toContain("shadow-prompt");
    const field = frameOf(render(<Input aria-label="Workspace name" />).container);
    expect(field).toContain("rounded-sm");
    expect(field).toContain("border-border-control");
    expect(field).not.toContain("shadow-prompt");
  });

  it("gives a prompt Input the 15px prompt text and no browser clear button beside its Esc", () => {
    const { container } = render(<Input look="prompt" type="search" aria-label="Search chats" />);
    const text = (container.querySelector("input") as HTMLInputElement).className;
    expect(text).toContain("text-reading");
    expect(text).toContain("[&::-webkit-search-cancel-button]:appearance-none");
    const field = render(<Input aria-label="Workspace name" />).container.querySelector("input");
    expect(field?.className).toContain("text-body");
  });

  it("keeps a prompt TextArea's padding out of its line limit, so its last line shows whole", () => {
    const text = render(composer()).container.querySelector("textarea") as HTMLTextAreaElement;
    const names = text.className.split(" ");
    expect(names).toContain("my-1.5");
    expect(names).toContain("max-h-rows-reading");
    expect(names).not.toContain("py-1.5");
    expect(names).not.toContain("max-h-rows");
  });

  it("falls back to the reading text's 24px line where the lh unit is missing", async () => {
    const css = await buildCss(["max-h-rows-reading"]);
    const rule = css.slice(css.indexOf(".max-h-rows-reading"));
    expect(rule).toContain("max-height: calc(var(--max-rows) * var(--text-reading--line-height))");
  });

  it("builds the board's values in light and the lighter box in dark", async () => {
    const css = await buildCss(["rounded-prompt", "border-border-prompt", "shadow-prompt"]);
    expect(css).toContain("--radius-prompt: 24px");
    expect(css).toContain("--color-border-prompt: light-dark(#dcdfe5, #353c4c)");
    expect(css).toContain("--color-surface-prompt: light-dark(#ffffff, rgb(255 255 255 / 0.06))");
    expect(css).toContain("--shadow-prompt: 0 4px 18px -2px var(--shade-prompt)");
    expect(css).toContain("--shade-prompt: light-dark(rgb(60 64 67 / 0.12), rgb(0 0 0 / 0.5))");
  });

  it("keeps the round soft buttons a step above the box in dark", async () => {
    const css = await buildCss(["bg-surface-soft"]);
    expect(css).toContain(
      "--color-surface-soft: light-dark(var(--color-surface-muted), rgb(255 255 255 / 0.08))",
    );
  });

  it("turns the edge accent and deepens the shadow on focus, with no 3px ring", async () => {
    const css = await buildCss(["focus-prompt"]);
    // Only the utility's own rule: the base styles hold other rings.
    const from = css.slice(css.indexOf(".focus-prompt"));
    const rule = from.slice(0, from.indexOf("\n  }\n}"));
    expect(rule).toContain("border-color: var(--color-accent)");
    expect(rule).toContain("box-shadow: var(--shadow-prompt-focus)");
    expect(rule).not.toContain("3px");
  });
});
