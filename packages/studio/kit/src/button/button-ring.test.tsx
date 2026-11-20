// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, expect, it } from "vitest";
import { render, unmountAll } from "../test/render.tsx";
import { Button, type ButtonProps } from "./button.tsx";

afterEach(() => {
  unmountAll();
});

function classesOf(props: ButtonProps): string[] {
  const { container } = render(<Button {...props} />);
  return (container.querySelector("button") as HTMLButtonElement).className.split(" ");
}

verifies("kit.button-ring-inset", () => {
  it("draws the focus ring inside a button given ring inset", () => {
    const classes = classesOf({
      variant: "ghost",
      size: "sm",
      ring: "inset",
      icon: <svg />,
      label: "More for Refund policy",
    });
    expect(classes).toContain("focus-ring-inset");
    expect(classes).not.toContain("focus-ring");
  });

  it("keeps the outer ring on every other button", () => {
    const classes = classesOf({ children: "Save" });
    expect(classes).toContain("focus-ring");
    expect(classes).not.toContain("focus-ring-inset");
  });
});
