// @vitest-environment jsdom
import { RunsList, type RunsSource } from "@halonicjs/studio-feature-runs/api";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it } from "vitest";
import { fakeRuns } from "../fake-runs.test-helper.ts";
import { Inbox } from "../inbox.ts";
import { pendingApproval, waitingRun } from "../test-runs.test-helper.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { InboxView } from "./inbox-page.tsx";
import { useRunReview } from "./use-run-review.ts";

afterEach(unmountAll);

// Local times, so the test reads the same in every time zone. Sun 8 Nov 2026.
const at = (hour: number, minute: number) => new Date(2026, 10, 8, hour, minute).toISOString();

const notes = waitingRun("r1", {
  approvals: [
    pendingApproval("call-1", "notes-mcp__create_note", at(10, 40)),
    pendingApproval("call-2", "notes-mcp__send_note", at(10, 42)),
  ],
});
const review = waitingRun("r2", {
  lastWaitingAt: at(9, 0),
  waitingFor: { title: "Approve this reply?", body: "" },
});

/** A Runs list with no runs of its own: the Inbox only takes its requests. */
function runsList(): RunsList {
  const source: RunsSource = {
    list: async () => [],
    log: async () => [],
    workflow: () => undefined,
    routine: () => undefined,
    runnableWorkflows: async () => [],
    providerKind: () => undefined,
    currency: () => "EUR",
    monthlyBudget: () => undefined,
    subscribe: () => () => {},
  };
  return new RunsList(source);
}

/** The Inbox page as `InboxPage` draws it: the view, and the hook that takes a run's request. */
function Page({ inbox, runs }: { inbox: Inbox; runs: RunsList }) {
  useRunReview(inbox, runs);
  return <InboxView inbox={inbox} now={() => new Date(2026, 10, 8, 10, 43)} />;
}

async function settled(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

const cardTitle = (root: HTMLElement) => root.querySelector("section h2")?.textContent;

verifies("inbox.page", () => {
  it("opens the item of the run whose Review in Inbox was pressed, not the newest", async () => {
    const inbox = new Inbox(fakeRuns([notes, review]).runs);
    await inbox.refresh();
    const runs = runsList();
    runs.reviewInInbox("r2");
    const root = render(<Page inbox={inbox} runs={runs} />);
    await settled();
    expect(cardTitle(root)).toBe("Approve this reply?");
    // The request is taken once: opening the Inbox again opens nothing by itself.
    expect(runs.takeReview()).toBeUndefined();
  });

  it("opens the call the run has waited on longest, also when the Inbox is open already", async () => {
    const inbox = new Inbox(fakeRuns([notes, review]).runs);
    await inbox.refresh();
    const runs = runsList();
    const root = render(<Page inbox={inbox} runs={runs} />);
    await settled();
    expect(root.querySelector("section h2")).toBeNull();

    await act(async () => runs.reviewInInbox("r1"));
    expect(root.querySelector('[aria-current="true"]')?.textContent).toContain("create_note");
  });

  it("opens nothing when nothing of the run waits any more", async () => {
    const inbox = new Inbox(fakeRuns([notes]).runs);
    await inbox.refresh();
    const runs = runsList();
    runs.reviewInInbox("r2");
    const root = render(<Page inbox={inbox} runs={runs} />);
    await settled();
    expect(root.querySelector("section h2")).toBeNull();
  });
});
