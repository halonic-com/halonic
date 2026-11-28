// @vitest-environment jsdom

import { NarrowProvider } from "@halonicjs/studio-kit";
import { engineWordsOf } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AllRunsFeed } from "../app/all-runs-feed.ts";
import type { AllRunsRow } from "../app/source-rows.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { RunsAppView } from "./runs-app-view.tsx";
import { RunsTable } from "./runs-table.tsx";

afterEach(unmountAll);

const now = new Date("2026-11-25T10:00:00Z");

function row(id: string, changes: Partial<AllRunsRow> = {}): AllRunsRow {
  return {
    id,
    phase: "succeeded",
    startedAt: "2026-11-25T08:00:00Z",
    lineage: id,
    cost: { kind: "none" },
    title: "Weekly report",
    line: "Sent to 6 people",
    where: "Acme Ops",
    by: { kind: "workflow" },
    chip: { word: "Done", tone: "success" },
    label: `Run ${id}, Weekly report, done.`,
    item: { kind: "run", hub: "acme", id },
    notice: { startedByMe: false, tookMs: 120_000 },
    startedBy: { words: "Every Friday", tooltip: "Weekly report routine" },
    ...changes,
  };
}

const workspaceRow = row("run_01jd8b");
const { startedBy: _schedule, ...teamFields } = row("team_run_9c", {
  phase: "running",
  startedAt: "2026-11-24T16:00:00Z",
  title: "Ada · CTO",
  line: "ACME-7 Fix the login",
  where: "Paperclip · Acme",
  by: { kind: "agent", name: "Ada" },
  chip: { word: "Running", tone: "running", dot: true },
  label: "Running, Ada · CTO, ACME-7 Fix the login, Paperclip · Acme.",
  notice: { startedByMe: false },
});
// Paperclip doesn't say who started a team's run.
const teamRow: AllRunsRow = teamFields;
const failedRow = row("run_01jd7m", {
  phase: "failed",
  line: "Couldn't read 2 invoices",
  chip: { word: "Failed", tone: "danger" },
});
const waitingRow = row("run_01jc8t", {
  phase: "running",
  line: "Waiting until Monday 09:00",
  chip: { word: "Waiting", tone: "neutral", dot: false },
});
const cantTryRow = row("run_01jc7x", {
  phase: "failed",
  line: "Couldn't try: no model set",
  chip: { word: "Couldn't try", tone: "neutral", dot: false },
});
const dotSelector = "span.rounded-full.size-1\\.5";

function showTable(rows: readonly AllRunsRow[], read = { loaded: true, failed: false }) {
  const onOpen = vi.fn();
  const onOpenInNewTab = vi.fn();
  const root = render(
    <RunsTable
      rows={rows}
      now={now}
      timeZone="Europe/Madrid"
      loaded={read.loaded}
      failed={read.failed}
      onOpen={onOpen}
      onOpenInNewTab={onOpenInNewTab}
    />,
  );
  return { root, onOpen, onOpenInNewTab };
}

function rowText(root: HTMLElement, id: string): string {
  return root.querySelector(`[data-row-id="${id}"]`)?.textContent ?? "";
}

function feedOf(rows: readonly AllRunsRow[]): AllRunsFeed {
  const state = { rows, failures: [], loaded: true, error: undefined };
  return { state, subscribe: () => () => undefined, refresh: async () => undefined };
}

