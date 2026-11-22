// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it } from "vitest";
import { fakeRuns } from "../fake-runs.test-helper.ts";
import { Inbox } from "../inbox.ts";
import type { ProposalDecisions } from "../proposal-decisions.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { InboxView } from "./inbox-page.tsx";

afterEach(() => {
  unmountAll();
});

const elsewhere =
  "Changes your runs propose show only in the desktop app, or with halonic proposals in a terminal.";

const decisions: ProposalDecisions = {
  accept: async () => ({ undo: "u1", changedSinceRun: [], cantBeWritten: [] }),
  reject: async () => ({ undo: "u2", changedSinceRun: [], cantBeWritten: [] }),
  undo: async () => ({ leftAlone: [] }),
  settle: async () => {},
  remove: async () => {},
};

/** The Inbox with nothing waiting, once its first load has settled. */
async function openInbox(proposals: ProposalDecisions | undefined) {
  const root = render(<InboxView inbox={new Inbox(fakeRuns([]).runs)} proposals={proposals} />);
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return root;
}

verifies("inbox.proposal-items", () => {
  it("says under Needs you where proposals show, in a window that lists none", async () => {
    const root = await openInbox(undefined);
    const line = [...root.querySelectorAll("p")].find((p) => p.textContent === elsewhere);
    expect(line?.querySelector("code")?.textContent).toBe("halonic proposals");
  });

  it("says nothing of it where the window lists proposals", async () => {
    const root = await openInbox(decisions);
    expect(root.textContent).not.toContain("show only in the desktop app");
  });
});
