// @vitest-environment jsdom

import { NarrowProvider, PresentationProvider } from "@halonicjs/studio-kit";
import { engineWordsOf, type PlaceViewProps } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type AllRunsFeed, type AllRunsFeedState, AllRunsService } from "../app/all-runs-feed.ts";
import type { AllRunsRow } from "../app/source-rows.ts";
import { RunsList, RunsListService } from "../runs-list.ts";
import { fakeSource } from "../source.test-helper.ts";
import { summaryWith } from "../summary.test-helper.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { RunsAppView } from "./runs-app-view.tsx";
import { RunsPage } from "./runs-page.tsx";

afterEach(unmountAll);

const now = new Date("2026-11-25T10:00:00Z");

function row(id: string, changes: Partial<AllRunsRow> = {}): AllRunsRow {
  return {
    id,
    phase: "succeeded",
    startedAt: "2026-11-25T08:00:00Z",
    lineage: id,
    cost: { kind: "none" },
    title: "Support reply",
    line: "Finished",
    where: "Acme Ops",
    by: { kind: "workflow" },
    chip: { word: "Done", tone: "success" },
    label: `Run ${id}, Support reply, finished.`,
    notice: { startedByMe: false },
    ...changes,
  };
}

const workspaceRow = row("w1", { item: { kind: "run", hub: "acme", id: "w1" } });
const teamRow = row("a1", {
  startedAt: "2026-11-25T09:00:00Z",
  title: "Ada · CTO",
  line: "ACME-7 Fix the login",
  where: "Paperclip · Acme",
  by: { kind: "agent", name: "Ada" },
});

function feedOf(changes: Partial<AllRunsFeedState>): AllRunsFeed {
  const state = { rows: [], failures: [], loaded: true, error: undefined, ...changes };
  return { state, subscribe: () => () => undefined, refresh: async () => undefined };
}

function show(feed: AllRunsFeed, narrow = false) {
  const openInNewTab = vi.fn();
  const root = render(
    <NarrowProvider narrow={narrow}>
      <RunsAppView
        feed={feed}
        engine={engineWordsOf({})}
        runPane={(item) => <p data-testid="run-pane">{`Run page ${item.id}`}</p>}
        openInNewTab={openInNewTab}
        now={() => now}
        timeZone="Europe/Madrid"
      />
    </NarrowProvider>,
  );
  return { root, openInNewTab };
}

function clickRow(root: HTMLElement, id: string) {
  act(() => root.querySelector<HTMLElement>(`[data-row-id="${id}"] td`)?.click());
}

function paneText(root: HTMLElement): string | null | undefined {
  return root.querySelector('[data-part="run-pane"]')?.textContent;
}

verifies("runs.app-sources", () => {
  describe("RunsAppView", () => {
    it("lists a team's runs next to the workspace's", () => {
      const { root } = show(feedOf({ rows: [teamRow, workspaceRow] }));
      const content = root.textContent ?? "";
      expect(content).toContain("Ada · CTO");
      expect(content).toContain("ACME-7 Fix the loginPaperclip · Acme");
      expect(content).toContain("FinishedAcme Ops");
    });

    it("says which source couldn't be read, over the rows it kept", () => {
      const error = Object.assign(new Error("no answer"), { reason: "Paperclip didn't answer." });
      const { root } = show(
        feedOf({
          rows: [workspaceRow],
          failures: [{ source: { id: "paperclip:globex", name: "Paperclip · Globex" }, error }],
          error: new Error("listing failed"),
        }),
      );
      const lines = [...root.querySelectorAll("p.text-small")].map((line) => line.textContent);
      expect(lines[0]).toContain("Couldn't list your workspaces and teams.");
      expect(lines[1]).toContain("Couldn't refresh the runs of Paperclip · Globex.");
      expect(root.textContent).toContain("FinishedAcme Ops");
    });

    it("is the Runs page where the app provides every source's runs", () => {
      const feed = feedOf({ rows: [teamRow] });
      const services = { find: (key: unknown) => (key === AllRunsService ? feed : undefined) };
      const context = { services, openItem: vi.fn() } as unknown as PlaceViewProps["context"];
      const root = render(<RunsPage context={context} />);
      expect(root.textContent).toContain("ACME-7 Fix the loginPaperclip · Acme");
    });

    it("shows a workspace run in the pane, and nothing yet for an agent's run", () => {
      const { root } = show(feedOf({ rows: [teamRow, workspaceRow] }));
      clickRow(root, "a1");
      expect(paneText(root)).toContain("No run open");
      clickRow(root, "w1");
      expect(paneText(root)).toBe("Run page w1");
    });
  });
});

