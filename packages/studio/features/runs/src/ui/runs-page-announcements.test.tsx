// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { RunsList } from "../runs-list.ts";
import { fakeSource } from "../source.test-helper.ts";
import { approvalAt, mondayMorning, summaryWith } from "../summary.test-helper.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { RunsView } from "./runs-page.tsx";

afterEach(unmountAll);

const yesterday = new Date(2026, 10, 8, 16, 0).toISOString();
const running = summaryWith({ id: "run_a_7k2m9p", state: "draft" });
const needsYou = summaryWith({ id: "run_b_01jd8q", approvals: [approvalAt(1)] });
const done = summaryWith({ id: "run_c_4f2a1b", status: "completed", startedAt: yesterday });

async function settled(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

/** The button or the status chip's radio with this name. */
function control(root: HTMLElement, name: string): HTMLElement {
  const found = [...root.querySelectorAll<HTMLElement>("button, label")].find(
    (element) => element.textContent?.trim() === name,
  );
  if (found === undefined) throw new Error(`no control "${name}"`);
  return found.querySelector("input") ?? found;
}

async function click(target: HTMLElement) {
  await act(async () => target.click());
}

verifies("runs.list-announcements", () => {
  async function openListening(fake: ReturnType<typeof fakeSource>) {
    const announceState = vi.fn<(key: string, text: string) => void>();
    const root = render(
      <RunsView
        list={new RunsList(fake.source)}
        now={() => mondayMorning}
        announceState={announceState}
      />,
    );
    await settled();
    return { root, announceState };
  }

  it("reads how many runs a filter leaves, or the filter's own line when it leaves none", async () => {
    const { root, announceState } = await openListening(fakeSource([running, needsYou, done]));
    expect(announceState).not.toHaveBeenCalled();

    await click(control(root, "Live 2"));
    expect(announceState).toHaveBeenLastCalledWith("runs-filter", "2 runs.");
    await click(control(root, "Needs you 1"));
    expect(announceState).toHaveBeenLastCalledWith("runs-filter", "1 run.");
    await click(control(root, "Failed"));
    expect(announceState).toHaveBeenLastCalledWith("runs-filter", "No failed runs.");
    expect(announceState).toHaveBeenCalledTimes(3);
  });

  it("reads nothing when a run in the list changes status", async () => {
    const fake = fakeSource([running]);
    const { announceState } = await openListening(fake);

    fake.change([{ ...running, approvals: [approvalAt(1)] }]);
    await settled();

    expect(announceState).not.toHaveBeenCalled();
  });
});
