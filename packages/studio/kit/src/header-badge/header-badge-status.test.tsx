// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, expect, it, vi } from "vitest";
import { PresentationProvider } from "../presentation/presentation.tsx";
import { click, render, unmountAll } from "../test/render.tsx";
import { HeaderBadge, type HeaderBadgeStatusTone } from "./header-badge.tsx";

afterEach(() => {
  unmountAll();
});

function label(tone: HeaderBadgeStatusTone, words: string, onClick = vi.fn()) {
  return (
    <HeaderBadge as="status" tone={tone} action="Details" onClick={onClick}>
      {words}
    </HeaderBadge>
  );
}

const buttonIn = (container: HTMLElement) => container.querySelector("button") as HTMLButtonElement;
const dotOf = (button: HTMLElement) => button.firstElementChild as HTMLElement;

verifies("kit.header-badge-status", () => {
  it("is named by its state and where it leads, with an attention fill for trouble", () => {
    const { container } = render(label("attention", "Can't reach your computer"));
    const button = buttonIn(container);
    expect(button.type).toBe("button");
    expect(button.getAttribute("aria-label")).toBe("Can't reach your computer. Details");
    expect(button.className).toContain("bg-attention-soft text-attention");
    expect(button.className).toContain("min-h-8");
    expect(button.className).toContain("hit-touch");
    expect(button.className).toContain("focus-ring");
    expect(dotOf(button).className).toContain("bg-attention");
    expect(dotOf(button).getAttribute("aria-hidden")).toBe("true");
    expect(button.lastElementChild?.getAttribute("aria-hidden")).toBe("true");
  });

  it("stays calm when connected or reconnecting, and turns red when removed", () => {
    const connected = buttonIn(render(label("success", "Connected · Tim's laptop")).container);
    expect(connected.getAttribute("aria-label")).toBe("Connected, Tim's laptop. Details");
    expect(connected.className).toContain("bg-surface-muted text-fg");
    expect(dotOf(connected).className).toContain("bg-success");
    const waiting = buttonIn(render(label("waiting", "Reconnecting…")).container);
    expect(waiting.className).toContain("bg-surface-muted text-fg");
    expect(dotOf(waiting).className).toContain("bg-attention");
    const removed = buttonIn(render(label("danger", "Removed from this computer")).container);
    expect(removed.className).toContain("bg-danger-soft text-danger");
    expect(dotOf(removed).className).toContain("bg-danger");
  });

  it("calls onClick when tapped on a phone, in the top bar rather than on a line of its own", async () => {
    const onClick = vi.fn();
    const { container } = render(
      <PresentationProvider presentation="phone">
        {label("danger", "Can't confirm your computer", onClick)}
      </PresentationProvider>,
    );
    expect(container.firstElementChild?.tagName).toBe("BUTTON");
    await click(buttonIn(container));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
