// @vitest-environment jsdom
import { KindedError } from "@halonicjs/std";
import { Dialog } from "@halonicjs/studio-kit";
import { createBadgeRegistry } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { waitingRun } from "../test-runs.test-helper.ts";
import { fakeModal, restoreModal } from "../test-support/modal.ts";
import { render, renderWithUpdate, unmountAll } from "../test-support/render.tsx";
import { button, openCard, press } from "./approval-card.test-helper.tsx";
import { openCard as openWaitCard } from "./wait-card.test-helper.tsx";
import { type TrustReview, useTrustReview } from "./workspace-trust.ts";

beforeEach(fakeModal);
afterEach(() => {
  unmountAll();
  restoreModal();
});

const untrustedLine = "This workspace isn't trusted yet, so Studio can't send your answer.";

/** Answers refused as `denied` until `trusted` is set, as the window's engine does. */
function trustGate() {
  const gate = { trusted: false, sent: [] as string[] };
  const send = (what: string) => async () => {
    if (!gate.trusted) {
      throw new KindedError("denied", "This workspace isn't trusted yet, so nothing was started.");
    }
    gate.sent.push(what);
    return waitingRun("r47");
  };
  return { gate, send };
}

/** The trust check, open as the badge opens it: a kit Dialog, so the cards wait for it to close. */
function openTrustCheck() {
  const { update } = renderWithUpdate(
    <Dialog title="Trust Acme?" onCancel={() => {}}>
      Acme can run once you trust it.
    </Dialog>,
  );
  return () => update(null);
}

verifies("inbox.approval-card", () => {
  describe("once the workspace is trusted (C285 TU2)", () => {
    it("drops the untrusted line and focuses Approve after the trust check closes, and Approve works", async () => {
      const { gate, send } = trustGate();
      const review = vi.fn();
      const { root, later, rerender } = openCard({
        decisions: {
          approve: send("approve"),
          reject: send("reject"),
          askForChanges: send("note"),
        },
        trust: { review, granted: 0 },
      });
      later(2);
      await press(button(root, "Approve"));
      const slot = root.querySelector("[role='alert']");
      expect(slot?.textContent).toBe(`${untrustedLine}Review`);

      const closeCheck = openTrustCheck();
      gate.trusted = true;
      rerender({ trust: { review, granted: 1 } });
      expect(slot?.textContent).toBe("");
      const approve = button(root, "Approve");
      expect(document.activeElement).not.toBe(approve);
      closeCheck();
      expect(document.activeElement).toBe(approve);

      await press(approve);
      expect(gate.sent).toEqual(["approve"]);
    });

    it("leaves a card that showed no untrusted line as it was", () => {
      const { root, rerender } = openCard({ trust: { review: vi.fn(), granted: 0 } });
      const heading = root.querySelector("h2, h3");
      rerender({ trust: { review: vi.fn(), granted: 1 } });
      expect(root.querySelector("[role='alert']")?.textContent).toBe("");
      expect(document.activeElement).toBe(heading);
    });
  });
});

verifies("inbox.wait-card", () => {
  it("drops the untrusted line and focuses the first answer once the workspace is trusted", async () => {
    const { gate, send } = trustGate();
    const review = vi.fn();
    const { root, later, rerender } = openWaitCard({
      decisions: { answer: (_item, event) => send(event)() },
      trust: { review, granted: 0 },
    });
    later(2);
    await press(button(root, "Approve"));
    const slot = root.querySelector("[role='alert']");
    expect(slot?.textContent).toBe(`${untrustedLine}Review`);

    gate.trusted = true;
    rerender({ trust: { review, granted: 1 } });
    expect(slot?.textContent).toBe("");
    expect(document.activeElement).toBe(button(root, "Approve"));
    expect(gate.sent).toEqual([]);
  });
});

verifies("inbox.page", () => {
  describe("the workspace's trust for the cards", () => {
    function probe(badges: ReturnType<typeof createBadgeRegistry>) {
      const seen: TrustReview[] = [];
      function Probe() {
        seen.push(useTrustReview({ badges, runCommand: () => true }));
        return null;
      }
      render(<Probe />);
      return () => seen.at(-1)?.granted;
    }

    it("counts a grant each time the trust badge leaves the header, not when it comes", () => {
      const badges = createBadgeRegistry();
      const granted = probe(badges);
      const badge = {
        id: "workspace-trust",
        label: "Not trusted yet",
        tone: "neutral",
        priority: 1,
      } as const;
      let remove = () => {};
      act(() => {
        remove = badges.add(badge);
      });
      expect(granted()).toBe(0);
      act(() => remove());
      expect(granted()).toBe(1);
      act(() => {
        remove = badges.add(badge);
      });
      act(() => badges.add({ ...badge, id: "connector-notes" }));
      expect(granted()).toBe(1);
      act(() => remove());
      expect(granted()).toBe(2);
    });
  });
});
