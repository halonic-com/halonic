// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, expect, it } from "vitest";
import { render, unmountAll } from "../test/render.tsx";
import { Button, type ButtonProps } from "./button.tsx";

afterEach(() => {
  unmountAll();
});

function buttonOf(props: ButtonProps): HTMLButtonElement {
  const { container } = render(<Button {...props} />);
  return container.querySelector("button") as HTMLButtonElement;
}

const panelIcon = <svg />;

verifies("kit.button-pressed", () => {
  it("marks a pressed icon button and gives it the hover fill", () => {
    const pressed = buttonOf({
      variant: "ghost",
      size: "sm",
      icon: panelIcon,
      label: "Activity",
      pressed: true,
    });
    expect(pressed.getAttribute("aria-pressed")).toBe("true");
    expect(pressed.className.split(" ")).toContain("aria-pressed:bg-surface-muted");
    const released = buttonOf({
      variant: "ghost",
      icon: panelIcon,
      label: "Activity",
      pressed: false,
    });
    expect(released.getAttribute("aria-pressed")).toBe("false");
  });

  it("leaves aria-pressed off a button that isn't a toggle", () => {
    expect(
      buttonOf({ variant: "ghost", icon: panelIcon, label: "Close" }).hasAttribute("aria-pressed"),
    ).toBe(false);
  });

  it("doesn't take pressed on a button with words", () => {
    // @ts-expect-error `pressed` is only for an icon button.
    const props: ButtonProps = { pressed: true, children: "Save" };
    expect(props.children).toBe("Save");
  });
});
