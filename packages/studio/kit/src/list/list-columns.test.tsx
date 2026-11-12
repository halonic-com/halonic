// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { PresentationProvider } from "../presentation/presentation.tsx";
import { StatusChip } from "../status-chip/status-chip.tsx";
import { render, unmountAll } from "../test/render.tsx";
import { List } from "./list.tsx";
import type { ListColumn, ListRow } from "./list-props.ts";

afterEach(() => {
  vi.useRealTimers();
  unmountAll();
});

const columns: readonly ListColumn[] = [
  { kind: "status", key: "status" },
  { kind: "code", key: "run" },
  { kind: "main" },
  { kind: "text", key: "startedBy" },
  { kind: "time", key: "when" },
];

const label =
  "Run 01JD9A, Support reply, needs you, waiting for your approval: send an email. Started by an email, 12 minutes ago.";

const needsYou: ListRow = {
  id: "01JD9A",
  title: "Support reply",
  meta: "Waiting for you: Approve this reply?",
  tag: <StatusChip tone="outline">Test</StatusChip>,
  cells: {
    status: { value: <StatusChip tone="warning">Needs you</StatusChip> },
    run: { value: "01JD9A" },
    startedBy: { value: "A message arrived" },
    when: { value: "10:44", detail: "took 2 min" },
  },
  label,
};

const done: ListRow = {
  id: "01JD8W",
  title: "Mail triage",
  meta: "Sent nothing",
  cells: {
    status: { value: <StatusChip tone="success">Done</StatusChip> },
    run: { value: "01JD8W" },
  },
};

function renderRuns(rows: readonly ListRow[] = [needsYou, done], phone = false) {
  const list = <List label="Runs" rows={rows} columns={columns} onOpen={() => undefined} />;
  return render(
    phone ? <PresentationProvider presentation="phone">{list}</PresentationProvider> : list,
  );
}

function cellOf(container: HTMLElement, index: number): HTMLElement {
  return container.querySelectorAll<HTMLElement>('[role="gridcell"]')[index] as HTMLElement;
}

/** The side-by-side layout and the stacked one, in a row's main cell. */
function layoutsOf(cell: HTMLElement): { wide: Element | null; stacked: Element | null } {
  const hidden = Array.from(cell.querySelectorAll(':scope > [aria-hidden="true"]'));
  return {
    wide: hidden.find((element) => element.className.includes("@list-wide:flex")) ?? null,
    stacked: hidden.find((element) => !element.className.includes("@list-wide:flex")) ?? null,
  };
}