verifies("runs.runs-table", () => {
  describe("RunsTable", () => {
    it("says All runs with the Runs page's sentence over the column names", () => {
      const { root } = showTable([workspaceRow]);
      expect(root.querySelector("h2")?.textContent).toBe("All runs");
      expect(root.textContent).toContain("A run is one time a workflow or agent does its job.");
      const names = root.querySelector('[data-part="column-names"]');
      expect(names?.textContent).toBe("StatusRunWhat ranStarted byStarted");
      // Each row's sentence says it to a screen reader; the names are for the eye.
      expect(names?.getAttribute("aria-hidden")).toBe("true");
      expect(names?.firstElementChild?.className).toContain("@list-wide:flex");
    });

    it("groups the runs newest first under Today, then Yesterday", () => {
      const { root } = showTable([teamRow, workspaceRow]);
      const headings = [...root.querySelectorAll("h3")].map((heading) => heading.textContent);
      expect(headings).toEqual(["Today", "Yesterday"]);
      const ids = [...root.querySelectorAll("[data-row-id]")].map((each) =>
        each.getAttribute("data-row-id"),
      );
      expect(ids).toEqual(["run_01jd8b", "team_run_9c"]);
    });

    it("shows the chip, short id, what ran, what started it and when, with how long it took", () => {
      const { root } = showTable([workspaceRow]);
      const text = rowText(root, "run_01jd8b");
      for (const part of ["Done", "01jd8b", "Weekly report", "Sent to 6 people", "Every Friday"]) {
        expect(text).toContain(part);
      }
      // 08:00 UTC on the user's clock in Madrid.
      expect(text).toContain("9:00");
      expect(text).toContain("took 2 min");
      expect(text).toContain("Run run_01jd8b, Weekly report, done.");
    });

    it("leaves Started by empty for a team's run, and marks a running chip with its dot", () => {
      const { root } = showTable([teamRow]);
      const text = rowText(root, "team_run_9c");
      expect(text).not.toContain("Every Friday");
      expect(text).not.toContain("took");
      expect(
        root.querySelectorAll(`[data-row-id="team_run_9c"] ${dotSelector}`).length,
      ).toBeGreaterThan(0);
    });

    it("gives the dot only to a live run, not to one that waits or is done", () => {
      const { root } = showTable([waitingRow, workspaceRow]);
      expect(root.querySelectorAll(dotSelector)).toHaveLength(0);
      expect(rowText(root, "run_01jc8t")).toContain("Waiting");
    });

    it("shows the routine's name as Started by's tooltip", () => {
      const { root } = showTable([workspaceRow]);
      const words = [...root.querySelectorAll('[data-row-id="run_01jd8b"] span')].find(
        (each) => each.textContent === "Every Friday",
      );
      const tooltipId = words?.getAttribute("aria-describedby");
      expect(tooltipId).toBeTruthy();
      expect(document.getElementById(tooltipId ?? "")?.textContent).toBe("Weekly report routine");
    });

    it("says No runs yet with no column names while there are no runs", () => {
      const { root } = showTable([]);
      expect(root.querySelector("h2")?.textContent).toBe("All runs");
      expect(root.textContent).toContain("No runs yet");
      expect(root.querySelector('[data-part="column-names"]')).toBeNull();
    });

    it("shows the loading rows, not No runs yet, until every source has answered", () => {
      const { root } = showTable([], { loaded: false, failed: false });
      expect(root.textContent).not.toContain("No runs yet");
      expect(root.querySelector('[aria-busy="true"]')).not.toBeNull();
    });

    it("shows only the header when a read failed and left no runs", () => {
      const { root } = showTable([], { loaded: true, failed: true });
      expect(root.querySelector("h2")?.textContent).toBe("All runs");
      expect(root.textContent).not.toContain("No runs yet");
      expect(root.querySelector('[aria-busy="true"]')).toBeNull();
    });

    it("shows the runs it has while a source is still answering", () => {
      const { root } = showTable([workspaceRow], { loaded: false, failed: false });
      expect(rowText(root, "run_01jd8b")).toContain("Weekly report");
    });

    it("writes a failed run's line in the danger colour", () => {
      const { root } = showTable([failedRow]);
      const line = [...root.querySelectorAll('[data-row-id="run_01jd7m"] span')].find(
        (each) => each.textContent === "Couldn't read 2 invoices",
      );
      expect(line?.className).toContain("text-danger");
      // The kit's error chip, with its dot, as on the Runs page (in the wide and stacked rows).
      expect(
        root.querySelectorAll(`[data-row-id="run_01jd7m"] ${dotSelector}`).length,
      ).toBeGreaterThan(0);
    });

    it("keeps a run that couldn't try neutral, as the Runs page does", () => {
      const { root } = showTable([cantTryRow]);
      const line = [...root.querySelectorAll('[data-row-id="run_01jc7x"] span')].find(
        (each) => each.textContent === "Couldn't try: no model set",
      );
      expect(line?.className).not.toContain("text-danger");
      expect(root.querySelectorAll(dotSelector)).toHaveLength(0);
    });

    it("opens a run on a click, and in a new tab on a Ctrl-click", () => {
      const { root, onOpen, onOpenInNewTab } = showTable([workspaceRow]);
      const cell = root.querySelector<HTMLElement>('[data-row-id="run_01jd8b"] td');
      act(() => cell?.click());
      expect(onOpen).toHaveBeenCalledWith("run_01jd8b");
      act(() => cell?.dispatchEvent(new MouseEvent("click", { bubbles: true, ctrlKey: true })));
      expect(onOpenInNewTab).toHaveBeenCalledWith("run_01jd8b");
    });
  });

  describe("RunsAppView's runs table", () => {
    function showView(rows: readonly AllRunsRow[]) {
      return render(
        <NarrowProvider narrow={false}>
          <RunsAppView
            feed={feedOf(rows)}
            engine={engineWordsOf({})}
            runPane={(item) => <button type="button">{`Run again ${item.id}`}</button>}
            now={() => now}
            timeZone="Europe/Madrid"
          />
        </NarrowProvider>,
      );
    }

    function pressTableRow(root: HTMLElement, id: string) {
      const cell = root.querySelector<HTMLElement>(
        `[data-part="runs-table"] [data-row-id="${id}"] [role="gridcell"]`,
      );
      // jsdom's click doesn't move the focus, so the row takes it first, as a real press would.
      act(() => cell?.focus());
      act(() => cell?.click());
    }

    it("replaces the table with the run's page and focuses its first button", () => {
      const root = showView([workspaceRow]);
      pressTableRow(root, "run_01jd8b");
      expect(root.querySelector('[data-part="runs-table"]')).toBeNull();
      expect(document.activeElement?.textContent).toBe("Run again run_01jd8b");
    });

    it("counts a run opened from the table, so its failure leaves Failed in the list", () => {
      const root = showView([failedRow]);
      const listHeadings = () =>
        [...root.querySelectorAll('[data-part="list-column"] h2')].map((each) => each.textContent);
      expect(listHeadings()).toContain("Failed");
      pressTableRow(root, "run_01jd7m");
      expect(listHeadings()).not.toContain("Failed");
    });
  });
});
