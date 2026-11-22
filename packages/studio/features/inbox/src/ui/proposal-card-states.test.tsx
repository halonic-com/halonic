// @vitest-environment jsdom
import { createToastStore, ToastStoreProvider } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type ProposalDecisions, ProposalGoneError } from "../proposal-decisions.ts";
import type { ProposalItem } from "../proposal-items.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { buttons, press, proposal, renderCard, wrote } from "./proposal-card.test-helper.tsx";
import { ProposalCard } from "./proposal-card.tsx";

afterEach(() => {
  unmountAll();
});

function fakeDecisions(overrides: Partial<ProposalDecisions> = {}) {
  return {
    accept: vi.fn(async () => wrote("u1")),
    reject: vi.fn(async () => wrote("u2")),
    undo: vi.fn(async () => ({ leftAlone: [] as readonly string[] })),
    settle: vi.fn(async () => {}),
    remove: vi.fn(async () => {}),
    ...overrides,
  } satisfies ProposalDecisions;
}

function open(decisions: ProposalDecisions | undefined, item = proposal()) {
  const onDecided = vi.fn();
  return { ...renderCard(decisions, item, onDecided), onDecided };
}

const gone = () => Promise.reject(new ProposalGoneError("The run's branch was deleted."));

verifies("inbox.proposal-page-states", () => {
  describe("a proposal whose texts are gone", () => {
    it("offers only Remove once the host says so, and focuses its line", async () => {
      const { root } = open(fakeDecisions({ accept: vi.fn(gone) }));
      await press(buttons(root, "Accept")[0]);

      const line = [...root.querySelectorAll("p")].find(
        (p) => p.textContent === "This proposal can't be opened any more.",
      );
      expect(line).toBeDefined();
      expect(document.activeElement).toBe(line);
      expect(buttons(root, "Remove")).toHaveLength(1);
      for (const name of ["Accept", "Reject", "Accept all", "Reject all"]) {
        expect(buttons(root, name)).toEqual([]);
      }
      expect(root.querySelector('[role="alert"]')).toBeNull();
    });

    it("removes it with no dialog, and has the Inbox read its items again", async () => {
      const decisions = fakeDecisions({ reject: vi.fn(gone) });
      const { root, onDecided } = open(decisions);
      await press(buttons(root, "Reject all")[0]);
      await press(buttons(root, "Remove")[0]);

      expect(decisions.remove).toHaveBeenCalledWith("run_mfx3k2a1_0001JD8Q");
      expect(onDecided).toHaveBeenCalledTimes(1);
      expect(root.querySelector('[role="dialog"]')).toBeNull();
    });

    it("says a failed Remove with its reason, and keeps Remove to try again", async () => {
      const remove = vi
        .fn<() => Promise<void>>()
        .mockRejectedValueOnce(new Error("The agent host isn't answering."))
        .mockResolvedValueOnce(undefined);
      const { root, onDecided } = open(fakeDecisions({ accept: vi.fn(gone), remove }));
      await press(buttons(root, "Accept")[0]);
      await press(buttons(root, "Remove")[0]);

      expect(root.querySelector('[role="alert"]')?.textContent).toBe(
        "Couldn't remove this proposal. The agent host isn't answering.",
      );
      expect(onDecided).not.toHaveBeenCalled();
      await press(buttons(root, "Remove")[0]);
      expect(onDecided).toHaveBeenCalledTimes(1);
      expect(root.querySelector('[role="alert"]')).toBeNull();
    });
  });

  it("shows the decisions the Inbox read again, such as one from another window", async () => {
    let refresh: (item: ProposalItem) => void = () => {};
    function Refreshing() {
      const [item, setItem] = useState(proposal());
      refresh = setItem;
      return (
        <ProposalCard
          item={item}
          now={new Date(2026, 10, 12, 9, 0)}
          facts={undefined}
          decisions={fakeDecisions()}
          onDecided={() => {}}
        />
      );
    }
    const root = render(
      <ToastStoreProvider store={createToastStore()}>
        <Refreshing />
      </ToastStoreProvider>,
    );
    expect(buttons(root, "Accept")).toHaveLength(2);

    const decidedElsewhere = proposal({
      files: [
        { path: "notes/a.md", change: "modified", decision: "accepted" },
        { path: "notes/b.md", change: "added", decision: "undecided" },
      ],
    });
    await act(async () => refresh(decidedElsewhere));
    expect(buttons(root, "Accept")).toHaveLength(1);
    expect(root.textContent).toContain("Accepted");
  });
});
