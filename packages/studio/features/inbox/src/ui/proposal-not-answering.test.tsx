// @vitest-environment jsdom
import type { Decision, ProposedRecord, Settled } from "@halonicjs/app";
import { KindedError } from "@halonicjs/std";
import { createToastStore, ToastStoreProvider } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fakeRuns } from "../fake-runs.test-helper.ts";
import { Inbox } from "../inbox.ts";
import {
  type ProposalDecisions,
  ProposalFailedError,
  ProposalGoneError,
} from "../proposal-decisions.ts";
import type { RunProposalEntry } from "../proposal-items.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { InboxView } from "./inbox-page.tsx";
import { buttons, press, proposal, wrote } from "./proposal-card.test-helper.tsx";
import { ProposalCard } from "./proposal-card.tsx";

afterEach(() => {
  unmountAll();
});

const showingLast = "The engine isn't answering. Showing what it said last.";

function fakeDecisions(overrides: Partial<ProposalDecisions> = {}) {
  return {
    accept: vi.fn(async () => wrote("u1")),
    reject: vi.fn(async () => wrote("u2")),
    undo: vi.fn(async () => ({ leftAlone: [] as readonly string[], decidedAfter: false })),
    settle: vi.fn(async () => {}),
    remove: vi.fn(async () => {}),
    compare: vi.fn(),
    choose: vi.fn(),
    ...overrides,
  } satisfies ProposalDecisions;
}

/** The proposal page, with `setAnswering` to tell it the engine stopped or came back. */
function openCard(decisions: ProposalDecisions, signedOut = false) {
  let setAnswering: (answering: boolean) => void = () => {};
  function Card() {
    const [answering, set] = useState(true);
    setAnswering = set;
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
    <ToastStoreProvider store={createToastStore()}>
      <Card />
    </ToastStoreProvider>,
  );
  return { root, stop: () => act(() => setAnswering(false)) };
}

/** Whether `button` is unavailable and names the element with `text` as its reason. */
function pointsAt(root: HTMLElement, button: HTMLButtonElement | undefined, text: string) {
  const reason = [...root.querySelectorAll("p")].find((p) => p.textContent === text);
  return (
    button?.getAttribute("aria-disabled") === "true" &&
    reason !== undefined &&
    (button.getAttribute("aria-describedby") ?? "").split(" ").includes(reason.id)
  );
}

/** Run `runId`'s proposal with one undecided file, settled when `settled` is given. */
function entry(runId: string, settled?: Settled): RunProposalEntry {
  const record: ProposedRecord = {
    state: "proposed",
    proposal: {
      runId,
      history: "off",
      base: null,
      ref: null,
      files: [{ path: "notes/a.md", change: "modified", base: { digest: "sha256:d1" } }],
      items: ["support-triage"],
    },
    finishedAt: "2026-11-22T08:00:00.000Z",
    decisions: { "notes/a.md": "undecided" as Decision },
    ...(settled === undefined ? {} : { settled }),
  };
  return { record, run: undefined };
}

/** The Inbox page over one open proposal and a Done list that `done` answers. */
async function inboxWith(done: () => Promise<readonly RunProposalEntry[]>) {
  const { runs } = fakeRuns([]);
  const inbox = new Inbox({
    ...runs,
    proposals: async () => [entry("01JD8Q")],
    doneProposals: done,
  });
  const root = render(
    <InboxView
      inbox={inbox}
      proposals={fakeDecisions()}
      now={() => new Date("2026-11-22T10:00:00Z")}
    />,
  );
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return { root, inbox };
}

const doneDetails = (root: HTMLElement) =>
  [...root.querySelectorAll("summary")].find((summary) => summary.textContent === "Done")
    ?.parentElement;

