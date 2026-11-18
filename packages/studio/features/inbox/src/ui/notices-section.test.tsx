// @vitest-environment jsdom

import { KindedError } from "@halonicjs/std";
import { engineWords } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeRuns } from "../fake-runs.test-helper.ts";
import { Inbox } from "../inbox.ts";
import type { FailedRunNotice } from "../notices/failed-run-notices.ts";
import type { InboxNotice, InboxNotices } from "../notices/inbox-notices.ts";
import { pendingApproval, waitingRun } from "../test-runs.test-helper.ts";
import { fakeModal, restoreModal } from "../test-support/modal.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { InboxView } from "./inbox-page.tsx";
import { NoticesSection } from "./notices-section.tsx";

beforeEach(fakeModal);
afterEach(() => {
  unmountAll();
  restoreModal();
});

function notice(runId: string, title: string, fixed = false): FailedRunNotice {
  return {
    kind: "failed-run",
    key: `failed-run:acme/${runId}:2026-11-16`,
    routineId: `acme/${runId}`,
    runId,
    hubId: "acme",
    at: "2026-11-16T06:00:00.000Z",
    count: 1,
    fixed,
    title,
  };
}

async function settled(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function open(
  source: InboxNotices | undefined,
  openRun = vi.fn(),
  openBudget: (() => void) | undefined = undefined,
) {
  const waiting = waitingRun("r1", {
    approvals: [pendingApproval("call-1", "notes-mcp__create_note", new Date().toISOString())],
  });
  const inbox = new Inbox(fakeRuns([waiting]).runs);
  const root = render(
    <InboxView inbox={inbox} notices={source} openRun={openRun} openBudget={openBudget} />,
  );
  await settled();
  return { root, openRun };
}

function fakeNotices(list: () => Promise<readonly InboxNotice[]>) {
  const dismiss = vi.fn();
  const source: InboxNotices = { list, subscribe: () => () => {}, dismiss };
  return { source, dismiss };
}

function button(root: HTMLElement, name: string): HTMLButtonElement {
  const found = [...root.querySelectorAll("button")].find(
    (b) => b.textContent?.startsWith(name) || b.getAttribute("aria-label") === name,
  );
  if (found === undefined) throw new Error(`no button "${name}"`);
  return found;
}

verifies("inbox.notices-section", () => {
  const a = notice("r7", "Daily summary failed at 06:00");
  const b = notice("r8", "Weekly report failed at 07:00");

  it("opens the notice's newest run in its hub", async () => {
    const { source } = fakeNotices(async () => [a]);
    const { root, openRun } = await open(source);
    expect(root.querySelector("#inbox-notices")?.textContent).toContain("Notices");
    await act(async () => button(root, "Open run").click());
    expect(openRun).toHaveBeenCalledWith("acme", "r7");
  });

  it("opens the budget from the monthly budget notice, which has no Open run", async () => {
    const month: InboxNotice = {
      kind: "budget-month",
      key: "budget-month:2026-11:50",
      at: "2026-11-16T06:00:00.000Z",
      title: "This month's estimated spend reached its budget of €50.00.",
    };
    const { source } = fakeNotices(async () => [month]);
    const openBudget = vi.fn();
    const { root } = await open(source, vi.fn(), openBudget);
    expect(() => button(root, "Open run")).toThrow();
    await act(async () => button(root, "Change budget").click());
    expect(openBudget).toHaveBeenCalledOnce();
  });

  it("opens a run the run budget stopped", async () => {
    const stopped: InboxNotice = {
      kind: "budget-run",
      key: "budget-run:r5",
      runId: "r5",
      hubId: "acme",
      at: "2026-11-16T06:00:00.000Z",
      title: "Support replies stopped at its estimated budget",
    };
    const { source } = fakeNotices(async () => [stopped]);
    const { root, openRun } = await open(source);
    await act(async () => button(root, "Open run").click());
    expect(openRun).toHaveBeenCalledWith("acme", "r5");
  });

  it("dismisses a notice and moves focus to the next one's ×", async () => {
    const { source, dismiss } = fakeNotices(async () => [a, b]);
    const { root } = await open(source);
    await act(async () => button(root, "Dismiss Daily summary failed at 06:00").click());
    expect(dismiss).toHaveBeenCalledWith(a.key);
    expect(document.activeElement).toBe(button(root, "Dismiss Weekly report failed at 07:00"));
  });

  it("moves focus to the Needs you heading when the last notice goes", async () => {
    const { source } = fakeNotices(async () => [a]);
    const { root } = await open(source);
    await act(async () => button(root, "Dismiss Daily summary failed at 06:00").click());
    const heading = [...root.querySelectorAll("h2")].find((h) =>
      h.textContent?.includes("Needs you"),
    );
    expect(document.activeElement).toBe(heading);
  });

  it("describes each Open run by its row's title", async () => {
    const { source } = fakeNotices(async () => [a, b]);
    const { root } = await open(source);
    const described = [...root.querySelectorAll("button")]
      .filter((x) => x.textContent === "Open run")
      .map((x) => document.getElementById(x.getAttribute("aria-describedby") ?? "")?.textContent);
    expect(described).toEqual([a.title, b.title]);
  });

  it("shows no other source's notices when a new source fails to read", async () => {
    const first = fakeNotices(async () => [a]).source;
    const second = fakeNotices(async () => {
      throw new KindedError("unavailable", "The engine isn't answering.");
    }).source;
    function Switch() {
      const [source, setSource] = useState(first);
      return (
        <>
          <button type="button" onClick={() => setSource(second)}>
            Switch
          </button>
          <NoticesSection
            source={source}
            openRun={undefined}
            onEmptied={() => {}}
            words={engineWords["desktop-app"]}
          />
        </>
      );
    }
    const root = render(<Switch />);
    await settled();
    expect(root.textContent).toContain(a.title);
    await act(async () => button(root, "Switch").click());
    await settled();
    expect(root.textContent).not.toContain(a.title);
    expect(root.textContent).toContain("Couldn't load notices");
  });

  it("says Fixed in place of Open run and keeps the ×", async () => {
    const { source } = fakeNotices(async () => [
      notice("r7", "Daily summary failed at 06:00", true),
    ]);
    const { root } = await open(source);
    expect(root.textContent).toContain("Fixed");
    expect(root.textContent).not.toContain("Open run");
    expect(button(root, "Dismiss Daily summary failed at 06:00")).toBeDefined();
  });

  it("hides the heading with no notices or no source", async () => {
    for (const source of [undefined, fakeNotices(async () => []).source]) {
      const { root } = await open(source);
      expect(root.querySelector("#inbox-notices")).toBeNull();
      unmountAll();
    }
  });

  it("shows no Notices section while Needs you failed to load", async () => {
    const { source } = fakeNotices(async () => [a]);
    const fake = fakeRuns([]);
    fake.fail(new Error("fetch failed"));
    const root = render(
      <InboxView inbox={new Inbox(fake.runs)} notices={source} openRun={vi.fn()} />,
    );
    await settled();
    expect(root.textContent).toContain("Couldn't load the Inbox");
    expect(root.querySelector("#inbox-notices")).toBeNull();
    expect(root.textContent).not.toContain("Daily summary failed at 06:00");
  });

  describe("when they can't be read", () => {
    it("says so under the heading, keeps Needs you and retries", async () => {
      let fail = true;
      const { source } = fakeNotices(async () => {
        if (fail) throw new KindedError("unavailable", "The engine isn't answering.");
        return [a];
      });
      const { root } = await open(source);
      expect(root.textContent).toContain("Couldn't load notices");
      expect(root.textContent).toContain("Needs you");
      fail = false;
      await act(async () => button(root, "Try again").click());
      await settled();
      expect(root.textContent).toContain("Daily summary failed at 06:00");
      expect(root.textContent).not.toContain("Couldn't load notices");
    });
  });
});
