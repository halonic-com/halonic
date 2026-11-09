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

/** The element that names a section: its title heading or caption label. */
function nameElement(section: Element): HTMLElement {
  return document.getElementById(section.getAttribute("aria-labelledby") ?? "") as HTMLElement;
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
    // @ts-expect-error Actions sit in a header, so a card without a title or label has none.
    const headless = <Card actions={run} children="…" />;
    expect([both, nested, headless]).toHaveLength(3);
  });

  it("is one button as a whole when interactive, lifting its edge on hover", async () => {
    const onClick = vi.fn();
    const { container } = render(<Card onClick={onClick}>Daily digest</Card>);
    const button = container.querySelector("button") as HTMLButtonElement;
    expect(button.type).toBe("button");
    expect(button.className).toContain("hover:shadow-1");
    expect(button.className).toContain("hover:border-border-strong");
    expect(button.className).toContain("contrast-more:hover:border-fg-muted");
    expect(button.className).toContain("focus-ring");
    expect(button.className).toContain("active:bg-surface-subtle");
    // Tailwind's default list already holds the colours and the shadow: no bracket value.
    expect(button.className.split(" ")).toContain("transition");
    expect(button.className).not.toContain("transition-[");
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

  it("keeps its actions when the title turns out empty, in an unnamed header row", () => {
    const name = "";
    const { container } = render(
      <Card title={name && `Agents of ${name}`} actions={<button type="button">Add</button>}>
        No agents yet
      </Card>,
    );
    const card = container.firstElementChild as HTMLElement;
    expect(card.tagName).toBe("DIV");
    expect(card.hasAttribute("aria-labelledby")).toBe(false);
    expect(card.querySelector("h1, h2, h3, h4")).toBeNull();
    const row = card.firstElementChild as HTMLElement;
    expect(row.className).toContain("border-b border-border px-4 py-3");
    expect(row.textContent).toBe("Add");
    expect(card.lastElementChild?.textContent).toBe("No agents yet");
  });

  it("shows an error with a danger edge", () => {
    const { container } = render(<Card state="error">Last run failed</Card>);
    expect((container.firstElementChild as HTMLElement).className).toContain("border-danger");
  });

  it("keeps its danger edge on hover when interactive", () => {
    const { container } = render(
      <Card state="error" onClick={() => {}}>
        Last run failed
      </Card>,
    );
    const button = container.querySelector("button") as HTMLButtonElement;
    expect(button.className).toContain("border-danger");
    expect(button.className).toContain("hover:shadow-1");
    expect(button.className).not.toContain("hover:border-");
  });

  it("is disabled with fg-disabled text and no hover, and still opens", async () => {
    const onClick = vi.fn();
    const { container } = render(
      <Card state="disabled" onClick={onClick}>
        Paused
      </Card>,
    );
    const button = container.querySelector("button") as HTMLButtonElement;
    // It has no header, so the box itself fades.
    expect(button.className).toContain("text-fg-disabled");
    expect(button.className).not.toContain("hover:");
    await click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("fades only the name of a disabled card, so the reason and the header's switch keep their look", () => {
    const { container } = render(
      <Card title="Mail triage" state="disabled" actions={<button type="button">Turn on</button>}>
        <span className="text-fg-muted">Paused</span>
      </Card>,
    );
    const section = container.querySelector("section") as HTMLElement;
    expect(section.className).not.toContain("text-fg-disabled");
    expect(nameElement(section).className).toContain("text-fg-disabled");
    expect(section.querySelector("button")?.closest(".text-fg-disabled")).toBeNull();
  });

  it("fades a disabled card's caption label in place of its fg-muted", () => {
    const { container } = render(
      <Card label="When" state="disabled">
        Every weekday at 9:00
      </Card>,
    );
    const label = nameElement(container.querySelector("section") as HTMLElement);
    expect(label.className).toContain("text-fg-disabled");
    expect(label.className).not.toContain("text-fg-muted");
  });

  it("fades the box of a disabled card without a header", () => {
    const { container } = render(<Card state="disabled">Not connected</Card>);
    expect((container.firstElementChild as HTMLElement).className).toContain("text-fg-disabled");
  });
});
