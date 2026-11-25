// @vitest-environment jsdom
import { ClipboardProvider, createToastStore, ToastStoreProvider } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type ProposalDecisions,
  ProposalFailedError,
  type ProposalFailure,
} from "../proposal-decisions.ts";
import { renderWithUpdate, unmountAll } from "../test-support/render.tsx";
import { buttons, press, proposal, wrote } from "./proposal-card.test-helper.tsx";
import { ProposalCard } from "./proposal-card.tsx";
import type { TrustReview } from "./workspace-trust.ts";

// C665 27: a decision or an Undo that fails says why by its kind, never in the host's words.

afterEach(() => {
  unmountAll();
});

const failedWith = (failure: ProposalFailure) =>
  Promise.reject(new ProposalFailedError(failure, "POST /v1/proposals/accept 422"));

function decisionsFailing(failure: ProposalFailure) {
  return {
    accept: vi.fn(() => failedWith(failure)),
    reject: vi.fn(async () => wrote("u2")),
    undo: vi.fn(() => failedWith(failure)),
    settle: vi.fn(async () => {}),
    remove: vi.fn(async () => {}),
    compare: vi.fn(),
    choose: vi.fn(),
  } satisfies ProposalDecisions;
}

/** The proposal page with a clipboard to copy details to, and `trust` to render again with. */
function open(decisions: ProposalDecisions, trust?: TrustReview) {
  const toasts = createToastStore();
  const writeClipboard = vi.fn(async (_text: string) => true);
  const card = (withTrust: TrustReview | undefined) => (
    <ToastStoreProvider store={toasts}>
      <ClipboardProvider writeClipboard={writeClipboard}>
        <ProposalCard
          item={proposal()}
          now={new Date(2026, 10, 12, 9, 0)}
          facts={undefined}
          decisions={decisions}
          onDecided={() => {}}
          readAgain={async () => {}}
          trust={withTrust}
        />
      </ClipboardProvider>
    </ToastStoreProvider>
  );
  const { container, update } = renderWithUpdate(card(trust));
  return {
    root: container,
    toasts,
    writeClipboard,
    retrust: (next: TrustReview) => update(card(next)),
  };
}

const alertOf = (root: HTMLElement) => root.querySelector('[role="alert"]')?.textContent ?? "";

verifies("inbox.proposal-page", () => {
  describe("a decision that fails", () => {
    it("copies the host's words only through Copy details, for a reason Halonic can't explain", async () => {
      const { root, writeClipboard } = open(decisionsFailing("unexplained"));
      await press(buttons(root, "Accept")[0]);

      expect(alertOf(root)).toBe(
        "Couldn't accept this change. Halonic ran into a problem it can't explain yet.Copy details",
      );
      expect(buttons(root, "Try again")).toEqual([]);
      await press(buttons(root, "Copy details")[0]);
      expect(writeClipboard).toHaveBeenCalledWith(
        expect.stringContaining("POST /v1/proposals/accept 422"),
      );
    });

    it("offers Try again when the engine isn't answering", async () => {
      const decisions = decisionsFailing("not-answering");
      const { root } = open(decisions);
      await press(buttons(root, "Accept all")[0]);

      expect(alertOf(root)).toContain(
        "Couldn't accept these changes. The engine isn't answering. It may still be starting.",
      );
      await press(buttons(root, "Try again")[0]);
      expect(decisions.accept).toHaveBeenCalledTimes(2);
      expect(decisions.accept).toHaveBeenLastCalledWith("run_mfx3k2a1_0001JD8Q", "all");
    });

    it("offers Review when the workspace isn't trusted, and drops the line once it is", async () => {
      const review = vi.fn();
      const { root, retrust } = open(decisionsFailing("untrusted"), { review, granted: 0 });
      await press(buttons(root, "Accept")[0]);

      expect(alertOf(root)).toContain(
        "Couldn't accept this change. This workspace isn't trusted yet, so Halonic can't change its files.",
      );
      const [reviewButton] = buttons(root, "Review");
      await press(reviewButton);
      expect(review).toHaveBeenCalledWith(reviewButton);

      retrust({ review, granted: 1 });
      expect(alertOf(root)).toBe("");
      expect(buttons(root, "Review")).toEqual([]);
    });
  });

  describe("an Undo that fails", () => {
    it("says why in its toast, with Copy details for a reason Halonic can't explain", async () => {
      const decisions = {
        ...decisionsFailing("unexplained"),
        accept: vi.fn(async () => wrote("u1")),
      };
      const { root, toasts, writeClipboard } = open(decisions);
      await press(buttons(root, "Accept")[0]);

      await act(async () => toasts.list()[0]?.action?.onClick());

      const [refused] = toasts.list().filter((toast) => toast.tone === "danger");
      expect(refused?.title).toBe("Couldn't undo this.");
      expect(refused?.text).toBe("Halonic ran into a problem it can't explain yet.");
      await act(async () => refused?.action?.onClick());
      expect(writeClipboard).toHaveBeenCalledWith(
        expect.stringContaining("POST /v1/proposals/accept 422"),
      );
    });

    it("has no Copy details when the engine isn't answering", async () => {
      const decisions = {
        ...decisionsFailing("not-answering"),
        accept: vi.fn(async () => wrote("u1")),
      };
      const { root, toasts } = open(decisions);
      await press(buttons(root, "Accept")[0]);

      await act(async () => toasts.list()[0]?.action?.onClick());

      const [refused] = toasts.list().filter((toast) => toast.tone === "danger");
      expect(refused?.text).toBe("The engine isn't answering. It may still be starting.");
      expect(refused?.action).toBeUndefined();
    });
  });
});
