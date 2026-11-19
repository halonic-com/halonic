// @vitest-environment jsdom
import type { RunEvent } from "@halonicjs/events";
import { EngineNotAnswering, engineWords } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { DamagedRunLog, type RunsSource } from "../api.ts";
import { RunsList } from "../runs-list.ts";
import { fakeSource } from "../source.test-helper.ts";
import { approvalAt, mondayMorning, summaryWith } from "../summary.test-helper.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { entered, logOf } from "./run-log.test-helper.ts";
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

/** A source like the app's `WorkspaceRuns`: its lookups are methods that read a private field. */
class PrivateFieldSource {
  readonly #inner: RunsSource;
  readonly #names = new Map([["reporter", "Handbook reader"]]);
  readonly list: RunsSource["list"];
  readonly log: RunsSource["log"];
  readonly workflow: RunsSource["workflow"];
  readonly routine: RunsSource["routine"];
  readonly runnableWorkflows: RunsSource["runnableWorkflows"];
  readonly currency: RunsSource["currency"];
  readonly monthlyBudget: RunsSource["monthlyBudget"];
  readonly subscribe: RunsSource["subscribe"];

  constructor(inner: RunsSource) {
    this.#inner = inner;
    this.list = inner.list;
    this.log = inner.log;
    this.workflow = inner.workflow;
    this.routine = inner.routine;
    this.runnableWorkflows = inner.runnableWorkflows;
    this.currency = inner.currency;
    this.monthlyBudget = inner.monthlyBudget;
    this.subscribe = inner.subscribe;
  }

  agentName(id: string): string | undefined {
    return this.#names.get(id);
  }

  providerKind(id: string): ReturnType<RunsSource["providerKind"]> {
    return this.#inner.providerKind(id);
  }
}

