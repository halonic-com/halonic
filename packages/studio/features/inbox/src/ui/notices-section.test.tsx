// @vitest-environment jsdom

import { KindedError } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeRuns } from "../fake-runs.test-helper.ts";
import { Inbox } from "../inbox.ts";
import type { FailedRunNotice } from "../notices/failed-run-notices.ts";
import type { InboxNotices } from "../notices/inbox-notices.ts";
import { pendingApproval, waitingRun } from "../test-runs.test-helper.ts";
import { fakeModal, restoreModal } from "../test-support/modal.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { InboxView } from "./inbox-page.tsx";

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

async function open(source: InboxNotices | undefined, openRun = vi.fn()) {
  const waiting = waitingRun("r1", {
    approvals: [pendingApproval("call-1", "notes-mcp__create_note", new Date().toISOString())],
  });
  const inbox = new Inbox(fakeRuns([waiting]).runs);
  const root = render(<InboxView inbox={inbox} notices={source} openRun={openRun} />);
  await settled();
  return { root, openRun };
}

function fakeNotices(list: () => Promise<readonly FailedRunNotice[]>) {
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

  it("dismisses a notice and moves focus to the next one's ×", async () => {
    const { source, dismiss } = fakeNotices(async () => [a, b]);
    const { root } = await open(source);
    await act(async () => button(root, "Dismiss Daily summary failed at 06:00").click());
    expect(dismiss).toHaveBeenCalledWith(a.key);
    expect(document.activeElement).toBe(button(root, "Dismiss Weekly report failed at 07:00"));
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
