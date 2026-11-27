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
    it("shows a workflow run in the pane on a click or Enter", () => {
      const show = vi.fn();
      rowActions(rows, { show }).onOpen("w1");
      expect(show).toHaveBeenCalledWith(workflowRun);
    });

    it("opens a workflow run in a new tab on a Ctrl, Cmd or middle click, and leaves the pane", () => {
      const show = vi.fn();
      const openInNewTab = vi.fn();
      rowActions(rows, { show, openInNewTab }).onOpenInNewTab?.("w1");
      expect(openInNewTab).toHaveBeenCalledWith(workflowRun);
      expect(show).not.toHaveBeenCalled();
    });

    it("does nothing for an agent's run, which has no page yet", () => {
      const show = vi.fn();
      const openInNewTab = vi.fn();
      const actions = rowActions(rows, { show, openInNewTab });
      actions.onOpen("a1");
      actions.onOpenInNewTab?.("a1");
      expect(show).not.toHaveBeenCalled();
      expect(openInNewTab).not.toHaveBeenCalled();
    });

    it("has no new-tab gesture where the window has no tabs", () => {
      expect(rowActions(rows, { show: vi.fn() }).onOpenInNewTab).toBeUndefined();
    });
  });

  describe("paneContext", () => {
    function contextWith(openItem: (...args: unknown[]) => void): PlaceViewProps["context"] {
      return { openItem } as unknown as PlaceViewProps["context"];
    }

    it("shows a run the pane's page opens in the pane", () => {
      const openItem = vi.fn();
      const show = vi.fn();
      paneContext(contextWith(openItem), show).openItem?.({ kind: "run", hub: "acme", id: "w2" });
      expect(show).toHaveBeenCalledWith({ kind: "run", hub: "acme", id: "w2" });
      expect(openItem).not.toHaveBeenCalled();
    });

    it("opens a run asked for at a step, and any other item, as the shell does", () => {
      const openItem = vi.fn();
      const show = vi.fn();
      const context = paneContext(contextWith(openItem), show);
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
  });
});
