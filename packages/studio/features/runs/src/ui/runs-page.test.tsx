// @vitest-environment jsdom
import { createShell, type ServiceKey, type ServiceTarget } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type RunsSource, RunsSourceService } from "../api.ts";
import { runsFeature } from "../feature.ts";
import { RunsList, RunsListService } from "../runs-list.ts";
import { fakeSource } from "../source.test-helper.ts";
import { approvalAt, minutesLater, mondayMorning, summaryWith } from "../summary.test-helper.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { RunsView } from "./runs-page.tsx";

afterEach(unmountAll);

const yesterday = new Date(2026, 10, 8, 16, 0).toISOString();
const running = summaryWith({ id: "run_a_7k2m9p", state: "draft" });
const needsYou = summaryWith({ id: "run_b_01jd8q", approvals: [approvalAt(1)] });
const done = summaryWith({ id: "run_c_4f2a1b", status: "completed", startedAt: yesterday });
const budget = summaryWith({ id: "run_d_9x8y7z", status: "failed", reason: "budget" });
const finishedTest = summaryWith({ id: "run_e_t0t0t0", kind: "test", status: "completed" });
const waitingTest = summaryWith({
  id: "run_f_t1t1t1",
  kind: "test",
  status: "waiting",
  nextTimer: minutesLater(60),
});

