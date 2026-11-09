// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, expect, it } from "vitest";
import { render, unmountAll } from "../test/render.tsx";
import { StatusChip, type StatusChipProps } from "./status-chip.tsx";

afterEach(() => {
  unmountAll();
});

function renderChip(props: StatusChipProps): HTMLElement {
  const { container } = render(<StatusChip {...props} />);
  return container.firstElementChild as HTMLElement;
}

verifies("kit.status-chip", () => {
  it("is a neutral, at least 20px high, non-interactive span by default", () => {
    const chip = renderChip({ children: "Draft" });
    expect(chip.tagName).toBe("SPAN");
    expect(chip.textContent).toBe("Draft");
    // A minimum, so the chip grows with large system text instead of spilling its word.
    expect(chip.className).toContain("min-h-5 ");
    expect(chip.className).not.toMatch(/(?:^| )h-5 /);
    expect(chip.className).toContain("rounded-xs px-1.5");
    expect(chip.className).toContain("text-caption");
    expect(chip.className).toContain("bg-surface-muted text-fg-muted");
    // On a muted fill it steps up to border, or its box would disappear.
    expect(chip.className).toContain("on-muted:bg-border on-muted:text-fg");
    // With more contrast, border is too dark under fg there, so the box is surface.
    expect(chip.className).toContain("contrast-more:on-muted:bg-surface");
    expect(chip.hasAttribute("tabindex")).toBe(false);
    expect(chip.hasAttribute("role")).toBe(false);
  });

  it("keeps the coloured tones and the tag as they are on a muted fill", () => {
    for (const tone of ["accent", "running", "warning", "danger", "success", "outline"] as const) {
      expect(renderChip({ tone, children: "State" }).className).not.toContain("on-muted:");
    }
  });

  it.each([
    ["accent", "bg-accent-soft text-accent-text"],
    ["running", "bg-running-soft text-running"],
    ["warning", "bg-warning-soft text-warning"],
    ["danger", "bg-danger-soft text-danger"],
    ["success", "bg-success-soft text-success"],
  ] as const)("draws %s as its colour on its own soft fill", (tone, look) => {
    expect(renderChip({ tone, children: "State" }).className).toContain(look);
  });

  it("carries a see-through edge, in its own colour for more contrast", () => {
    const { className } = renderChip({ tone: "running", children: "Running" });
    expect(className).toContain("border border-transparent");
    expect(className).toContain("contrast-more:border-current");
  });

  it("draws a tag with no fill and a border-strong edge", () => {
    const { className } = renderChip({ tone: "outline", children: "Test" });
    expect(className).toContain("border border-border-strong");
    expect(className).toContain("text-fg-muted");
    expect(className).not.toContain("bg-");
  });

  it("puts a still dot before the word, hidden from screen readers", () => {
    const chip = renderChip({ tone: "warning", dot: true, children: "Needs you" });
    const dot = chip.firstElementChild as HTMLElement;
    expect(dot.getAttribute("aria-hidden")).toBe("true");
    expect(dot.className).toContain("size-1.5 shrink-0 rounded-full bg-current");
    expect(dot.className).toContain("forced-color-adjust-none");
    expect(dot.className).not.toContain("animate");
    expect(chip.textContent).toBe("Needs you");
  });

  it("draws a count round, at least 20px wide, with tabular figures", () => {
    const { className } = renderChip({
      tone: "accent",
      shape: "count",
      name: "3 waiting",
      children: "3",
    });
    expect(className).toContain("rounded-full");
    expect(className).toContain("min-w-5");
    expect(className).toContain("tabular-nums");
    expect(className).not.toContain("rounded-xs");
  });

  it("reads a count as its words, not the bare number", () => {
    const { container } = render(
      <span>
        Inbox{" "}
        <StatusChip tone="accent" shape="count" name="3 waiting">
          3
        </StatusChip>
      </span>,
    );
    const chip = container.querySelector("span > span") as HTMLElement;
    const [number, words] = Array.from(chip.children) as HTMLElement[];
    expect(number?.getAttribute("aria-hidden")).toBe("true");
    expect(number?.textContent).toBe("3");
    expect(words?.className).toBe("sr-only");
    expect(words?.textContent).toBe(", 3 waiting");
  });

  it("won't take a count without its words, or words on a plain chip", () => {
    // @ts-expect-error: a count needs its `name`.
    const count: StatusChipProps = { shape: "count", children: "3" };
    // @ts-expect-error: only a count takes a `name`.
    const word: StatusChipProps = { name: "Running", children: "Running" };
    expect([count, word]).toHaveLength(2);
  });
});
