// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, expect, it } from "vitest";
import { InfoIcon } from "../icons/info-icon.tsx";
import { click, render, unmountAll } from "../test/render.tsx";
import { LineFrame } from "./line-frame.tsx";

afterEach(() => {
  unmountAll();
});

function renderStrip(onClick: () => void = () => undefined) {
  const { container } = render(
    <LineFrame icon={<InfoIcon />} action={{ label: "Turn on", onClick }}>
      Sharing is off for this workspace.
    </LineFrame>,
  );
  const button = container.querySelector("button") as HTMLButtonElement;
  const text = container.querySelector("p") as HTMLElement;
  return { container, button, text };
}

verifies("kit.line-frame-action", () => {
  it("puts the action at the right as an accent text button named by its label", () => {
    const { button } = renderStrip();
    expect(button.type).toBe("button");
    expect(button.textContent).toBe("Turn on");
    expect(button.className.split(" ")).not.toContain("ml-auto");
    for (const name of ["text-accent-text", "font-medium", "hover:underline"]) {
      expect(button.className.split(" ")).toContain(name);
    }
  });

  it("gives the action a 48px hit area on touch and the focus ring", () => {
    const { button } = renderStrip();
    const classes = button.className.split(" ");
    expect(classes).toContain("phone:hit-touch");
    expect(classes).toContain("touch:hit-touch");
    expect(classes).not.toContain("hit-touch");
    expect(classes).toContain("focus-ring");
  });

  it("runs the action when it's pressed", async () => {
    let pressed = 0;
    const { button } = renderStrip(() => {
      pressed += 1;
    });
    await click(button);
    expect(pressed).toBe(1);
  });

  it("wraps the text and the action as one group, so the action goes under a text that doesn't fit", () => {
    const { button, text } = renderStrip();
    const group = text.parentElement as HTMLElement;
    expect(button.parentElement).toBe(group);
    expect(group.className).toContain("flex-wrap");
    expect(text.className).toContain("flex-[1_1_10rem]");
    expect(button.className.split(" ")).toContain("flex-none");
    expect(button.className.split(" ")).toContain("max-w-full");
  });

  it("keeps the frame: 48px, padded 8px 16px, a border below and no fill", () => {
    const { container } = renderStrip();
    const frame = container.firstElementChild as HTMLElement;
    expect(frame.className).toContain("min-h-touch");
    expect(frame.className).toContain("border-b border-border px-4 py-2");
    expect(frame.className).not.toMatch(/\bbg-/);
  });

  it("has no button without an action", () => {
    const { container } = render(<LineFrame icon={<InfoIcon />}>Shared with your team.</LineFrame>);
    expect(container.querySelector("button")).toBeNull();
  });
});