async function settled(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function openPage(source: RunsSource, goToWorkflows?: () => void) {
  const list = new RunsList(source);
  const root = render(
    <RunsView
      list={list}
      now={() => mondayMorning}
      {...(goToWorkflows === undefined ? {} : { goToWorkflows })}
    />,
  );
  await settled();
  return { root, list };
}

/** Each day's heading, then its rows' text: what ran, the line, the tag, short id and chip. */
function shown(root: HTMLElement): string[] {
  return [...root.querySelectorAll('[role="grid"] tr, h2')].map((node) =>
    node.tagName === "H2" ? `# ${node.textContent}` : (node.textContent ?? ""),
  );
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

class WorkspaceServices implements ServiceTarget {
  readonly #services = new Map<string, unknown>();
  provide<Service>(key: ServiceKey<Service>, service: Service): void {
    this.#services.set(key.name, service);
  }
  get<Service>(key: ServiceKey<Service>): Service {
    return this.#services.get(key.name) as Service;
  }
  has(key: ServiceKey<unknown>): boolean {
    return this.#services.has(key.name);
  }
}

verifies("runs.list", () => {
  it("adds the Runs place, whose running dot reads the workspace's runs and follows them", async () => {
    const shell = createShell({ features: [runsFeature], hostServices: [RunsSourceService] });
    const fake = fakeSource([done]);
    const workspace = new WorkspaceServices();
    workspace.provide(RunsSourceService, fake.source);
    shell.services.instantiate(workspace);
    const place = shell.contributions.places.list().find((added) => added.id === "runs");
    const context = shell.services.contextFor("runs", workspace);
    await workspace.get(RunsListService).refresh();
    expect(place?.signal?.(context)).toBeUndefined();

    const listener = vi.fn();
    const stop = place?.subscribeSignal?.(context, listener);
    fake.change([running, done]);
    await settled();
    expect(listener).toHaveBeenCalled();
    expect(place?.signal?.(context)).toEqual({ mark: "running", value: 1, spoken: "1 running" });
    stop?.();
    expect(await place?.load()).toHaveProperty("RunsPage");
  });

  describe("the list", () => {
    it("shows the runs by day, newest first, with a live test run and its Test tag", async () => {
      const { root } = await openPage(
        fakeSource([running, needsYou, budget, finishedTest, waitingTest, done]).source,
      );
      expect(root.querySelector("h1")?.textContent).toBe("Runs");
      expect(root.textContent).toContain("A run is one time a workflow or agent does its job.");
      expect(shown(root)).toEqual([
        "# Today",
        "Support replyIn Draft7k2m9pRunning",
        "Support replyWaiting for your approval in the step Send01jd8qNeeds you",
        "Support replyBudget reached in Draft after 2 min9x8y7zStopped · budget",
        "Support replyWaiting until 11:40Testt1t1t1Waiting",
        "# Yesterday",
        "Support replySent nothing4f2a1bDone",
      ]);
    });

    it("filters by status, counting Live and Needs you, with every Stopped run under Failed", async () => {
      const { root } = await openPage(fakeSource([running, needsYou, budget, done]).source);
      expect((control(root, "All") as HTMLInputElement).checked).toBe(true);
      expect(control(root, "Needs you 1")).toBeDefined();
      await click(control(root, "Failed"));
      expect(shown(root)).toEqual([
        "# Today",
        "Support replyBudget reached in Draft after 2 min9x8y7zStopped · budget",
      ]);
      await click(control(root, "Live 2"));
      expect(shown(root)).toHaveLength(3);
    });

    it("shows finished test runs once Test runs is on", async () => {
      const { root } = await openPage(fakeSource([done, finishedTest]).source);
      expect(shown(root)).toEqual(["# Yesterday", "Support replySent nothing4f2a1bDone"]);
      const testRuns = control(root, "Test runs");
      expect(testRuns.getAttribute("aria-pressed")).toBe("false");
      await click(testRuns);
      expect(testRuns.getAttribute("aria-pressed")).toBe("true");
      expect(shown(root)).toHaveLength(4);
    });

    it("updates the rows in place when a run changes", async () => {
      const fake = fakeSource([running]);
      const { root } = await openPage(fake.source);
      fake.change([summaryWith({ id: "run_a_7k2m9p", status: "completed" })]);
      await settled();
      expect(shown(root)).toEqual(["# Today", "Support replySent nothing7k2m9pDone"]);
    });
  });

  describe("in place of rows", () => {
    it("says there are no runs yet, with no filters, and goes to Workflows", async () => {
      const goToWorkflows = vi.fn();
      const { root } = await openPage(fakeSource([]).source, goToWorkflows);
      expect(root.textContent).toContain("No runs yet");
      expect(root.textContent).toContain("Start one from a workflow's Run button");
      expect(root.querySelector("[role=radiogroup]")).toBeNull();
      await click(control(root, "Go to Workflows"));
      expect(goToWorkflows).toHaveBeenCalled();
    });

    it("says only test runs are there, and Show test runs shows them", async () => {
      const { root } = await openPage(fakeSource([finishedTest]).source);
      expect(root.textContent).toContain("Only test runs so far.");
      await click(control(root, "Show test runs"));
      expect(shown(root)).toHaveLength(2);
      expect(control(root, "Test runs").getAttribute("aria-pressed")).toBe("true");
    });

    it("gives a status chip with no runs its line, with no button", async () => {
      const { root } = await openPage(fakeSource([done]).source);
      await click(control(root, "Needs you 0"));
      expect(root.textContent).toContain("Nothing is waiting for you.");
      expect(root.querySelector("[role=grid]")).toBeNull();
    });

    it("waits for the first list without saying there are no runs", async () => {
      const source: RunsSource = {
        ...fakeSource([]).source,
        list: () => new Promise(() => {}),
      };
      const { root } = await openPage(source);
      expect(root.textContent).not.toContain("No runs yet");
      expect(root.querySelector("[role=radiogroup]")).not.toBeNull();
    });

    it("says it couldn't load, that the engine isn't answering, and tries again", async () => {
      const fake = fakeSource([done]);
      fake.fail(new Error("fetch failed"));
      const { root } = await openPage(fake.source);
      expect(root.textContent).toContain("Couldn't load runs");
      expect(root.textContent).toContain("The engine isn't answering. It may still be starting.");
      expect(root.textContent).not.toContain("fetch failed");

      fake.answer();
      await click(control(root, "Try again"));
      await settled();
      expect(shown(root)).toHaveLength(2);
    });

    it("keeps the rows when a later load fails, and says they're what the engine said last", async () => {
      const fake = fakeSource([done]);
      const { root, list } = await openPage(fake.source);
      fake.fail(new Error("fetch failed"));
      await act(() => list.refresh());
      expect(shown(root)).toHaveLength(2);
      expect(root.textContent).toContain("The engine isn't answering. Showing what it said last.");
    });
  });
});
