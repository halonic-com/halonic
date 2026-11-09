// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, expect, it } from "vitest";
import { render, unmountAll } from "../test/render.tsx";
import { Button, OnTintContext } from "./button.tsx";

afterEach(() => {
  unmountAll();
});

function onTint(variant: "ghost" | "secondary"): string {
  const { container } = render(
    <OnTintContext value={true}>
      <Button variant={variant}>Try again</Button>
    </OnTintContext>,
  );
  return (container.querySelector("button") as HTMLButtonElement).className;
}

verifies("kit.button-on-tint", () => {
  it("draws a ghost button on a tint in accent-text, lifting to surface on hover and press", () => {
    const classes = onTint("ghost");
    expect(classes).toContain("border-transparent text-accent-text");
    expect(classes).toContain("not-aria-disabled:hover:bg-surface ");
    expect(classes).toContain("not-aria-disabled:active:bg-surface");
    expect(classes).not.toContain("text-fg-muted");
    expect(classes).not.toContain("bg-surface-muted");
  });

  it("leaves other variants on a tint, and a ghost button elsewhere, as they are", () => {
    expect(onTint("secondary")).toContain("border-border-strong bg-surface text-fg");
    const { container } = render(<Button variant="ghost">Cancel</Button>);
    const ghost = (container.querySelector("button") as HTMLButtonElement).className;
    expect(ghost).toContain("text-fg-muted");
    expect(ghost).not.toContain("text-accent-text");
  });
});
