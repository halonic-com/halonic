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

  it("ends the title line with the titleEnd, never cut, after a title that is", () => {
    const rows: readonly ListRow[] = [
      { id: "digest", title: "Weekly digest", titleEnd: "7 min", meta: "Writing the summary" },
    ];
    const { container } = render(<List label="Runs" rows={rows} />);
    const end = mainCell(container, 0).querySelector('[data-part="title-end"]');
    expect(end?.textContent).toBe("7 min");
    expect(end?.className).toContain("shrink-0");
    expect(end?.previousElementSibling?.textContent).toBe("Weekly digest");
    expect(end?.previousElementSibling?.className).toContain("truncate");
  });

  it("pads a row with a part under its meta line, which grows it past its height", () => {
    const rows: readonly ListRow[] = [
      { id: "digest", title: "Weekly digest", meta: "Done in 2 min", under: <span>Acme Ops</span> },
    ];
    const { container } = render(<List label="Runs" rows={rows} />);
    expect(mainCell(container, 0).firstElementChild?.className).toContain("py-2");
  });
});
