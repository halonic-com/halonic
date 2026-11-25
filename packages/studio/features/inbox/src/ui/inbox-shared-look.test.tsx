// @vitest-environment jsdom

import { NarrowProvider } from "@halonicjs/studio-kit";
import { FakeAgentMessaging } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { fakeRuns } from "../fake-runs.test-helper.ts";
import { Inbox, type InboxRuns } from "../inbox.ts";
import { pendingApproval, waitingRun } from "../test-runs.test-helper.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { InboxView } from "./inbox-page.tsx";

afterEach(unmountAll);

// Local times, so the test reads the same in every time zone. Sun 8 Nov 2026.
const at = (hour: number, minute: number) => new Date(2026, 10, 8, hour, minute).toISOString();
const now = () => new Date(2026, 10, 8, 10, 43);

const notes = waitingRun("r1", {
  approvals: [pendingApproval("call-1", "notes-mcp__create_note", at(10, 42))],
});
const review = waitingRun("r2", {
  lastWaitingAt: at(9, 0),
  waitingFor: { title: "Approve this reply?", body: "" },
});

/** Acme's source with Chief, Chief of Staff, and the questions Chief asks. */
function acme(...questions: string[]) {
  const messaging = new FakeAgentMessaging({ now });
  const source = messaging.addSource({ label: "Paperclip · Acme", provider: "paperclip" });
  const chief = messaging.addAgent(source.id, { name: "Chief", title: "Chief of Staff" });
  for (const question of questions) {
    messaging.addInboxItem(source.id, {
      question,
      from: { kind: "agent", agent: chief.id, name: "Chief" },
    });
  }
  return { messaging, source };
}

async function settled(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function openInbox(runs: InboxRuns, messaging?: FakeAgentMessaging, narrow = false) {
  const inbox = new Inbox(runs);
  const root = render(
    <NarrowProvider narrow={narrow}>
      <InboxView inbox={inbox} now={now} agentMessaging={messaging} />
    </NarrowProvider>,
  );
  await settled();
  return { root, inbox };
}

function rows(root: HTMLElement): HTMLTableRowElement[] {
  return [...root.querySelectorAll<HTMLTableRowElement>('[role="grid"] tr')];
}

function rowTitled(root: HTMLElement, title: string): HTMLTableRowElement {
  const found = rows(root).find((row) => row.textContent?.includes(title));
  if (found === undefined) throw new Error(`no row "${title}"`);
  return found;
}

async function open(row: HTMLTableRowElement) {
  await act(async () => {
    row.querySelector<HTMLElement>('[role="gridcell"]')?.click();
  });
  await settled();
}

/** The open item's place, "2 of 6", in the bar over it. */
function place(root: HTMLElement): string | undefined {
  return root.querySelector('[data-pane="item"] p.ms-auto')?.textContent ?? undefined;
}

verifies("inbox.row-marks", () => {
  it("starts an approval with a stamp, a person step with a pause and an agent's card with its picture", async () => {
    const { messaging } = acme("Ship 0.2 today?");
    const { root } = await openInbox(fakeRuns([notes, review]).runs, messaging);
    const mark = (title: string) => rowTitled(root, title).querySelector('[aria-hidden="true"]');
    expect(mark("create_note")?.querySelector("svg path")?.getAttribute("d")).toBe(
      "M9.5 4.5h5l-1 6.5h-3z",
    );
    expect(mark("Approve this reply?")?.querySelectorAll("svg path")).toHaveLength(2);
    expect(mark("Ship 0.2 today?")?.textContent).toBe("C");
  });

  it("starts a question from a person, not an agent, with a question mark", async () => {
    const messaging = new FakeAgentMessaging({ now });
    const source = messaging.addSource({ label: "Paperclip · Acme", provider: "paperclip" });
    messaging.addInboxItem(source.id, {
      question: "Which hostname?",
      from: { kind: "person", name: "Acme support" },
    });
    const { root } = await openInbox(fakeRuns([]).runs, messaging);
    const mark = rowTitled(root, "Which hostname?").querySelector('[aria-hidden="true"]');
    expect(mark?.querySelector("circle")).not.toBeNull();
    expect(mark?.textContent).toBe("");
  });
});

verifies("inbox.one-count", () => {
  describe.each([
    ["on the desktop", false],
    ["with one pane at a time", true],
  ])("%s", (_name, narrow) => {
    it("counts the agents' cards in the heading and in the open item's place", async () => {
      const { messaging } = acme("Ship 0.2 today?", "Move the board meeting?");
      const { root } = await openInbox(fakeRuns([notes, review]).runs, messaging, narrow);
      expect(root.textContent).toContain("4 waiting");

      await open(rowTitled(root, "Approve this reply?"));
      expect(place(root)).toBe("2 of 4");
    });
  });

  it("gives a bundle of an agent's cards the place of its first card", async () => {
    const { messaging } = acme("Ship 0.2 today?", "Move the board meeting?");
    const { root } = await openInbox(fakeRuns([notes, review]).runs, messaging);
    await open(rowTitled(root, "2 cards from Chief"));
    expect(place(root)).toBe("3 of 4");
  });
});

verifies("inbox.agent-asks", () => {
  it("says who asks with their title, and shows a one-line question once", async () => {
    const { messaging } = acme("Ship 0.2 today?");
    const { root } = await openInbox(fakeRuns([]).runs, messaging);
    await open(rowTitled(root, "Ship 0.2 today?"));
    const card = root.querySelector("section") as HTMLElement;
    expect(card.querySelector("p")?.textContent).toBe("CChief · Chief of Staff asks");
    expect(card.textContent?.split("Ship 0.2 today?")).toHaveLength(2);
  });

  it("says the name alone without a title, and the body of a longer question", async () => {
    const messaging = new FakeAgentMessaging({ now });
    const source = messaging.addSource({ label: "Paperclip · Acme", provider: "paperclip" });
    const liam = messaging.addAgent(source.id, { name: "Liam" });
    messaging.addInboxItem(source.id, {
      question: "Merge the release PR?\n\nCI is green on the merge.",
      from: { kind: "agent", agent: liam.id, name: "Liam" },
    });
    const { root } = await openInbox(fakeRuns([]).runs, messaging);
    await open(rowTitled(root, "Merge the release PR?"));
    const card = root.querySelector("section") as HTMLElement;
    expect(card.textContent).toContain("Liam asks");
    expect(card.textContent).toContain("CI is green on the merge.");
  });
});

verifies("inbox.stale-callout", () => {
  it("says the stale line in a callout whose Try again loads the Inbox again", async () => {
    const fake = fakeRuns([notes]);
    const { root, inbox } = await openInbox(fake.runs);
    fake.fail(new Error("fetch failed"));
    await act(() => inbox.refresh());
    const status = root.querySelector('[data-pane="list"] [role="status"]') as HTMLElement;
    expect(status.textContent).toContain("Showing what it said last.");

    fake.answer();
    const retry = [...status.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Try again"),
    );
    await act(async () => retry?.click());
    await settled();
    expect(status.textContent).toBe("");
    expect(rows(root)).toHaveLength(1);
  });
});
