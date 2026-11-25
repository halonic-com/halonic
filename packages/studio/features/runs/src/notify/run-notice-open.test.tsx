// @vitest-environment jsdom
import type { NoticeTarget, RunNoticeClicks } from "@halonicjs/studio-services";
import type { ItemRef, SidebarPlace, WorkspaceContext } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { RunsList } from "../runs-list.ts";
import { fakeSource } from "../source.test-helper.ts";
import { mondayMorning, summaryWith } from "../summary.test-helper.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { followRunNotices } from "../ui/run-notice-host.tsx";
import { RunsView } from "../ui/runs-page.tsx";
import { openRunNotice } from "./run-notice-open.ts";

afterEach(unmountAll);

const failed = summaryWith({ id: "run_d_9x8y7z", status: "failed" });
const done = summaryWith({ id: "run_c_4f2a1b", status: "completed" });

/** A list that has loaded `failed` and `done`. */
async function loadedList(): Promise<RunsList> {
  const list = new RunsList(fakeSource([failed, done]).source);
  await list.refresh();
  return list;
}

/** What the page opened, in order. */
interface Opened {
  readonly items: ItemRef[];
  readonly places: SidebarPlace[];
}

function openers(list: RunsList): Opened & Parameters<typeof openRunNotice>[1] {
  const items: ItemRef[] = [];
  const places: SidebarPlace[] = [];
  return {
    list,
    items,
    places,
    openItem: (item) => items.push(item),
    openPlace: (place) => places.push(place),
  };
}

/** Shell clicks with `pending` waiting, and a way to click later. */
function fakeClicks(pending: NoticeTarget | undefined) {
  let waiting = pending;
  const listeners = new Set<(target: NoticeTarget) => void>();
  // The shell hands the click over once; the service answers every call the same.
  const taken = Promise.resolve().then(() => {
    const click = waiting;
    waiting = undefined;
    return click;
  });
  const clicks: RunNoticeClicks = {
    takePending: () => taken,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  const click = (target: NoticeTarget) => {
    for (const listener of listeners) listener(target);
  };
  return { clicks, click, listening: () => listeners.size };
}

function contextOf(list: RunsList, opened: Opened): WorkspaceContext {
  return {
    services: { get: () => list, find: () => list },
    openItem: (item: ItemRef) => opened.items.push(item),
    openPlace: (place: SidebarPlace) => opened.places.push(place),
  } as unknown as WorkspaceContext;
}

async function settled(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

verifies("runs.run-notification-open", () => {
  describe("openRunNotice", () => {
    it("opens the run's page when the workspace lists it", async () => {
      const list = await loadedList();
      const opened = openers(list);
      openRunNotice({ kind: "run", id: "run_d_9x8y7z" }, opened);
      expect(opened.items).toEqual([{ kind: "run", hub: "acme", id: "run_d_9x8y7z" }]);
      expect(opened.places).toEqual([]);
    });

    it("opens Runs for a run the workspace doesn't list", async () => {
      const list = await loadedList();
      const opened = openers(list);
      openRunNotice({ kind: "run", id: "run_elsewhere" }, opened);
      expect(opened.items).toEqual([]);
      expect(opened.places).toEqual(["runs"]);
    });

    it("opens Runs on the Failed group for runs-failed", async () => {
      const list = await loadedList();
      const opened = openers(list);
      openRunNotice({ kind: "runs-failed", id: "failed" }, opened);
      expect(opened.places).toEqual(["runs"]);
      expect(list.requestedFailed).toBe(true);
    });

    it("opens nothing for a notification that isn't a run's", async () => {
      const list = await loadedList();
      const opened = openers(list);
      openRunNotice({ kind: "conversation", id: "chat-acme-2" }, opened);
      expect(opened).toMatchObject({ items: [], places: [] });
    });
  });

  describe("followRunNotices", () => {
    it("opens a pending run click once the page starts, and only once", async () => {
      const list = await loadedList();
      const opened: Opened = { items: [], places: [] };
      const { clicks } = fakeClicks({ kind: "run", id: "run_d_9x8y7z" });
      const context = contextOf(list, opened);
      // Started, stopped and started again, as React's checks do, then started once more.
      followRunNotices(clicks, () => context)();
      followRunNotices(clicks, () => context);
      await settled();
      followRunNotices(clicks, () => context);
      await settled();
      expect(opened.items).toEqual([{ kind: "run", hub: "acme", id: "run_d_9x8y7z" }]);
    });

    it("opens a live click that has no callback in this page", async () => {
      const list = await loadedList();
      const opened: Opened = { items: [], places: [] };
      const { clicks, click, listening } = fakeClicks(undefined);
      const stop = followRunNotices(clicks, () => contextOf(list, opened));
      await settled();
      click({ kind: "run", id: "run_c_4f2a1b" });
      expect(opened.items).toEqual([{ kind: "run", hub: "acme", id: "run_c_4f2a1b" }]);
      stop();
      expect(listening()).toBe(0);
    });
  });

  describe("the Runs page", () => {
    it("opens on the Failed group when a click asked for it", async () => {
      const list = await loadedList();
      list.showFailed();
      const root = render(<RunsView list={list} now={() => mondayMorning} />);
      await settled();
      const chip = [...root.querySelectorAll("label")].find((label) =>
        label.textContent?.trim().startsWith("Failed"),
      );
      expect(chip?.querySelector("input")?.checked).toBe(true);
      expect(list.requestedFailed).toBe(false);
    });
  });
});