verifies("kit.list-columns", () => {
  it("lays the cells out side by side at fixed widths from 800px of List width", () => {
    const { container } = renderRuns();
    expect(container.querySelector(".\\@container")).not.toBeNull();
    const { wide } = layoutsOf(cellOf(container, 0));
    expect(wide?.className).toContain("hidden");
    const widths = Array.from(wide?.children ?? []).map((part) => part.className);
    expect(widths[0]).toContain("w-30");
    expect(widths[1]).toContain("w-16");
    expect(widths[1]).toContain("font-mono text-code tabular-nums");
    expect(widths[2]).toContain("min-w-50 flex-1");
    expect(widths[3]).toContain("w-48");
    expect(widths[3]).toContain("line-clamp-2");
    expect(widths[4]).toContain("w-24 shrink-0 text-right");
    expect(wide?.textContent).toBe(
      "Needs you01JD9ASupport replyTestWaiting for you: Approve this reply?A message arrived10:44took 2 min",
    );
  });

  it("stacks the row on three lines below 800px", () => {
    const { container } = renderRuns();
    const { stacked } = layoutsOf(cellOf(container, 0));
    expect(stacked?.className).toContain("@list-wide:hidden");
    const lines = Array.from(stacked?.querySelector(".flex-col")?.children ?? []);
    expect(lines.map((line) => line.textContent)).toEqual([
      "Support replyTestNeeds you",
      "Waiting for you: Approve this reply?",
      "01JD9A · A message arrived · 10:44",
    ]);
    expect(lines[1]?.className).toContain("line-clamp-2");
  });

  it("leaves out an empty column from the stacked third line", () => {
    const { container } = renderRuns();
    const { stacked } = layoutsOf(cellOf(container, 1));
    expect(stacked?.textContent).toContain("01JD8W");
    expect(stacked?.textContent).not.toContain(" · ");
  });

  it("is read as the row's label, the columns hidden; without one, title and meta line", () => {
    const { container } = renderRuns();
    const first = cellOf(container, 0);
    expect(first.querySelector(".sr-only")?.textContent).toBe(label);
    expect(first.querySelectorAll(':scope > [aria-hidden="true"]')).toHaveLength(2);
    expect(cellOf(container, 1).querySelector(".sr-only")?.textContent).toBe(
      "Mail triage, Sent nothing",
    );
  });

  it("keeps the List's keys", () => {
    const { container } = renderRuns();
    act(() => cellOf(container, 0).focus());
    act(() => {
      cellOf(container, 0).dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }),
      );
    });
    expect(document.activeElement).toBe(cellOf(container, 1));
  });

  it("puts an error's danger chip in the first status column and its reason on the meta line", () => {
    const failed: ListRow = {
      ...needsYou,
      error: { reason: "It failed in Review.", chip: "Failed" },
    };
    const { container } = renderRuns([failed]);
    const { wide } = layoutsOf(cellOf(container, 0));
    const status = wide?.children[0];
    expect(status?.textContent).toBe("Failed");
    expect(status?.querySelector(".bg-danger-soft")).not.toBeNull();
    expect(status?.querySelector(".rounded-full")).not.toBeNull();
    expect(wide?.children[2]?.querySelector(".text-small.text-danger")?.textContent).toBe(
      "It failed in Review.",
    );
  });

  it("dims an unavailable row's text, keeps its chips, and is described by its reason", () => {
    const waiting: ListRow = { ...needsYou, unavailable: { reason: "Still downloading" } };
    const { container } = renderRuns([waiting]);
    const cell = cellOf(container, 0);
    const { wide } = layoutsOf(cell);
    expect(wide?.querySelector(".text-body-strong")?.className).toContain("text-fg-disabled");
    expect(wide?.children[3]?.className).toContain("text-fg-disabled");
    expect(wide?.querySelector(".bg-warning-soft")).not.toBeNull();
    const reason = document.getElementById(cell.getAttribute("aria-describedby") ?? "");
    expect(reason?.textContent).toBe("Still downloading");
  });

  it("always stacks on a phone, with the tag first on the third line", () => {
    const { container } = renderRuns([needsYou], true);
    const cell = cellOf(container, 0);
    const { wide, stacked } = layoutsOf(cell);
    expect(wide).toBeNull();
    expect(stacked?.className).not.toContain("@list-wide:hidden");
    const lines = Array.from(stacked?.querySelector(".flex-col")?.children ?? []);
    expect(lines[0]?.textContent).toBe("Support replyNeeds you");
    expect(lines[2]?.textContent).toBe("Test01JD9A · A message arrived · 10:44");
  });

  it("on a phone, next to a More button, puts the chip at the start of the second line", () => {
    const withMore: ListRow = { ...needsYou, more: { label: "More", onClick: () => undefined } };
    const { container } = renderRuns([withMore], true);
    const { stacked } = layoutsOf(cellOf(container, 0));
    const lines = Array.from(stacked?.querySelector(".flex-col")?.children ?? []);
    expect(lines[0]?.textContent).toBe("Support reply");
    expect(lines[1]?.textContent).toBe("Needs youWaiting for you: Approve this reply?");
  });

  it("gives the skeleton rows a bar in each column while it loads", () => {
    vi.useFakeTimers();
    const { container } = render(
      <List label="Runs" rows={[]} columns={columns} loading loadingLabel="Loading runs" />,
    );
    act(() => {
      vi.advanceTimersByTime(300);
    });
    const rows = container.querySelectorAll(".\\@list-wide\\:flex");
    expect(rows).toHaveLength(3);
    const widths = Array.from(rows[0]?.children ?? []).map((part) => part.className);
    expect(widths).toEqual([
      "w-30 shrink-0",
      "w-16 shrink-0",
      "min-w-50 flex-1",
      "w-48 shrink-0",
      "w-24 shrink-0 text-right",
    ]);
  });
});
