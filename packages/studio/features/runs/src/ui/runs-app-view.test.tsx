// @vitest-environment jsdom
import { engineWordsOf, type PlaceViewProps } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type AllRunsFeed, type AllRunsFeedState, AllRunsService } from "../app/all-runs-feed.ts";
import type { AllRunsRow } from "../app/source-rows.ts";
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

function show(feed: AllRunsFeed) {
  const openRun = vi.fn();
  const root = render(
    <RunsAppView
      feed={feed}
      engine={engineWordsOf({})}
      openRun={openRun}
      now={() => now}
      timeZone="Europe/Madrid"
    />,
  );
  return { root, openRun };
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

    it("opens a workspace run's page, and nothing yet for an agent's run", () => {
      const { root, openRun } = show(feedOf({ rows: [teamRow, workspaceRow] }));
      act(() => root.querySelector<HTMLElement>('[data-row-id="a1"] td')?.click());
      expect(openRun).not.toHaveBeenCalled();
      act(() => root.querySelector<HTMLElement>('[data-row-id="w1"] td')?.click());
      expect(openRun).toHaveBeenCalledWith({ kind: "run", hub: "acme", id: "w1" });
    });
  });
});
