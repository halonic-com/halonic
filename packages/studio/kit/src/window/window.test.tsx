// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, expect, it } from "vitest";
import { render, unmountAll } from "../test/render.tsx";
import { Window, WindowBar } from "./window.tsx";

afterEach(() => {
  unmountAll();
});

verifies("kit.window", () => {
  it("draws a thin bar with the title in small mono text and a line below", () => {
    const { container } = render(<WindowBar title="workflows/review.yaml" />);
    const bar = container.firstElementChild as HTMLElement;
    expect(bar.className).toContain("flex min-h-9 items-center");
    expect(bar.className).toContain("border-b border-border bg-surface-subtle");
    const title = bar.firstElementChild as HTMLElement;
    expect(title.textContent).toBe("workflows/review.yaml");
    expect(title.className).toContain("font-mono text-caption text-fg-muted wrap-anywhere");
    // No window dots and nothing else: only the title.
    expect(bar.childElementCount).toBe(1);
  });

  it("puts its actions on the right of the bar", () => {
    const { container } = render(
      <WindowBar title="review · run 12" actions={<button type="button">Copy</button>} />,
    );
    const actions = (container.firstElementChild as HTMLElement).lastElementChild as HTMLElement;
    expect(actions.className).toContain("ml-auto");
    expect(actions.textContent).toBe("Copy");
  });

  it("has no actions group for false actions", () => {
    const { container } = render(<WindowBar title="review.yaml" actions={false} />);
    expect((container.firstElementChild as HTMLElement).childElementCount).toBe(1);
  });

  it("frames a file in a bordered surface box, named by its title", () => {
    const { container } = render(
      <Window title="workflows/review.yaml">
        <pre>name: review</pre>
      </Window>,
    );
    const section = container.firstElementChild as HTMLElement;
    expect(section.tagName).toBe("SECTION");
    expect(section.className).toContain(
      "overflow-hidden rounded-md border border-border bg-surface",
    );
    const id = section.getAttribute("aria-labelledby") ?? "";
    expect(document.getElementById(id)?.textContent).toBe("workflows/review.yaml");
    expect(section.firstElementChild?.className).toContain("min-h-9");
    // The content sets its own padding.
    expect(section.lastElementChild?.tagName).toBe("PRE");
    expect(section.className).not.toContain("p-");
  });

  it("is unnamed with an empty title", () => {
    const { container } = render(<Window title="">…</Window>);
    const section = container.firstElementChild as HTMLElement;
    expect(section.hasAttribute("aria-labelledby")).toBe(false);
    expect(section.querySelector("[id]")).toBeNull();
  });
});