verifies("runs.run-page", () => {
  it("shows the header of a live run, without a banner", async () => {
    const { root } = await openRun(fakeSource([running]).source, running.id);

    expect(root.querySelector("h1")?.textContent).toBe("Run 7k2m9p");
    expect(root.querySelector("header")?.textContent).toBe(
      "Support replyRun 7k2m9pRunningtoday 10:40 · updates live",
    );
    expect(root.querySelector("section[aria-label]")).toBeNull();
  });

  it("names the agent and tells a local model's failure from a source whose lookups use private fields", async () => {
    const source = new PrivateFieldSource(fakeSource([needsYou]).source);
    const { root } = await openRun(source, needsYou.id);
    expect(root.querySelector('section[aria-label="Waiting for you"]')?.textContent).toContain(
      "Handbook reader wants to send an email with Gmail",
    );

    const failedRun = summaryWith({
      id: "run_f_9x2k1a",
      status: "failed",
      reason: "model-unreachable",
      state: "draft",
    });
    const log = [
      {
        runId: failedRun.id,
        seq: 2,
        at: "2026-11-16T08:00:00Z",
        type: "llm.request",
        agent: "reporter",
        provider: "ollama",
        model: "llama3.2",
        messages: 1,
      },
      {
        runId: failedRun.id,
        seq: 3,
        at: "2026-11-16T08:00:01Z",
        type: "run.failed",
        state: "draft",
        error: "x",
        host: "localhost:11434",
      },
    ] as unknown as RunEvent[];
    const failing = new PrivateFieldSource(fakeSource([failedRun], { [failedRun.id]: log }).source);
    const failed = await openRun(failing, failedRun.id);
    expect(failed.root.textContent).toContain("Ollama may not be running on this computer");
  });

  it("tells the runs list the run's page was shown, once", async () => {
    const { list } = await openRun(fakeSource([running]).source, running.id);

    expect(list.hasOpened(running.id)).toBe(true);
    expect(list.hasOpened(needsYou.id)).toBe(false);
  });

  it("names the banner's region and sends Review in Inbox to the Inbox", async () => {
    const reviewInInbox = vi.fn();
    const { root } = await openRun(fakeSource([needsYou]).source, needsYou.id, {
      reviewInInbox,
    });

    const banner = root.querySelector('section[aria-label="Waiting for you"]');
    expect(banner?.textContent).toContain(
      "Waiting for your approval. Reporter wants to send an email with Gmail. Nothing is sent until you decide.",
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

  it("keeps the run and says it couldn't refresh it when a later load fails", async () => {
    const fake = fakeSource([running]);
    const { root, list } = await openRun(fake.source, running.id);

    fake.fail(new Error("no answer"));
    await act(async () => list.refresh());

    expect(root.querySelector("h1")?.textContent).toBe("Run 7k2m9p");
    expect(root.textContent).toContain(
      "Couldn't refresh run 7k2m9p. Halonic ran into a problem it can't explain yet.",
    );
    expect(root.textContent).not.toContain("isn't answering");
    expect(root.textContent).not.toContain("no answer");
  });

  it("keeps the run and says the host's engine line when the engine can't be reached", async () => {
    const fake = fakeSource([running]);
    const { root, list } = await openRun(fake.source, running.id, { engine: engineWords.phone });

    fake.fail(new EngineNotAnswering());
    await act(async () => list.refresh());

    expect(root.textContent).toContain(
      "Halonic on your computer isn't answering. Showing what it said last.",
    );
  });

  it("says the run isn't in this workspace any more, with Go to Runs", async () => {
    const goToRuns = vi.fn();
    const { root } = await openRun(fakeSource([running]).source, "run_gone_aaaaaa", { goToRuns });

    expect(root.textContent).toContain("This run isn't in this workspace any more.");
    await act(async () => button(root, "Go to Runs").click());
    expect(goToRuns).toHaveBeenCalledOnce();
  });

  it("loads the runs again before it says a run isn't here, as for a run that has just started", async () => {
    // The new run's folder is there, but nothing has told the list yet.
    let runs = [running];
    const fake = fakeSource(runs);
    const list = new RunsList({
      ...fake.source,
      list: async () => runs.map((summary) => ({ summary })),
    });
    await settled();
    runs = [needsYou, running];

    const root = render(<RunView list={list} runId={needsYou.id} now={() => mondayMorning} />);
    expect(root.textContent).not.toContain("This run isn't in this workspace any more.");
    const loadingHeading = root.querySelector("h1");
    expect(loadingHeading?.textContent).toBe("Run 01jd8q");
    loadingHeading?.setAttribute("tabindex", "-1");
    act(() => loadingHeading?.focus());
    await settled();

    expect(root.textContent).not.toContain("This run isn't in this workspace any more.");
    expect(root.querySelector('section[aria-label="Waiting for you"]')).not.toBeNull();
    // Focus moves from the loading page's h1 to the run's, as when a run page opens.
    expect(document.activeElement).toBe(root.querySelector("h1"));
    expect(document.activeElement?.textContent).toBe("Run 01jd8q");
  });

  it("says a run isn't here once the runs loaded again still haven't got it", async () => {
    const fake = fakeSource([running]);
    const list = new RunsList(fake.source);
    await settled();
    const refresh = vi.spyOn(list, "refresh");

    const root = render(<RunView list={list} runId="run_gone_aaaaaa" now={() => mondayMorning} />);
    expect(root.textContent).not.toContain("This run isn't in this workspace any more.");
    await settled();

    expect(refresh).toHaveBeenCalledOnce();
    expect(root.textContent).toContain("This run isn't in this workspace any more.");
  });

  it("shows the h1 while it loads, and Couldn't load with Try again when the first load fails", async () => {
    const fake = fakeSource([running]);
    fake.fail(new Error("no answer"));
    const { root } = await openRun(fake.source, running.id);

    expect(root.querySelector("h1")?.textContent).toBe("Run 7k2m9p");
    expect(root.textContent).toContain("Couldn't load run 7k2m9p");
    expect(root.textContent).toContain("Halonic ran into a problem it can't explain yet.");
    expect(button(root, "Copy details")).toBeDefined();
    expect(root.textContent).not.toContain("no answer");

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

  it("shows a skeleton named Loading the run while the log is read, then the receipt", async () => {
    vi.useFakeTimers();
    const slow = fakeSource([running]).source;
    const list = new RunsList({ ...slow, log: () => new Promise(() => {}) });
    const root = render(<RunView list={list} runId={running.id} now={() => mondayMorning} />);
    await act(async () => vi.advanceTimersByTime(1));
    await act(async () => vi.advanceTimersByTime(300));
    expect(root.querySelector('[role="status"]')?.textContent).toBe("Loading the run");
  });

  it("says why the log couldn't be read and reads it again on Try again", async () => {
    const fake = fakeSource([running]);
    fake.failLog(new Error("no answer"));
    const { root } = await openRun(fake.source, running.id);
    expect(root.textContent).toContain("Couldn't read this run's log");
    expect(root.textContent).toContain("Halonic ran into a problem it can't explain yet.");
    expect(root.textContent).not.toContain("isn't answering");

    fake.answer();
    await act(async () => button(root, "Try again").click());
    await settled();
    expect(root.textContent).not.toContain("Couldn't read this run's log");
    expect(root.textContent).toContain("Receipt");
  });

  it("names the damaged line in a red banner and shows what comes before it", async () => {
    const fake = fakeSource([running]);
    fake.failLog(new DamagedRunLog(212, []));
    const { root } = await openRun(fake.source, running.id);
    expect(root.querySelector('section[aria-label="Damaged run log"]')?.textContent).toContain(
      "Part of this run's log can't be read. Line 212 is damaged. Everything before it is shown, so the receipt may be incomplete.",
    );
    expect(root.textContent).toContain("Receipt");
  });
});

verifies("runs.run-view.agent-says", () => {
  it("shows what the agent says after the receipt and before Every step", async () => {
    const done = summaryWith({ id: "run_d_9w3k5t", status: "completed" });
    const log = logOf(done.id, [
      [1, entered("draft")],
      [
        2,
        {
          type: "agent.finished",
          state: "draft",
          agent: "reporter",
          output: "This week: 12 emails.",
        },
      ],
      [
        2,
        {
          type: "artifact.created",
          state: "draft",
          name: "weekly-report.md",
          hash: "a".repeat(64),
          mediaType: "text/markdown",
          size: 21,
        },
      ],
      [2, { type: "run.completed", state: "done", context: {} }],
    ]);
    const { root } = await openRun(fakeSource([done], { [done.id]: log }).source, done.id);
    const text = root.textContent ?? "";
    expect(text).toContain("Created 1 file: weekly-report.md");
    const frame = text.indexOf(
      "What the agent says it did (its own words, not checked)This week: 12 emails.",
    );
    expect(frame).toBeGreaterThan(text.indexOf("Created 1 file"));
    expect(text.indexOf("Every step")).toBeGreaterThan(frame);
  });
});
