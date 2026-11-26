// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, expect, it } from "vitest";
import { render, unmountAll } from "../test/render.tsx";
import { ChatMessage } from "./chat-message.tsx";

afterEach(unmountAll);

verifies("kit.chat-message-corner", () => {
  it("gives the person's box the Messenger bubble's rounded-lg corners", () => {
    const { container } = render(<ChatMessage from="you">Sort this mail</ChatMessage>);
    const box = container.querySelector("[data-chat-message=you] p") as HTMLElement;
    expect(box.className.split(" ")).toContain("rounded-lg");
    expect(box.className.split(" ")).not.toContain("rounded-md");
  });
});
