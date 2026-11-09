// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, expect, it, vi } from "vitest";
import { click, render, unmountAll } from "../test/render.tsx";
import { Card } from "./card.tsx";

afterEach(() => {
  unmountAll();
});

/** The element a section is named by, through `aria-labelledby`. */
function nameOf(section: Element): string | null | undefined {
  const id = section.getAttribute("aria-labelledby");
  return id === null ? null : document.getElementById(id)?.textContent;
}

verifies("kit.card", () => {
  it("is a bordered surface box with a 12px radius and no shadow at rest", () => {
    const { container } = render(<Card>12 runs this week</Card>);
    const card = container.firstElementChild as HTMLElement;
    expect(card.tagName).toBe("DIV");
    expect(card.className).toContain("rounded-md border bg-surface");
    expect(card.className).toContain("border-border");
    expect(card.className).toContain("p-4");
    expect(card.className).not.toContain("shadow");
  });

  it("names its section after its title, a heading at level 3 by default", () => {
    const { container } = render(
      <Card title="Model providers" actions={<button type="button">Add</button>}>
        Two providers
      </Card>,
    );
    const section = container.querySelector("section") as HTMLElement;
    const heading = section.querySelector("h3") as HTMLElement;
    expect(nameOf(section)).toBe("Model providers");
    expect(heading.className).toContain("text-section");
    expect(heading.parentElement?.className).toContain("border-b border-border px-4 py-3");
    expect(heading.parentElement?.lastElementChild?.textContent).toBe("Add");
  });

  it("takes another heading level", () => {
    const { container } = render(
      <Card title="Budget" headingLevel={2}>
        Within budget
      </Card>,
    );
    expect(container.querySelector("h2")?.textContent).toBe("Budget");
  });

  it("names its section after a caption label, written in sentence case", () => {
    const { container } = render(<Card label="When">Every weekday at 9:00</Card>);
    const section = container.querySelector("section") as HTMLElement;
    const label = section.querySelector("p") as HTMLElement;
    expect(nameOf(section)).toBe("When");
    expect(label.className).toContain(
      "text-caption font-medium uppercase tracking-label text-fg-muted",
    );
    expect(section.querySelector("h1, h2, h3, h4")).toBeNull();
  });

  it("takes a title or a label, never both, and an interactive card holds no actions", () => {
    const run = <button type="button">Run</button>;
    // @ts-expect-error A card has a title or a label, not both.
    const both = <Card title="When" label="When" children="…" />;
    // @ts-expect-error An interactive card is one target, so it has no actions.
    const nested = <Card onClick={() => {}} actions={run} children="…" />;
    expect([both, nested]).toHaveLength(2);
  });

  it("is one button as a whole when interactive, lifting its edge on hover", async () => {
    const onClick = vi.fn();
    const { container } = render(<Card onClick={onClick}>Daily digest</Card>);
    const button = container.querySelector("button") as HTMLButtonElement;
    expect(button.type).toBe("button");
    expect(button.className).toContain("hover:border-border-strong hover:shadow-1");
    expect(button.className).toContain("focus-ring");
    expect(button.className).toContain("active:bg-surface-subtle");
    await click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("has no header for an empty title, label or actions", () => {
    const { container } = render(
      <>
        <Card title="">One</Card>
        <Card label="" actions={false}>
          Two
        </Card>
      </>,
    );
    expect(container.querySelector("section")).toBeNull();
    expect(container.querySelectorAll("div.p-4")).toHaveLength(2);
  });

  it("shows an error with a danger edge", () => {
    const { container } = render(<Card state="error">Last run failed</Card>);
    expect((container.firstElementChild as HTMLElement).className).toContain("border-danger");
  });

  it("is disabled with fg-disabled text and no hover, and still opens", async () => {
    const onClick = vi.fn();
    const { container } = render(
      <Card state="disabled" onClick={onClick}>
        Paused
      </Card>,
    );
    const button = container.querySelector("button") as HTMLButtonElement;
    expect(button.className).toContain("text-fg-disabled");
    expect(button.className).not.toContain("hover:");
    await click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
