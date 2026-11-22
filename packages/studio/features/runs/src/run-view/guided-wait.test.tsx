// @vitest-environment jsdom
import type { RunSummary } from "@halonicjs/events";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import type { RunsSource } from "../api.ts";
import { mondayMorning, summaryWith } from "../summary.test-helper.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { RunCardReceipt } from "./card-receipt.tsx";
import { entered, logOf } from "./run-log.test-helper.ts";

afterEach(unmountAll);

const source: Pick<RunsSource, "workflow" | "currency" | "providerKind"> = {
  workflow: () => ({ name: "Support reply", stepDescription: () => undefined }),
  currency: () => "EUR",
  providerKind: () => undefined,
};

const waiting = summaryWith({
  status: "waiting",
  state: "review",
  accepts: ["approve", "reject"],
  waitingFor: { title: "Approve this reply?", body: "Sorry your order arrived damaged, Sam." },
});

const running = summaryWith({ status: "running", state: "sort" });

/** The card of `summary`, guided or not, with `reviewInInbox` as its way to the Inbox. */
function card(summary: RunSummary, guided: boolean, reviewInInbox = vi.fn()) {
  const root = render(
    <RunCardReceipt
      source={source}
      run={{ summary }}
      read={{
        events: logOf(summary.id, [[0, entered(summary.state ?? "sort")]]),
        failure: undefined,
        damagedLine: undefined,
        retry: () => {},
      }}
      now={mondayMorning}
      reviewInInbox={reviewInInbox}
      pickAnotherModel={guided ? vi.fn() : undefined}
    />,
  );
  return { root, reviewInInbox };
}

const buttonsOf = (root: HTMLElement) =>
  [...root.querySelectorAll("button")].map((button) => button.textContent);

const inInbox = "Waiting for you. It's in your Inbox.";

verifies("runs.run-view.guided-wait", () => {
  it("says a guided run waiting for the person is in the Inbox, with Open Inbox, in place of the banner", async () => {
    const { root, reviewInInbox } = card(waiting, true);
    const region = root.querySelector('[role="status"][aria-atomic="true"]');
    expect(region?.textContent).toBe(inInbox);
    expect(root.textContent).not.toContain("Waiting for you: Approve this reply?");
    expect(buttonsOf(root)).toEqual(["Open Inbox", "Show the run log"]);
    const open = root.querySelector("button");
    expect(region?.contains(open)).toBe(false);
    expect(reviewInInbox).not.toHaveBeenCalled();
    await act(async () => open?.click());
    expect(reviewInInbox).toHaveBeenCalledOnce();
  });

  it("keeps an empty status region on the card while the run is still running", () => {
    const { root } = card(running, true);
    const region = root.querySelector('[role="status"][aria-atomic="true"]');
    expect(region).not.toBeNull();
    expect(region?.textContent).toBe("");
    expect(buttonsOf(root)).not.toContain("Open Inbox");
  });

  it("shows the usual banner on a card that isn't guided", () => {
    const { root } = card(waiting, false);
    expect(root.textContent).not.toContain(inInbox);
    expect(root.textContent).toContain("Waiting for you: Approve this reply?");
    expect(buttonsOf(root)).toContain("Review in Inbox");
  });
});
