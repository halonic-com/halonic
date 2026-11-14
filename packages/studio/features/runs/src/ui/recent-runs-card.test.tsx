// @vitest-environment jsdom
import { PresentationProvider } from "@halonicjs/studio-kit";
import { createShell } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act, Component, type ReactNode, Suspense, useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { type RunsSource, RunsSourceService } from "../api.ts";
import { runsFeature } from "../feature.ts";
import { RunsList, RunsListService } from "../runs-list.ts";
import { fakeSource } from "../source.test-helper.ts";
import { approvalAt, mondayMorning, summaryWith } from "../summary.test-helper.ts";
import { renderSuspending, unmountAll } from "../test-support/render.tsx";
import { RecentRunsView } from "./recent-runs-card.tsx";

afterEach(unmountAll);

const running = summaryWith({ id: "run_a_7k2m9p", state: "draft" });
const needsYou = summaryWith({ id: "run_b_01jd8q", approvals: [approvalAt(1)] });
const done = summaryWith({ id: "run_c_4f2a1b", status: "completed" });
const failed = summaryWith({ id: "run_d_9x8y7z", status: "failed", error: "boom" });
const finishedTest = summaryWith({ id: "run_e_t0t0t0", kind: "test", status: "completed" });

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
        Couldn't load recent runs · Try again
      </button>
    );
  }
}

function OnHome(props: {
  readonly list: RunsList;
  readonly openRuns?: () => void;
  readonly openRun?: (run: { id: string }) => void;
  readonly phone?: boolean;
}) {
  const [attempt, setAttempt] = useState(0);
  const view = (
    <Section key={attempt} onRetry={() => setAttempt((count) => count + 1)}>
      <RecentRunsView
        list={props.list}
        now={() => mondayMorning}
        {...(props.openRuns === undefined ? {} : { openRuns: props.openRuns })}
        {...(props.openRun === undefined ? {} : { openRun: props.openRun })}
      />
    </Section>
  );
  return props.phone === true ? (
    <PresentationProvider presentation="phone">{view}</PresentationProvider>
  ) : (
    view
  );
}

async function show(source: RunsSource, props: Omit<Parameters<typeof OnHome>[0], "list"> = {}) {
  const list = new RunsList(source);
  const root = await renderSuspending(<OnHome list={list} {...props} />);
  await settled();
  await settled();
  return { root, list };
}

function rows(root: HTMLElement): string[] {
  return [...root.querySelectorAll('[role="grid"] [role="gridcell"]')].map(
    (cell) => cell.textContent ?? "",
  );
}

class WorkspaceServices {
  readonly #services = new Map<string, unknown>();
  provide(key: { name: string }, service: unknown): void {
    this.#services.set(key.name, service);
  }
  get(key: { name: string }) {
    return this.#services.get(key.name);
  }
  has(key: { name: string }): boolean {
    return this.#services.has(key.name);
  }
}

verifies("runs.home", () => {
  it("adds Home's Recent runs, whose heading counts the running runs and follows them", async () => {
    const shell = createShell({ features: [runsFeature], hostServices: [RunsSourceService] });
    const fake = fakeSource([done]);
    const workspace = new WorkspaceServices();
    workspace.provide(RunsSourceService, fake.source);
    shell.services.instantiate(workspace as never);
    const card = shell.contributions.home.cards().find((added) => added.id === "recent-runs");
    const context = shell.services.contextFor("runs", workspace as never);
    await (workspace.get(RunsListService) as RunsList).refresh();
    expect(card?.signal?.(context)).toBeUndefined();

    const listener = vi.fn();
    const stop = card?.subscribeSignal?.(context, listener);
    fake.change([running, done]);
    await settled();
    expect(listener).toHaveBeenCalled();
    expect(card?.signal?.(context)).toEqual({ mark: "running", value: 1, spoken: "1 running" });
    stop?.();
    expect(await card?.load()).toHaveProperty("RecentRunsCard");
  });

  it("shows each run's workflow, line and chip, those that need you first, without a finished test run", async () => {
    const { root } = await show(fakeSource([done, failed, finishedTest, needsYou, running]).source);
    expect(root.querySelector('[role="grid"]')?.getAttribute("aria-label")).toBe("Recent runs");
    expect(rows(root)).toEqual([
      "Support replyWaiting for your approval in the step SendNeeds you",
      "Support replyIn DraftRunning",
      "Support replySent nothingDone",
      "Support replySupport reply failed in the step Draft.Failed",
    ]);
  });

  it("says there are no runs yet", async () => {
    const { root } = await show(fakeSource([]).source);
    expect(root.textContent).toContain(
      "No runs yet. When an agent or workflow runs, you'll see it here.",
    );
    expect(root.textContent).toContain(
      "Studio shows what your agents are doing and lets you read each run. To start one, use the command line: halonic run.",
    );
    expect(root.querySelector("code")?.textContent).toBe("halonic run");
  });

  it("leaves the command line note out once there are runs", async () => {
    const { root } = await show(fakeSource([done]).source);
    expect(root.textContent).not.toContain("use the command line");
  });

  it("shows its skeleton until the first list loads, then its error with Try again", async () => {
    const fake = fakeSource([done]);
    fake.fail(new Error("down"));
    const { root } = await show(fake.source);
    expect(root.textContent).toContain("Couldn't load recent runs");
    fake.answer();
    await act(async () => root.querySelector("button")?.click());
    await settled();
    await settled();
    expect(rows(root)).toEqual(["Support replySent nothingDone"]);
  });

  it("opens a run in the active tab from its row", async () => {
    const openRun = vi.fn();
    const { root } = await show(fakeSource([done]).source, { openRun });
    const cell = root.querySelector<HTMLElement>('[role="gridcell"]') as HTMLElement;
    act(() => cell.focus());
    act(() => {
      cell.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
      );
    });
    expect(openRun).toHaveBeenCalledWith(expect.objectContaining({ id: "run_c_4f2a1b" }));
  });

  it("follows the rows with See all runs on a phone only", async () => {
    const openRuns = vi.fn();
    const desktop = await show(fakeSource([done]).source, { openRuns });
    expect(desktop.root.textContent).not.toContain("See all runs");
    unmountAll();
    const phone = await show(fakeSource([done]).source, { openRuns, phone: true });
    const seeAll = [...phone.root.querySelectorAll("button")].find(
      (button) => button.textContent === "See all runs",
    );
    await act(async () => seeAll?.click());
    expect(openRuns).toHaveBeenCalledTimes(1);
  });
});
