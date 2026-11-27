// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, expect, it } from "vitest";
import { buildCss } from "../test/build-css.spec.ts";
import { render, unmountAll } from "../test/render.tsx";
import { ChatMessage } from "./chat-message.tsx";

afterEach(unmountAll);

verifies("kit.chat-message-corner", () => {
  it("builds the bubble's 7.5px corners and one-pixel shadow", async () => {
    const css = await buildCss(["rounded-bubble", "shadow-bubble"]);
    expect(css).toContain("--radius-bubble: 7.5px");
    expect(css).toContain("--shadow-bubble: 0 1px 0.5px 0 var(--shade-bubble)");
  });
});

verifies("kit.chat-message-corner", () => {
  it("gives the person's box the new design's corners, padding, shadow and 65% width", () => {
    const { container } = render(<ChatMessage from="you">Sort this mail</ChatMessage>);
    const box = container.querySelector("[data-chat-message=you] p") as HTMLElement;
    const names = box.className.split(" ");
    for (const name of [
      "rounded-bubble",
      "pt-[6px]",
      "pr-[7px]",
      "pb-2",
      "pl-[9px]",
      "max-w-[65%]",
      "shadow-bubble",
      "bg-surface-own-message",
    ]) {
      expect(names).toContain(name);
    }
    expect(names).not.toContain("rounded-lg");
  });
});
