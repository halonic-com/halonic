// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, expect, it } from "vitest";
import { render, unmountAll } from "../test/render.tsx";
import { Button } from "./button.tsx";

afterEach(() => {
  unmountAll();
});

verifies("kit.button-name", () => {
  it("is named by its name, and keeps its words on screen", () => {
    const { container } = render(
      <Button name="Next: Approve this reply?, 2 left">Next: Approve this reply? · 2 left</Button>,
    );
    const button = container.querySelector("button") as HTMLButtonElement;
    expect(button.getAttribute("aria-label")).toBe("Next: Approve this reply?, 2 left");
    expect(button.textContent).toBe("Next: Approve this reply? · 2 left");
  });

  it("is named as without a name while busy", () => {
    const { container, rerender } = render(
      <Button busy name="Next: Approve this reply?, 2 left">
        Next: Approve this reply? · 2 left
      </Button>,
    );
    const button = container.querySelector("button") as HTMLButtonElement;
    expect(button.getAttribute("aria-label")).toBeNull();
    rerender(
      <Button busy busyName="Opening the next card" name="Next: Approve this reply?, 2 left">
        Next: Approve this reply? · 2 left
      </Button>,
    );
    expect(button.getAttribute("aria-label")).toBe("Opening the next card");
  });
});
