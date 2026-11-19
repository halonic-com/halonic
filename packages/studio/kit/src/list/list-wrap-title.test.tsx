// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, expect, it } from "vitest";
import { StatusChip } from "../status-chip/status-chip.tsx";
import { render, unmountAll } from "../test/render.tsx";
import { List } from "./list.tsx";
import type { ListRow } from "./list-props.ts";

afterEach(() => {
  unmountAll();
});

const run: ListRow = {
  id: "run_2ff090",
  title: "Support reply · run 2ff090",
  meta: "Waiting for you to approve the reply",
  trailing: <StatusChip tone="attention">Needs you</StatusChip>,
};

/** The row's main cell's inside: the text column, then the trailing chip. */
function rowParts(row: ListRow): Element[] {
  const { container } = render(<List label="Recent runs" rows={[row]} />);
  const cell = container.querySelector('[role="gridcell"]');
  return Array.from(cell?.firstElementChild?.children ?? []);
}

verifies("kit.list-wrap-title", () => {
  it("wraps the title instead of cutting it, keeps the meta line cut and the chip right", () => {
    const [text, trailing] = rowParts({ ...run, wrapTitle: true });
    expect(text?.children[0]?.className).toBe("wrap-break-word text-body-strong text-fg");
    expect(text?.children[1]?.className).toContain("truncate");
    expect(trailing?.textContent).toBe("Needs you");
    expect(text?.parentElement?.className).toContain("py-2");
  });

  it("cuts the title of a row without wrapTitle", () => {
    const [text] = rowParts(run);
    expect(text?.children[0]?.className).toBe("truncate text-body-strong text-fg");
    expect(text?.parentElement?.className).not.toContain("py-2");
  });
});
