import type { PlaceViewProps } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it, vi } from "vitest";
import { paneContext, rowActions, runsPanes } from "./runs-panes.ts";
import type { AllRunsRow } from "./source-rows.ts";

function row(id: string, item?: AllRunsRow["item"]): AllRunsRow {
  return {
    id,
    phase: "succeeded",
    startedAt: "2026-11-25T08:00:00Z",
    lineage: id,
    cost: { kind: "none" },
    title: "Support reply",
    line: "Finished",
    where: "Acme Ops",
    by: item === undefined ? { kind: "agent", name: "Ada" } : { kind: "workflow" },
    chip: { word: "Done", tone: "success" },
    label: `Run ${id}.`,
    notice: { startedByMe: false },
    ...(item === undefined ? {} : { item }),
  };
}

const workflowRun = { kind: "run", hub: "acme", id: "w1" } as const;
const rows = [row("w1", workflowRun), row("a1")];

function ways() {
  return { markOpened: vi.fn(), show: vi.fn(), openInNewTab: vi.fn() };
}

verifies("runs.list-column", () => {
  describe("runsPanes", () => {
    it("shows the list column and the content pane in a wide window, a run open or not", () => {
      expect(runsPanes(false, undefined)).toEqual({ list: true, run: true });
      expect(runsPanes(false, workflowRun)).toEqual({ list: true, run: true });
    });

    it("shows the list alone in one pane until a run opens, then the run alone", () => {
      expect(runsPanes(true, undefined)).toEqual({ list: true, run: false });
      expect(runsPanes(true, workflowRun)).toEqual({ list: false, run: true });
    });
  });

  describe("rowActions", () => {
    it("marks a workflow run opened and shows it in the pane on a click or Enter", () => {
      const row = ways();
      rowActions(rows, row).onOpen("w1");
      expect(row.markOpened).toHaveBeenCalledWith("w1");
      expect(row.show).toHaveBeenCalledWith(workflowRun);
    });

    it("opens a workflow run in a new tab on a Ctrl, Cmd or middle click, marks it, and leaves the pane", () => {
      const row = ways();
      rowActions(rows, row).onOpenInNewTab?.("w1");
      expect(row.openInNewTab).toHaveBeenCalledWith(workflowRun);
      expect(row.markOpened).toHaveBeenCalledWith("w1");
      expect(row.show).not.toHaveBeenCalled();
    });

    it("opens nothing for an agent's run, which has no page yet, but a click still marks it", () => {
      const row = ways();
      const actions = rowActions(rows, row);
      actions.onOpen("a1");
      expect(row.markOpened).toHaveBeenCalledWith("a1");
      row.markOpened.mockClear();
      actions.onOpenInNewTab?.("a1");
      expect(row.markOpened).not.toHaveBeenCalled();
      expect(row.show).not.toHaveBeenCalled();
      expect(row.openInNewTab).not.toHaveBeenCalled();
    });

    it("has no new-tab gesture in a context built without a window", () => {
      const { markOpened, show } = ways();
      expect(rowActions(rows, { markOpened, show }).onOpenInNewTab).toBeUndefined();
    });
  });

  describe("paneContext", () => {
    function contextWith(
      openItem: (...args: unknown[]) => void,
      openPlace: (...args: unknown[]) => void = vi.fn(),
    ): PlaceViewProps["context"] {
      return { openItem, openPlace } as unknown as PlaceViewProps["context"];
    }

    it("shows a run the pane's page opens in the pane", () => {
      const openItem = vi.fn();
      const show = vi.fn();
      const context = paneContext(contextWith(openItem), { show, close: vi.fn() });
      context.openItem?.({ kind: "run", hub: "acme", id: "w2" });
      expect(show).toHaveBeenCalledWith({ kind: "run", hub: "acme", id: "w2" });
      expect(openItem).not.toHaveBeenCalled();
    });

    it("opens a run asked for at a step, and any other item, as the shell does", () => {
      const openItem = vi.fn();
      const show = vi.fn();
      const context = paneContext(contextWith(openItem), { show, close: vi.fn() });
      context.openItem?.({ kind: "run", hub: "acme", id: "w2" }, { step: "draft" });
      context.openItem?.({ kind: "workflow", hub: "acme", id: "support-reply" });
      expect(openItem).toHaveBeenNthCalledWith(
        1,
        { kind: "run", hub: "acme", id: "w2" },
        { step: "draft" },
      );
      expect(openItem).toHaveBeenNthCalledWith(
        2,
        { kind: "workflow", hub: "acme", id: "support-reply" },
        undefined,
      );
      expect(show).not.toHaveBeenCalled();
    });

    it("closes the run when the pane's page leads to Runs, and opens any other place", () => {
      const openPlace = vi.fn();
      const close = vi.fn();
      const context = paneContext(contextWith(vi.fn(), openPlace), { show: vi.fn(), close });
      context.openPlace?.("runs");
      expect(close).toHaveBeenCalledOnce();
      expect(openPlace).not.toHaveBeenCalled();
      context.openPlace?.("inbox");
      expect(openPlace).toHaveBeenCalledWith("inbox");
      expect(close).toHaveBeenCalledOnce();
    });
  });
});
