// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import type { ReactNode } from "react";
import { afterEach, expect, it } from "vitest";
import { PresentationProvider } from "../presentation/presentation.tsx";
import { render, unmountAll } from "../test/render.tsx";
import { List } from "./list.tsx";
import type { ListColumn, ListColumnsRow, ListRow } from "./list-props.ts";

/*
 * An error's reason says what to fix, so it wraps and is never cut, and on a phone its chip moves
 * to a line of its own above it (C348 A8, HAL-16895).
 */

afterEach(() => {
  unmountAll();
});

const reason = "Line 11: options needs at least one choice, and this one has none yet.";
const more = { label: "More actions for triage.yaml", onClick: () => undefined };

const broken: ListRow = {
  id: "file:agents/triage.yaml",
  title: "triage.yaml",
  error: { reason, chip: "1 problem" },
};

function onPhone(list: ReactNode): ReactNode {
  return <PresentationProvider presentation="phone">{list}</PresentationProvider>;
}

/** The text column of the first row: the title, then what comes under it. */
function textColumn(container: HTMLElement): Element | null {
  return container.querySelector('[role="gridcell"] .flex-col');
}

/** The element whose own text is the reason. */
function reasonLine(container: HTMLElement): Element | undefined {
  return [...container.querySelectorAll(".text-danger")].find(
    (each) => each.textContent === reason,
  );
}

verifies("kit.list", () => {
  it("wraps an error's reason rather than cutting it, with the chip still on the right", () => {
    const { container } = render(<List label="Problems" rows={[broken]} onOpen={() => {}} />);
    const line = reasonLine(container);
    expect(line?.className).toContain("wrap-break-word");
    expect(line?.className).not.toContain("truncate");
    expect(line?.className).not.toContain("line-clamp");
    expect(textColumn(container)?.textContent).not.toContain("1 problem");
  });

  it("puts a phone row's error chip on a line of its own above the reason", () => {
    const rows = [{ ...broken, more }];
    const { container } = render(onPhone(<List label="Agents" rows={rows} onOpen={() => {}} />));
    const [title, under] = Array.from(textColumn(container)?.children ?? []);
    expect(title?.textContent).toBe("triage.yaml");
    expect(under?.className).toContain("flex-col");
    const [chipLine, line] = Array.from(under?.children ?? []);
    expect(chipLine?.textContent).toBe("1 problem");
    expect(chipLine?.querySelector(".rounded-full")).not.toBeNull();
    expect(line?.textContent).toBe(reason);
    expect(line?.className).toContain("wrap-break-word");
  });

  it("keeps a phone row's other chips at the start of its meta line", () => {
    const rows = [{ id: "a", title: "Sorter", meta: "Sorts mail", trailing: "Ready", more }];
    const { container } = render(onPhone(<List label="Agents" rows={rows} onOpen={() => {}} />));
    const [, under] = Array.from(textColumn(container)?.children ?? []);
    expect(under?.className).not.toContain("flex-col");
    expect(under?.querySelector(".truncate")?.textContent).toBe("Sorts mail");
  });
});

const columns: readonly ListColumn[] = [{ kind: "status", key: "status" }, { kind: "main" }];

const failed: ListColumnsRow = {
  id: "01JD9A",
  title: "Support reply",
  error: { reason, chip: "Failed" },
  label: "Run 01JD9A, Support reply, failed.",
};

verifies("kit.list-columns", () => {
  it("wraps an error's reason in both layouts", () => {
    const { container } = render(
      <List label="Runs" rows={[failed]} columns={columns} onOpen={() => {}} />,
    );
    const lines = [...container.querySelectorAll(".text-danger")].filter(
      (each) => each.textContent === reason,
    );
    expect(lines).toHaveLength(2);
    for (const line of lines) {
      expect(line.className).toContain("wrap-break-word");
      expect(line.className).not.toContain("truncate");
      expect(line.className).not.toContain("line-clamp");
    }
  });

  it("puts a phone row's error chip on a line of its own above the reason", () => {
    const rows = [{ ...failed, more }];
    const { container } = render(
      onPhone(<List label="Runs" rows={rows} columns={columns} onOpen={() => {}} />),
    );
    const line = reasonLine(container);
    const chipLine = line?.previousElementSibling;
    expect(chipLine?.textContent).toBe("Failed");
    expect(line?.textContent).toBe(reason);
  });
});
