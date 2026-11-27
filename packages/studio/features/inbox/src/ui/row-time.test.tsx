// @vitest-environment jsdom

import { FakeAgentMessaging } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it } from "vitest";
import { fakeRuns } from "../fake-runs.test-helper.ts";
import { Inbox } from "../inbox.ts";
import { waitingRun } from "../test-runs.test-helper.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { InboxView } from "./inbox-page.tsx";

afterEach(unmountAll);

// Local times, so the test reads the same in every time zone. Tue 24 Nov 2026.
const now = new Date(2026, 10, 24, 10, 0);
const twoDaysAgo = new Date(2026, 10, 22, 10, 0);

async function settled(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

/** One run that waits a minute and a question from Chief asked two days ago. */
async function inboxWithLateQuestion(): Promise<HTMLElement> {
  const messaging = new FakeAgentMessaging({ now: () => twoDaysAgo });
  const source = messaging.addSource({ label: "Paperclip · Acme" });
  const chief = messaging.addAgent(source.id, { name: "Chief" });
  messaging.addInboxItem(source.id, {
    question: "Is this the right customer list?",
    from: { kind: "agent", agent: chief.id, name: "Chief" },
  });
  const run = waitingRun("r1", {
    lastWaitingAt: new Date(2026, 10, 24, 9, 59).toISOString(),
    waitingFor: { title: "Approve this reply?", body: "" },
  });
  const root = render(
    <InboxView
      inbox={new Inbox(fakeRuns([run]).runs)}
      now={() => now}
      agentMessaging={messaging}
    />,
  );
  await settled();
  return root;
}

function rows(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>('[role="grid"] tr')];
}

verifies("inbox.read-marks", () => {
  it("counts an agent's item that has waited a day as late in the heading", async () => {
    const root = await inboxWithLateQuestion();
    const grid = root.querySelector('[role="grid"]');
    const name = grid?.getAttribute("aria-labelledby");
    const heading = name === null || name === undefined ? null : document.getElementById(name);
    expect(heading?.textContent?.replace(/\s/g, " ")).toContain("1 late");
  });

  it("keeps room for the hover action at the row's top right, only as wide as its icon", async () => {
    const root = await inboxWithLateQuestion();
    const end = rows(root)[0]?.querySelector('[data-part="end-column"]');
    const room = end?.querySelector('[data-part="action-room"]');
    expect(room?.className.split(" ")).toContain("min-w-6");
    // The room holds the time alone: the action's words are in its name, not the row's text.
    expect(room?.textContent).toBe("Waiting 1\u00a0min");
    expect(rows(root)[0]?.querySelector('[role="gridcell"]')?.textContent).not.toContain(
      "Mark as read",
    );
  });

  it("draws Mark as read as an icon button named with the row's title", async () => {
    const root = await inboxWithLateQuestion();
    const action = rows(root)[0]?.querySelector("button");
    expect(action?.textContent).toBe("");
    expect(action?.getAttribute("aria-label")).toBe("Mark as read: Approve this reply?");
    expect(action?.querySelector("svg")).not.toBeNull();
  });
});

verifies("inbox.waiting-time", () => {
  it("shows the wait at the top right, amber with a dot once late, and says it in words", async () => {
    const root = await inboxWithLateQuestion();
    const [ownTime, agentTime] = rows(root).map((row) =>
      row.querySelector('[data-part="end-column"] [data-part="wait-time"]'),
    );
    expect(ownTime?.textContent).toBe("Waiting 1 min");
    expect(ownTime?.querySelector(".sr-only")?.textContent).toBe("Waiting ");
    expect(ownTime?.className).toContain("text-fg-muted");
    expect(agentTime?.textContent).toBe("Waiting 2 days, late");
    expect(agentTime?.className).toContain("text-attention");
    expect(agentTime?.querySelector(".bg-attention-fill")?.getAttribute("aria-hidden")).toBe(
      "true",
    );
    // No "Late" chip any more: the time says it.
    expect(root.querySelector('[role="grid"]')?.textContent).not.toContain("Late");
  });
});
