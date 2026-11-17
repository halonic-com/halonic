// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, expect, it, vi } from "vitest";
import { render, unmountAll } from "../test/render.tsx";
import { List } from "./list.tsx";
import type { ListRow } from "./list-props.ts";

afterEach(() => {
  unmountAll();
});

const plugins: readonly ListRow[] = [
  { id: "git", title: "Git", meta: "Reads repositories" },
  { id: "mail", title: "Mail" },
];

function mainCell(container: HTMLElement, index: number): HTMLElement {
  return container.querySelectorAll("tr")[index]?.querySelector('[role="gridcell"]') as HTMLElement;
}

verifies("kit.list", () => {
  it("shows no pointer or hover on a row that has no onOpen and no selection", () => {
    const { container } = render(<List label="Plugins" rows={plugins} />);
    const cell = mainCell(container, 0);
    expect(cell.className).toContain("cursor-default");
    expect(cell.className).not.toContain("cursor-pointer");
    expect(cell.className).not.toContain("hover:");
    expect(cell.className).not.toContain("active:");
  });

  it("keeps the pointer and hover on a row that can only be selected", () => {
    const { container } = render(
      <List
        label="Plugins"
        rows={plugins}
        selection={{ selected: new Set(), onToggle: vi.fn() }}
      />,
    );
    const cell = mainCell(container, 0);
    expect(cell.className).toContain("cursor-pointer");
    expect(cell.className).toContain("hover:");
  });
});
