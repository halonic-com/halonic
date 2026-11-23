// @vitest-environment jsdom
import { createToastStore, ToastRegion, ToastStoreProvider } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProposalDecisions } from "../proposal-decisions.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { buttons, press, proposal, wrote } from "./proposal-card.test-helper.tsx";
import { ProposalCard } from "./proposal-card.tsx";

afterEach(() => {
  unmountAll();
});

const pressAgain = "The engine isn't answering. Press Undo again once it answers.";

function fakeDecisions() {
  return {
    accept: vi.fn(async () => wrote("u1")),
    reject: vi.fn(async () => wrote("u2")),
    undo: vi.fn(async () => ({ leftAlone: [] as readonly string[] })),
    settle: vi.fn(async () => {}),
    remove: vi.fn(async () => {}),
  } satisfies ProposalDecisions;
}

/**
 * The proposal page in its toast store, whose toasts show beside it, with `answering` to tell it
 * the engine stopped or came back, and `leave` to take it away as leaving the Inbox does.
 */
function openCard(decisions: ProposalDecisions, signedOut = false) {
  const toasts = createToastStore();
  let setAnswering: (answering: boolean) => void = () => {};
  let setShown: (shown: boolean) => void = () => {};
  function Page() {
    const [answering, set] = useState(true);
    const [shown, show] = useState(true);
    setAnswering = set;
    setShown = show;
    if (!shown) return null;
    return (
      <ProposalCard
        item={proposal()}
        now={new Date(2026, 10, 12, 9, 0)}
        facts={undefined}
        decisions={decisions}
        onDecided={() => {}}
        readAgain={async () => {}}
        answering={answering}
        signedOut={signedOut}
      />
    );
  }
  const root = render(
    <ToastStoreProvider store={toasts}>
      <Page />
      <ToastRegion store={toasts} />
    </ToastStoreProvider>,
  );
  return {
    root,
    toasts,
    answering: (answering: boolean) => act(() => setAnswering(answering)),
    leave: () => act(() => setShown(false)),
  };
}

/** Presses the **Undo** of the toast titled `title`. */
async function pressUndo(toasts: ReturnType<typeof createToastStore>, title: string) {
  const toast = toasts.list().find((shown) => shown.title === title);
  await act(async () => toast?.action?.onClick());
}

const accepted = "Accepted 1 change from run 01JD8Q";

/** Each toast in the store as its tone, title, line and action's label. */
function toastsShown(toasts: ReturnType<typeof createToastStore>) {
  return toasts.list().map((toast) => [toast.tone, toast.title, toast.text, toast.action?.label]);
}

verifies("inbox.proposal-undo-held", () => {
  describe("a decision toast's Undo while the engine isn't answering", () => {
    it("sends nothing and puts a toast that says the page's line, with Undo, in its toast's place; once it answers, that Undo works", async () => {
      const decisions = fakeDecisions();
      const { root, toasts, answering } = openCard(decisions);
      await press(buttons(root, "Accept")[0]);
      answering(false);

      await pressUndo(toasts, accepted);

      expect(decisions.undo).not.toHaveBeenCalled();
      expect(toastsShown(toasts)).toEqual([["danger", "Couldn't undo this.", pressAgain, "Undo"]]);

      answering(true);
      await pressUndo(toasts, "Couldn't undo this.");

      expect(decisions.undo).toHaveBeenCalledWith("u1");
      expect(toasts.list()).toEqual([]);
      expect(buttons(root, "Accept")).toHaveLength(2);
    });

    it("keeps one toast for the decision when Undo is pressed again while the engine still isn't answering", async () => {
      const decisions = fakeDecisions();
      const { root, toasts, answering } = openCard(decisions);
      await press(buttons(root, "Accept")[0]);
      answering(false);

      await pressUndo(toasts, accepted);
      await pressUndo(toasts, "Couldn't undo this.");

      expect(decisions.undo).not.toHaveBeenCalled();
      expect(toastsShown(toasts)).toEqual([["danger", "Couldn't undo this.", pressAgain, "Undo"]]);
    });

    it("moves focus to the new toast's Undo when the Undo pressed had it, so a keyboard needn't press F6", async () => {
      const decisions = fakeDecisions();
      const { root, answering } = openCard(decisions);
      await press(buttons(root, "Accept")[0]);
      answering(false);
      const undo = buttons(root, "Undo")[0];
      act(() => undo?.focus());

      await press(undo);

      const [held] = buttons(root, "Undo");
      expect(held?.closest("[role=alert]")?.textContent).toContain("Couldn't undo this.");
      expect(document.activeElement).toBe(held);
    });

    it("closes the held-back toast with its Undo once a newer decision is made", async () => {
      const decisions = fakeDecisions();
      const { root, toasts, answering } = openCard(decisions);
      await press(buttons(root, "Accept")[0]);
      answering(false);
      await pressUndo(toasts, accepted);
      answering(true);

      await press(buttons(root, "Accept")[0]);

      expect(toastsShown(toasts)).toEqual([["success", accepted, undefined, "Undo"]]);
    });

    it("says to sign in again when the served Studio's sign-in ended", async () => {
      const decisions = fakeDecisions();
      const { root, toasts, answering } = openCard(decisions, true);
      await press(buttons(root, "Accept")[0]);
      answering(false);

      await pressUndo(toasts, accepted);

      expect(decisions.undo).not.toHaveBeenCalled();
      expect(toasts.list().find((toast) => toast.tone === "danger")?.text).toBe(
        "Sign in again to send your answer.",
      );
    });

    it("is sent once the page has gone, since the page no longer says the engine isn't answering", async () => {
      const decisions = fakeDecisions();
      const { root, toasts, answering, leave } = openCard(decisions);
      await press(buttons(root, "Accept")[0]);
      answering(false);
      leave();

      await pressUndo(toasts, accepted);

      expect(decisions.undo).toHaveBeenCalledWith("u1");
    });
  });
});
