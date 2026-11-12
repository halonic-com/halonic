// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { RunsList } from "../runs-list.ts";
import { fakeSource } from "../source.test-helper.ts";
import { approvalAt, mondayMorning, summaryWith } from "../summary.test-helper.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { RunView, type RunViewProps } from "./run-page.tsx";

afterEach(() => {
  unmountAll();
  vi.useRealTimers();
});

const running = summaryWith({ id: "run_a_7k2m9p" });
const needsYou = summaryWith({ id: "run_b_01jd8q", approvals: [approvalAt(1)] });
const parent = summaryWith({ id: "run_c_4f2a1b", status: "waiting", waitingOn: running.id });

async function settled(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function openRun(
  source: ReturnType<typeof fakeSource>["source"],
  runId: string,
  props: Partial<RunViewProps> = {},
) {
  const list = new RunsList(source);
  const root = render(<RunView list={list} runId={runId} now={() => mondayMorning} {...props} />);
  await settled();
  return { root, list };
}

function button(root: HTMLElement, name: string): HTMLButtonElement {
  const found = [...root.querySelectorAll("button")].find(
    (element) => element.textContent?.trim() === name,
  );
  if (found === undefined) throw new Error(`no button "${name}"`);
  return found;
}

verifies("runs.run-page", () => {
  it("shows the header of a live run, without a banner", async () => {
    const { root } = await openRun(fakeSource([running]).source, running.id);

    expect(root.querySelector("h1")?.textContent).toBe("Run 7k2m9p");
    expect(root.querySelector("header")?.textContent).toBe(
      "Run · Support replyRun 7k2m9pRunningtoday 10:40 · updates live",
    );
    expect(root.querySelector("section")).toBeNull();
  });

  it("names the banner's region and sends Review in Inbox to the Inbox", async () => {
    const reviewInInbox = vi.fn();
    const { root } = await openRun(fakeSource([needsYou]).source, needsYou.id, {
      reviewInInbox,
    });

    const banner = root.querySelector('section[aria-label="Waiting for you"]');
    expect(banner?.textContent).toContain(
      "Waiting for your approval in the step Send. Nothing runs until you decide.",
    );
    await act(async () => button(root, "Review in Inbox").click());
    expect(reviewInInbox).toHaveBeenCalledOnce();
  });

  it("opens a child run from its banner, and leaves out a button it can't follow", async () => {
    const openRunPage = vi.fn();
    const source = fakeSource([parent, running]).source;
    const { root } = await openRun(source, parent.id, { openRun: openRunPage });

    expect(root.textContent).toContain("Waiting for child run 7k2m9p (Support reply).");
    await act(async () => button(root, "Open run 7k2m9p").click());
    expect(openRunPage).toHaveBeenCalledWith(running.id);

    unmountAll();
    const without = await openRun(source, parent.id);
    expect(without.root.querySelector("button")).toBeNull();
  });

  it("updates in place as the run moves on", async () => {
    const fake = fakeSource([running]);
    const { root } = await openRun(fake.source, running.id);

    fake.change([{ ...running, approvals: [approvalAt(1)] }]);
    await settled();

    expect(root.querySelector("h1")?.textContent).toBe("Run 7k2m9p");
    expect(root.querySelector("header")?.textContent).toContain("Needs you");
    expect(root.querySelector('section[aria-label="Waiting for you"]')).not.toBeNull();
  });

  it("keeps the run and adds the engine's line when a later load fails", async () => {
    const fake = fakeSource([running]);
    const { root, list } = await openRun(fake.source, running.id);

    fake.fail(new Error("no answer"));
    await act(async () => list.refresh());

    expect(root.querySelector("h1")?.textContent).toBe("Run 7k2m9p");
    expect(root.textContent).toContain("The engine isn't answering. Showing what it said last.");
  });

  it("says the run isn't in this workspace any more, with Go to Runs", async () => {
    const goToRuns = vi.fn();
    const { root } = await openRun(fakeSource([running]).source, "run_gone_aaaaaa", { goToRuns });

    expect(root.textContent).toContain("This run isn't in this workspace any more.");
    await act(async () => button(root, "Go to Runs").click());
    expect(goToRuns).toHaveBeenCalledOnce();
  });

  it("shows the h1 while it loads, and Couldn't load with Try again when the first load fails", async () => {
    const fake = fakeSource([running]);
    fake.fail(new Error("no answer"));
    const { root } = await openRun(fake.source, running.id);

    expect(root.querySelector("h1")?.textContent).toBe("Run 7k2m9p");
    expect(root.textContent).toContain("Couldn't load run 7k2m9p");
    expect(root.textContent).toContain("The engine isn't answering. It may still be starting.");

    fake.answer();
    await act(async () => button(root, "Try again").click());
    await settled();
    expect(root.querySelector("header")?.textContent).toContain("Running");
  });

  it("says it's loading the run after 300 ms", async () => {
    vi.useFakeTimers();
    const list = new RunsList({ ...fakeSource([]).source, list: () => new Promise(() => {}) });
    const root = render(<RunView list={list} runId={running.id} />);

    expect(root.querySelector("h1")?.textContent).toBe("Run 7k2m9p");
    await act(async () => vi.advanceTimersByTime(300));
    expect(root.querySelector('[role="status"]')?.textContent).toBe("Loading run 7k2m9p");
  });
});
