// @vitest-environment jsdom

import { type Presentation, PresentationProvider } from "@halonicjs/studio-kit";
import { afterEach, describe, expect, it } from "vitest";
import { render, unmountAll } from "../test-support/render.tsx";
import { NameAndHubRow, NewItemNote } from "./new-item-parts.tsx";

afterEach(unmountAll);

function row(presentation: Presentation, withHub: boolean): HTMLElement {
  const container = render(
    <PresentationProvider presentation={presentation}>
      <NameAndHubRow name={<input />} hub={withHub ? <select /> : undefined} />
    </PresentationProvider>,
  );
  return container.firstElementChild as HTMLElement;
}

describe("NameAndHubRow", () => {
  it("puts the Hub picker at the right of the name on a computer, in a column that can shrink", () => {
    const grid = row("desktop", true);
    expect(grid.className).toContain("grid-cols-[minmax(0,1fr)_160px]");
    expect(grid.children).toHaveLength(2);
  });

  // e2e/new-item-row.spec.ts checks the boxes at 195px in a real browser.
  it("puts the Hub picker under the name on a phone, in one column that can shrink", () => {
    const grid = row("phone", true);
    expect(grid.className).toContain("grid-cols-[minmax(0,1fr)]");
    expect(grid.className).not.toContain("160px");
    expect(grid.children).toHaveLength(2);
  });

  it("is one column that can shrink with only one hub", () => {
    const grid = row("desktop", false);
    expect(grid.className).toContain("grid-cols-[minmax(0,1fr)]");
    expect(grid.className).not.toContain("160px");
    expect(grid.children).toHaveLength(1);
  });
});

describe("NewItemNote", () => {
  it("carries the id the dialog names as its description, and its text", () => {
    const note = render(<NewItemNote id="note">It starts with a step.</NewItemNote>)
      .firstElementChild as HTMLElement;
    expect(note.id).toBe("note");
    expect(note.textContent).toBe("It starts with a step.");
  });

  it("sits the icon on the first line, in an icon-sized box hidden from screen readers", () => {
    const note = render(<NewItemNote id="note">It starts with a step.</NewItemNote>)
      .firstElementChild as HTMLElement;
    expect(note.className).toContain("items-start");
    const icon = note.querySelector("svg")?.parentElement;
    expect(icon?.className).toContain("size-icon-sm");
    expect(icon?.className).toContain("*:size-full");
    expect(icon?.className).toContain("mt-0.5");
    expect(icon?.getAttribute("aria-hidden")).toBe("true");
  });
});
