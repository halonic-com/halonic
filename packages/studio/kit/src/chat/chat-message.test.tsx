// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, expect, it } from "vitest";
import { render, unmountAll } from "../test/render.tsx";
import { ChatMessage } from "./chat-message.tsx";

afterEach(unmountAll);

verifies("kit.chat-message-corner", () => {
  it("gives the person's box the new design's 7.5px corners, padding and 65% width", () => {
    const { container } = render(<ChatMessage from="you">Sort this mail</ChatMessage>);
    const box = container.querySelector("[data-chat-message=you] p") as HTMLElement;
    const names = box.className.split(" ");
    for (const name of [
      "rounded-[7.5px]",
      "pt-[6px]",
      "pr-[7px]",
      "pb-2",
      "pl-[9px]",
      "max-w-[65%]",
    ]) {
      expect(names).toContain(name);
    }
    expect(names).not.toContain("rounded-lg");
  });
});
