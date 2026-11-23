// @vitest-environment jsdom
import { createToastStore, ToastStoreProvider } from "@halonicjs/studio-kit";
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

const showingLast = "The engine isn't answering. Showing what it said last.";

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
 * The proposal page in its toast store, with `answering` to tell it the engine stopped or came
 * back, and `leave` to take it away as leaving the Inbox does.
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

verifies("inbox.proposal-undo-held", () => {
  describe("a decision toast's Undo while the engine isn't answering", () => {
    it("sends nothing, keeps the toast and says the page's line; once it answers, Undo works", async () => {
      const decisions = fakeDecisions();
      const { root, toasts, answering } = openCard(decisions);
      await press(buttons(root, "Accept")[0]);
      answering(false);

      await pressUndo(toasts, accepted);

      expect(decisions.undo).not.toHaveBeenCalled();
      expect(toasts.list().map((toast) => [toast.title, toast.text])).toEqual([
        [accepted, undefined],
        ["Couldn't undo this.", showingLast],
      ]);

      answering(true);
      await pressUndo(toasts, accepted);

      expect(decisions.undo).toHaveBeenCalledWith("u1");
      expect(toasts.list().map((toast) => toast.title)).toEqual(["Couldn't undo this."]);
      expect(buttons(root, "Accept")).toHaveLength(2);
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