verifies("inbox.proposal-not-answering", () => {
  describe("while the engine isn't answering", () => {
    it("says so above the header, and every decision points at that line and sends nothing", async () => {
      const decisions = fakeDecisions();
      const { root, stop } = openCard(decisions);
      stop();

      const body = root.querySelector("section > div");
      expect(body?.firstElementChild?.textContent).toBe(showingLast);
      for (const name of ["Accept all", "Reject all", "Accept", "Reject"]) {
        for (const button of buttons(root, name))
          expect(pointsAt(root, button, showingLast)).toBe(true);
      }
      await press(buttons(root, "Accept")[0]);
      await press(buttons(root, "Reject all")[0]);
      expect(decisions.accept).not.toHaveBeenCalled();
      expect(decisions.reject).not.toHaveBeenCalled();
    });

    it("says to sign in again when the served Studio's sign-in ended", () => {
      const { root, stop } = openCard(fakeDecisions(), true);
      stop();
      const line = "Sign in again to send your answer.";
      expect(pointsAt(root, buttons(root, "Accept")[0], line)).toBe(true);
    });

    it("keeps Try again and Remove from reaching the host", async () => {
      const failed = openCard(
        fakeDecisions({
          accept: vi.fn(async () =>
            Promise.reject(new ProposalFailedError("not-answering", "The host isn't running.")),
          ),
        }),
      );
      await press(buttons(failed.root, "Accept")[0]);
      failed.stop();
      expect(pointsAt(failed.root, buttons(failed.root, "Try again")[0], showingLast)).toBe(true);

      const decisions = fakeDecisions({
        accept: vi.fn(() => Promise.reject(new ProposalGoneError("The run's branch was deleted."))),
      });
      const gone = openCard(decisions);
      await press(buttons(gone.root, "Accept")[0]);
      gone.stop();
      await press(buttons(gone.root, "Remove from Inbox")[0]);
      expect(pointsAt(gone.root, buttons(gone.root, "Remove from Inbox")[0], showingLast)).toBe(
        true,
      );
      expect(decisions.remove).not.toHaveBeenCalled();
    });

    it("sends nothing after a load the engine refused with its own reason", async () => {
      // HAL-19190: the line gives a refusal's reason instead of "isn't answering", but the last
      // load still failed, so the buttons stay unavailable.
      let refuse = false;
      const decisions = fakeDecisions();
      const { runs } = fakeRuns([]);
      const inbox = new Inbox({
        ...runs,
        proposals: async () => {
          if (refuse) throw new KindedError("unavailable", "The agent host refused the read.");
          return [entry("01JD8Q")];
        },
      });
      const root = render(
        <InboxView
          inbox={inbox}
          proposals={decisions}
          now={() => new Date("2026-11-22T10:00:00Z")}
        />,
      );
      await act(async () => inbox.refresh());
      refuse = true;
      await act(async () => inbox.refresh());
      const cell = root.querySelector<HTMLElement>('[role="grid"] tr [role="gridcell"]');
      act(() => cell?.focus());
      await act(async () => {
        cell?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      });

      expect(root.textContent).toContain("The agent host refused the read.");
      expect(buttons(root, "Accept")[0]?.getAttribute("aria-disabled")).toBe("true");
      await press(buttons(root, "Accept")[0]);
      expect(decisions.accept).not.toHaveBeenCalled();
    });
  });

  describe("when only the Done list doesn't load", () => {
    it("says so under Done, and the rest of the Inbox stays answering", async () => {
      const { root, inbox } = await inboxWith(async () => {
        throw new Error("The agent host isn't answering.");
      });

      expect(inbox.state.error).toBeUndefined();
      expect(doneDetails(root)?.textContent).toContain("Couldn't load Done");
      // An unkinded error says the engine isn't answering, as the Notices' own error does.
      expect(doneDetails(root)?.textContent).toContain("The engine isn't answering.");
      expect(
        [...(doneDetails(root)?.querySelectorAll("button") ?? [])].map((b) => b.textContent),
      ).toEqual(["Try again"]);
      expect(root.textContent).not.toContain(showingLast);
    });

    it("keeps the done proposals it showed last, under the host's line", async () => {
      let fail = false;
      const settled: Settled = { at: "2026-11-21T09:00:00.000Z", why: "decided" };
      const { root, inbox } = await inboxWith(async () => {
        if (fail) throw new Error("The agent host isn't answering.");
        return [entry("01JD7A", settled)];
      });
      fail = true;
      await act(async () => inbox.refresh());

      expect(inbox.state.error).toBeUndefined();
      expect(inbox.state.done.map((item) => item.runId)).toEqual(["01JD7A"]);
      expect(doneDetails(root)?.textContent).toContain(showingLast);
      expect(doneDetails(root)?.textContent).not.toContain("Couldn't load Done");
    });
  });
});
