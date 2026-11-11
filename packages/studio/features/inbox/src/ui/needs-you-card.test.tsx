// @vitest-environment jsdom
import type { RunSummary } from "@halonicjs/events";
import { PresentationProvider } from "@halonicjs/studio-kit";
import { createShell } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act, Component, type ReactNode, Suspense, useState } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { InboxRunsService, InboxService } from "../api.ts";
import { fakeRuns, WorkspaceServices } from "../fake-runs.test-helper.ts";
import { inboxFeature } from "../feature.ts";
import { Inbox, type InboxRuns } from "../inbox.ts";
import { pendingApproval, waitingRun } from "../test-runs.test-helper.ts";
import { fakeModal, restoreModal } from "../test-support/modal.ts";
import { render, renderSuspending, unmountAll } from "../test-support/render.tsx";
import { InboxView } from "./inbox-page.tsx";
import { NeedsYouView } from "./needs-you-card.tsx";

beforeEach(fakeModal);
afterEach(() => {
  unmountAll();
  restoreModal();
});

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
const many = (count: number): RunSummary[] =>
  Array.from({ length: count }, (_, index) =>
    waitingRun(`w${index}`, {
      lastWaitingAt: at(8, index),
      waitingFor: { title: `Question ${index}`, body: "" },
    }),
  );

async function settled(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

/** Stands in for Home's section: the skeleton while the card suspends, its error and Try again. */
class Section extends Component<
  { readonly children: ReactNode; readonly onRetry: () => void },
  { readonly error: unknown }
> {
  override state = { error: undefined as unknown };
  static getDerivedStateFromError(error: unknown) {
    return { error };
  }
  override render() {
    if (this.state.error === undefined) {
      return <Suspense fallback={<p>Loading rows</p>}>{this.props.children}</Suspense>;
    }
    return (
      <button type="button" onClick={this.props.onRetry}>
        Couldn't load what needs you · Try again
      </button>
    );
  }
}

/** Needs you inside a stand-in section, which mounts it again on Try again as Home does. */
function OnHome(props: { readonly inbox: Inbox; readonly openInbox?: () => void }) {
  const [attempt, setAttempt] = useState(0);
  return (
    <Section key={attempt} onRetry={() => setAttempt((count) => count + 1)}>
      <NeedsYouView {...props} now={now} />
    </Section>
  );
}

function rows(root: HTMLElement): string[] {
  return [...root.querySelectorAll('[role="grid"] [role="gridcell"]')].map(
    (cell) => cell.textContent ?? "",
  );
}

function press(target: Element, key: string) {
  act(() => {
    target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  });
}

async function click(target: HTMLElement) {
  await act(async () => {
    target.click();
  });
}

function button(root: HTMLElement, name: string): HTMLButtonElement {
  const found = [...root.querySelectorAll("button")].find((b) => b.textContent?.startsWith(name));
  if (found === undefined) throw new Error(`no button "${name}"`);
  return found;
}

verifies("inbox.home", () => {
  it("adds Home's Needs you, whose count is the workspace Inbox's and follows it", async () => {
    const shell = createShell({ features: [inboxFeature], hostServices: [InboxRunsService] });
    const fake = fakeRuns([notes]);
    const workspace = new WorkspaceServices();
    workspace.provide(InboxRunsService, fake.runs);
    shell.services.instantiate(workspace);
    const card = shell.contributions.home.cards().find((added) => added.id === "needs-you");
    const context = shell.services.contextFor("inbox", workspace);
    await workspace.get(InboxService).refresh();
    expect(card?.signal?.(context)).toEqual({ mark: "count", value: 1, spoken: "1 waiting" });

    const listener = vi.fn();
    const stop = card?.subscribeSignal?.(context, listener);
    fake.change([notes, review]);
    await settled();
    expect(listener).toHaveBeenCalled();
    expect(card?.signal?.(context)?.value).toBe(2);
    stop?.();
    expect(await card?.load()).toHaveProperty("NeedsYouCard");
  });

  it("shows the Inbox's rows newest first, with no button on a row", async () => {
    const inbox = new Inbox(fakeRuns([review, notes]).runs);
    const root = await renderSuspending(<OnHome inbox={inbox} openInbox={() => {}} />);
    await settled();
    expect(root.querySelector('[role="grid"]')?.getAttribute("aria-label")).toBe("Needs you");
    expect(rows(root)).toEqual([
      "sorter wants to use create_note (notes-mcp)Waiting 1 min",
      "Approve this reply?Waiting 1 h",
    ]);
    expect(root.querySelector('[role="grid"] button')).toBeNull();
  });

  it("opens the Inbox with the item's card open when you press Enter on its row", async () => {
    const inbox = new Inbox(fakeRuns([notes, review]).runs);
    const openInbox = vi.fn();
    const home = await renderSuspending(<OnHome inbox={inbox} openInbox={openInbox} />);
    await settled();
    const cell = home.querySelectorAll<HTMLElement>('[role="gridcell"]')[1] as HTMLElement;
    act(() => cell.focus());
    press(cell, "Enter");
    expect(openInbox).toHaveBeenCalledTimes(1);

    const page = render(<InboxView inbox={inbox} now={now} />);
    const title = page.querySelector("section h2");
    expect(title?.textContent).toBe("Approve this reply?");
    expect(document.activeElement).toBe(title);
    // The request is taken once: the Inbox opened later starts with nothing open.
    expect(render(<InboxView inbox={inbox} now={now} />).querySelector("section h2")).toBeNull();
  });

  it("shows three rows on a phone, then See all N in Inbox", async () => {
    const inbox = new Inbox(fakeRuns(many(5)).runs);
    const openInbox = vi.fn();
    const root = await renderSuspending(
      <PresentationProvider presentation="phone">
        <OnHome inbox={inbox} openInbox={openInbox} />
      </PresentationProvider>,
    );
    await settled();
    expect(rows(root)).toHaveLength(3);
    await click(button(root, "See all 5 in Inbox"));
    expect(openInbox).toHaveBeenCalledTimes(1);
  });

  it("says nothing is waiting for you when nothing waits", async () => {
    const inbox = new Inbox(fakeRuns([]).runs);
    const root = await renderSuspending(<OnHome inbox={inbox} openInbox={() => {}} />);
    await settled();

    expect(root.querySelector('[role="grid"]')).toBeNull();
    expect(root.textContent).toBe("Nothing is waiting for you.");
  });

  it("shows loading rows until the first list loads", async () => {
    const runs: InboxRuns = {
      waiting: () => new Promise(() => {}),
      subscribe: () => () => {},
      send: vi.fn(),
    };
    const root = await renderSuspending(<OnHome inbox={new Inbox(runs)} />);
    await settled();
    expect(root.textContent).toBe("Loading rows");
  });

  it("shows the section's error when the first load fails, and Try again loads again", async () => {
    const fake = fakeRuns([notes]);
    fake.fail(new Error("fetch failed"));
    const root = await renderSuspending(<OnHome inbox={new Inbox(fake.runs)} />);
    await settled();
    expect(root.textContent).toContain("Couldn't load what needs you");

    fake.answer();
    await click(button(root, "Couldn't load what needs you"));
    await settled();
    expect(rows(root)).toHaveLength(1);
  });

  it("keeps the rows when a later load fails", async () => {
    const fake = fakeRuns([notes]);
    const inbox = new Inbox(fake.runs);
    const root = await renderSuspending(<OnHome inbox={inbox} />);
    await settled();
    fake.fail(new Error("fetch failed"));
    await act(() => inbox.refresh());
    expect(rows(root)).toHaveLength(1);
  });
});
