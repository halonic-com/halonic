// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it } from "vitest";
import { fakeRuns } from "../fake-runs.test-helper.ts";
import { Inbox } from "../inbox.ts";
import type { SetupItem } from "../inbox-items.ts";
import { waitingRun } from "../test-runs.test-helper.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { InboxView } from "./inbox-page.tsx";
import { inboxRow } from "./inbox-row.tsx";

afterEach(unmountAll);

// Local times, so the test reads the same in every time zone. Sun 8 Nov 2026.
const at = (hour: number, minute: number) => new Date(2026, 10, 8, hour, minute).toISOString();
const facts = { hubId: "acme", workflow: "Support reply", startedBy: "a message" };

async function settled(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

verifies("inbox.row-meta-wraps", () => {
  it("lets a row's meta line take two lines, so Waiting 1 h isn't cut off", async () => {
    const run = waitingRun("run_mfx3k9z7_891b5a", {
      lastWaitingAt: at(9, 0),
      waitingFor: { title: "Approve this reply?", body: "Dear Ben, your order ships today." },
    });
    const root = render(
      <InboxView
        inbox={new Inbox(fakeRuns([run]).runs)}
        now={() => new Date(2026, 10, 8, 10, 0)}
        runFacts={() => facts}
      />,
    );
    await settled();
    const meta = [...root.querySelectorAll('[role="grid"] [role="gridcell"] span')].find(
      (span) =>
        span.textContent === "Support reply · run 891b5a · a person step · Waiting 1\u00a0h",
    );
    expect(meta?.className).toContain("line-clamp-2");
  });

  it("sets it on every row, as Home's Needs you shows them too", () => {
    const now = new Date(2026, 10, 8, 10, 0);
    const setup: SetupItem = {
      kind: "setup",
      key: "setup:google:acme",
      provider: "google",
      account: "acme",
      title: "Set up Google",
      progress: "Step 4 of 7 · Scopes",
      changedAt: at(9, 0),
    };
    expect(inboxRow(setup, now, undefined).wrapMeta).toBe(true);
  });
});
