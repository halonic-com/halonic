// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, expect, it } from "vitest";
import { render, unmountAll } from "../test/render.tsx";
import { NoteLines } from "./note-lines.tsx";

afterEach(() => {
  unmountAll();
});

const temperature = "Left out temperature: claude-sonnet-5-5 doesn't take it.";
const topP = "Left out top_p: claude-sonnet-5-5 doesn't take it.";

verifies("kit.note-lines", () => {
  it("is a named list with one line per note, in order", () => {
    const { container } = render(
      <NoteLines label="Notes on this run" notes={[temperature, topP]} />,
    );
    const list = container.querySelector("ul") as HTMLUListElement;
    expect(list.getAttribute("aria-label")).toBe("Notes on this run");
    expect(list.className).toContain("flex flex-col gap-1 px-4");
    const items = Array.from(list.querySelectorAll("li"));
    expect(items.map((item) => item.querySelector("p")?.textContent)).toEqual([temperature, topP]);
  });

  it("shows the info mark and the note in fg-muted small text", () => {
    const { container } = render(<NoteLines label="Notes" notes={[temperature]} />);
    const item = container.querySelector("li") as HTMLLIElement;
    expect(item.className).toContain("flex items-start gap-3 text-small text-fg-muted");
    const icon = item.firstElementChild as HTMLElement;
    expect(icon.getAttribute("aria-hidden")).toBe("true");
    expect(icon.className).toContain("mt-0.5 inline-grid size-icon-sm shrink-0");
    expect(icon.querySelector("svg circle")).not.toBeNull();
  });

  it("wraps a long note whole, never shortened", () => {
    const { container } = render(<NoteLines label="Notes" notes={[temperature]} />);
    const text = container.querySelector("p") as HTMLParagraphElement;
    expect(text.className).toContain("min-w-0 flex-1 wrap-break-word");
    expect(container.innerHTML).not.toContain("truncate");
    expect(container.innerHTML).not.toContain("line-clamp");
  });

  it("is a plain list: no fill, no border, no action, not live", () => {
    const { container } = render(<NoteLines label="Notes" notes={[temperature]} />);
    expect(container.innerHTML).not.toMatch(/\bbg-|\bborder\b/);
    expect(container.querySelector("button, a")).toBeNull();
    expect(container.querySelector("[aria-live], [role]")).toBeNull();
  });

  it("shows a note as plain text, not markup", () => {
    const { container } = render(<NoteLines label="Notes" notes={["<b>x</b> [link](y)"]} />);
    expect(container.querySelector("b, a")).toBeNull();
    expect(container.querySelector("p")?.textContent).toBe("<b>x</b> [link](y)");
  });

  it("renders nothing without notes", () => {
    const { container } = render(<NoteLines label="Notes" notes={[]} />);
    expect(container.innerHTML).toBe("");
  });
});
