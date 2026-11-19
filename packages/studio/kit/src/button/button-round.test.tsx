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

const closeIcon = <svg />;

verifies("kit.button-round", () => {
  it("draws a round icon button as a circle of the same size", () => {
    const classes = classesOf({
      variant: "ghost",
      size: "sm",
      round: true,
      icon: closeIcon,
      label: "Remove Refund policy",
    });
    expect(classes).toContain("rounded-full");
    expect(classes).not.toContain("rounded-sm");
    expect(classes).toContain("size-control-sm");
    expect(classes).toContain("phone:size-touch");
  });

  it("keeps every other button's small square corners", () => {
    const iconButton = classesOf({ variant: "ghost", icon: closeIcon, label: "Close" });
    expect(iconButton).toContain("rounded-sm");
    expect(iconButton).not.toContain("rounded-full");
    const withWords = classesOf({ children: "Save" });
    expect(withWords).toContain("rounded-sm");
    expect(withWords).not.toContain("rounded-full");
  });

  it("doesn't take round on a button with words", () => {
    // @ts-expect-error `round` is only for an icon button.
    const props: ButtonProps = { round: true, children: "Save" };
    expect(props.children).toBe("Save");
  });
});
