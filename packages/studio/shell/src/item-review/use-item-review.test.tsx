// @vitest-environment jsdom

import type { ExpectedContent } from "@halonicjs/ports";
import { createToastStore, ToastStoreProvider } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, unmountAll } from "../test-support/render.tsx";
import { changesDecided } from "./changes-decided.ts";
import { ItemChangeMark } from "./item-change-mark.tsx";
import type { ItemChangeToReview, ItemReview, ItemReviewDecision } from "./item-review-api.ts";
import { itemReviewWords } from "./item-review-words.ts";
import { useItemReview } from "./use-item-review.tsx";

afterEach(unmountAll);

const checkAdded: ItemChangeToReview = {
  id: "step:check",
  sentence: "Step added: Check",
  important: false,
  parts: [["states", "check"]],
};
const startToCheck: ItemChangeToReview = {
  id: "step:start",
  sentence: "Step changed: Start (next steps)",
  important: false,
  parts: [["states", "start"]],
  needs: ["step:check"],
};
const notifyReadsStart: ItemChangeToReview = {
  id: "step:notify",
  sentence: "Step changed: Notify (input)",
  important: false,
  parts: [["states", "notify"]],
  needs: ["step:start"],
};
const review: ItemReview = {
  path: "hubs/acme/workflows/reply.workflow.yaml",
  whole: false,
  created: false,
  changes: [checkAdded, startToCheck, notifyReadsStart],
  seen: "seen" as ExpectedContent,
};

function Page() {
  const changes = useItemReview({
    host,
    item: { hubId: "acme", id: "reply" },
    name: "Support reply",
    goTo: () => {},
  });
  const { marks } = changes;
  return (
    <>
      {changes.bar}
      {marks?.review.changes.map((change) => (
        <ItemChangeMark key={change.id} marks={marks} change={change} />
      ))}
    </>
  );
}

const changesIn = vi.fn(async () => review);
const accept = vi.fn<() => Promise<ItemReviewDecision>>();
const host = {
  changesIn,
  accept,
  reject: accept,
  subscribe: () => () => {},
};

async function showPage() {
  const toasts = createToastStore();
  const container = render(
    <ToastStoreProvider store={toasts}>
      <Page />
    </ToastStoreProvider>,
  );
  await act(async () => {});
  const acceptOn = (id: string) =>
    act(async () =>
      container.querySelector<HTMLElement>(`[data-change-id="${id}"] button`)?.click(),
    );
  return { container, toasts, acceptOn };
}

describe("useItemReview", () => {
  verifies("shell.item-review-decisions", () => {
    it("takes along the changes a change needs, or that need it, each in turn", () => {
      expect(changesDecided(review, notifyReadsStart, "accept")).toEqual([
        notifyReadsStart,
        startToCheck,
        checkAdded,
      ]);
      expect(changesDecided(review, checkAdded, "reject")).toEqual([
        checkAdded,
        startToCheck,
        notifyReadsStart,
      ]);
      expect(changesDecided(review, checkAdded, "accept")).toEqual([checkAdded]);
    });

    it("quotes each change it takes along and joins them as plain English", () => {
      expect(itemReviewWords.alsoAccepts(["Step added: Check", "Step added: Notify"])).toBe(
        "Accepting this also accepts “Step added: Check” and “Step added: Notify”",
      );
      expect(itemReviewWords.alsoRejects(["A", "B", "C"])).toBe(
        "Rejecting this also rejects “A”, “B” and “C”",
      );
    });

    it("names them on the mark, and counts them in the toast", async () => {
      const undo = vi.fn(async () => "held" as const);
      accept.mockResolvedValueOnce({ status: "done", undo });
      const { container, toasts, acceptOn } = await showPage();
      const mark = container.querySelector('[data-change-id="step:start"]');
      expect(mark?.textContent).toContain("Accepting this also accepts “Step added: Check”");
      expect(mark?.textContent).toContain(
        "Rejecting this also rejects “Step changed: Notify (input)”",
      );

      await acceptOn("step:start");
      const [toast] = toasts.list();
      expect(toast?.title).toBe("Accepted 2 changes in Support reply");

      await act(async () => toast?.action?.onClick());
      expect(container.textContent).toContain("Changed outside Halonic");
    });

    it("reads a stale review again without a word", async () => {
      accept.mockResolvedValueOnce({ status: "stale" });
      const { toasts, acceptOn } = await showPage();
      changesIn.mockClear();

      await acceptOn("step:check");

      expect(changesIn).toHaveBeenCalledOnce();
      expect(toasts.list()).toEqual([]);
    });

    it("says when a change can't be decided on its own, and when a decision fails", async () => {
      accept.mockResolvedValueOnce({ status: "cant-separate" });
      accept.mockRejectedValueOnce(new Error("The disk is full."));
      const { toasts, acceptOn } = await showPage();

      await acceptOn("step:check");
      await acceptOn("step:check");

      expect(toasts.list().map((toast) => toast.title)).toEqual([
        "This change overlaps another, so you can't accept or reject it on its own. Use Accept all or Reject all.",
        "Couldn't save: The disk is full.",
      ]);
    });
  });
});
