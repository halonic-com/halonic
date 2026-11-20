// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, expect, it } from "vitest";
import { render, unmountAll } from "../test/render.tsx";
import { List } from "./list.tsx";
import type { ListRow } from "./list-props.ts";

afterEach(() => {
  unmountAll();
});

function mainCell(container: HTMLElement, index: number): HTMLElement {
  return container.querySelectorAll("tr")[index]?.querySelector('[role="gridcell"]') as HTMLElement;
}

verifies("kit.list", () => {
  it("clips the meta line's screen-reader-only words with the line, so a long row can't widen the page", () => {
    // `sr-only` is absolute: without a positioned line it escapes the cut and sits past the row's end.
    const meta = (
      <>
        Last run <span className="sr-only">completed, </span>Today
      </>
    );
    const rows: readonly ListRow[] = [{ id: "reply", title: "Support reply", meta }];
    const { container } = render(<List label="Workflows" rows={rows} />);
    const hidden = mainCell(container, 0).querySelector(".sr-only");
    expect(hidden?.parentElement?.className).toContain("relative");
    expect(hidden?.parentElement?.className).toContain("truncate");
  });
});