verifies("runs.list-column", () => {
  describe("RunsAppView's two columns", () => {
    it("shows the list column and an empty content pane while no run is open", () => {
      const { root } = show(feedOf({ rows: [workspaceRow] }));
      expect(root.querySelector('[data-part="list-column"]')?.className).toContain("max-w-[380px]");
      expect(paneText(root)).toBe("No run openPick a run in the list to see its steps.");
    });

    it("marks the open run's row as the current one", () => {
      const { root } = show(feedOf({ rows: [teamRow, workspaceRow] }));
      clickRow(root, "w1");
      // The kit marks the row and its open control, so the rows they sit in are compared.
      const current = [...root.querySelectorAll("[aria-current]")].map((marked) =>
        marked.closest("[data-row-id]")?.getAttribute("data-row-id"),
      );
      expect(new Set(current)).toEqual(new Set(["w1"]));
    });

    it("opens a run in a new tab on a Ctrl-click and leaves the pane empty", () => {
      const { root, openInNewTab } = show(feedOf({ rows: [workspaceRow] }));
      const cell = root.querySelector<HTMLElement>('[data-row-id="w1"] td');
      act(() => cell?.dispatchEvent(new MouseEvent("click", { bubbles: true, ctrlKey: true })));
      expect(openInNewTab).toHaveBeenCalledWith({ kind: "run", hub: "acme", id: "w1" });
      expect(paneText(root)).toContain("No run open");
    });

    it("takes an agent's failed run out of Failed on a click, though nothing opens", () => {
      const { root } = show(feedOf({ rows: [{ ...teamRow, phase: "failed" }] }));
      const headings = () => [...root.querySelectorAll("h2")].map((heading) => heading.textContent);
      expect(headings()).toContain("Failed");
      clickRow(root, "a1");
      expect(headings()).not.toContain("Failed");
      expect(paneText(root)).toContain("No run open");
    });

    it("shows the list, then the run alone with Back to Runs, moving the focus, in one pane", () => {
      const { root } = show(feedOf({ rows: [workspaceRow] }), true);
      expect(root.querySelector('[data-part="run-pane"]')).toBeNull();
      clickRow(root, "w1");
      expect(root.querySelector('[data-part="list-column"]')).toBeNull();
      expect(paneText(root)).toBe("Back to RunsRun page w1");
      const back = document.activeElement as HTMLElement | null;
      expect(back?.textContent).toBe("Back to Runs");
      act(() => back?.click());
      expect(root.querySelector('[data-part="run-pane"]')).toBeNull();
      expect(document.activeElement?.closest("[data-row-id]")?.getAttribute("data-row-id")).toBe(
        "w1",
      );
    });
  });

  describe("RunsPage's content pane", () => {
    it("shows the open run's title on a phone, where the top bar says Runs", async () => {
      const run = summaryWith({ id: "run_a_7k2m9p" });
      const list = new RunsList(fakeSource([run]).source);
      await act(() => list.refresh());
      const feed = feedOf({
        rows: [row(run.id, { item: { kind: "run", hub: "acme", id: run.id } })],
      });
      const services = {
        find: (key: unknown) => (key === AllRunsService ? feed : undefined),
        get: (key: unknown) => (key === RunsListService ? list : undefined),
      };
      const announcer = { announce: vi.fn(), announceState: vi.fn() };
      const context = { services, openItem: vi.fn(), announcer };
      const root = render(
        <PresentationProvider presentation="phone">
          <NarrowProvider narrow>
            <RunsPage context={context as unknown as PlaceViewProps["context"]} />
          </NarrowProvider>
        </PresentationProvider>,
      );
      clickRow(root, run.id);
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      const heading = root.querySelector('[data-part="run-pane"] h1');
      expect(heading?.textContent).toBe("Run 7k2m9p");
      expect(heading?.className).not.toContain("sr-only");
    });

    it("closes a run that left the workspace when its page leads to Runs", async () => {
      const { source } = fakeSource([]);
      const list = new RunsList(source);
      await act(() => list.refresh());
      const feed = feedOf({ rows: [workspaceRow] });
      const openPlace = vi.fn();
      const services = {
        find: (key: unknown) => (key === AllRunsService ? feed : undefined),
        get: (key: unknown) => (key === RunsListService ? list : undefined),
      };
      const announcer = { announce: vi.fn(), announceState: vi.fn() };
      const context = { services, openItem: vi.fn(), openPlace, announcer };
      const root = render(<RunsPage context={context as unknown as PlaceViewProps["context"]} />);
      clickRow(root, "w1");
      const goToRuns = await vi.waitFor(() => {
        const button = [...root.querySelectorAll("button")].find((each) =>
          each.textContent?.includes("Go to Runs"),
        );
        if (button === undefined) throw new Error("no Go to Runs yet");
        return button;
      });
      act(() => goToRuns.click());
      expect(openPlace).not.toHaveBeenCalled();
      expect(paneText(root)).toContain("No run open");
    });
  });
});
