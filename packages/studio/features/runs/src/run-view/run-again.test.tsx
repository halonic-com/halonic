// @vitest-environment jsdom
import { EngineNotAnswering, type EngineWords, engineWords } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import type { RunStartHost } from "../api.ts";
import { RunsList } from "../runs-list.ts";
import { fakeSource } from "../source.test-helper.ts";
import { mondayMorning, summaryWith } from "../summary.test-helper.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { entered, logOf } from "./run-log.test-helper.ts";
import { RunView } from "./run-page.tsx";

afterEach(unmountAll);

async function settled(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function open(
  summary: ReturnType<typeof summaryWith>,
  runStart: RunStartHost | undefined,
  openRun = vi.fn(),
  announce?: (line: string) => void,
  engine?: EngineWords,
) {
  const log = logOf(summary.id, [[0, entered("draft")]]).map((event) =>
    event.type === "run.started" ? { ...event, input: { message: "Hi" } } : event,
  );
  const list = new RunsList(fakeSource([summary], { [summary.id]: log }).source);
  const root = render(
    <RunView
      list={list}
      runId={summary.id}
      now={() => mondayMorning}
      openRun={openRun}
      {...(announce === undefined ? {} : { announce })}
      {...(runStart === undefined ? {} : { runStart })}
      {...(engine === undefined ? {} : { engine })}
    />,
  );
  await settled();
  return root;
}

const button = (root: HTMLElement, name: string) =>
  [...root.querySelectorAll("button")].find((one) => one.textContent === name);

const failed = summaryWith({
  id: "run_a_7k2m9p",
  status: "failed",
  reason: "model-unreachable",
  endedAt: mondayMorning.toISOString(),
});

verifies("runs.run-view.run-again", () => {
  it("starts the same workflow with the logged input and opens the new run", async () => {
    const startRun = vi.fn(async () => ({ runId: "run_b_new" }));
    const openRun = vi.fn();
    const root = await open(failed, { startRun }, openRun);
    await act(async () => button(root, "Run again")?.click());
    expect(startRun).toHaveBeenCalledWith(
      { hubId: "acme", workflowId: "support-reply" },
      { message: "Hi" },
    );
    expect(openRun).toHaveBeenCalledWith("run_b_new");
  });

  it("is also the button of a failed banner", async () => {
    const root = await open(failed, { startRun: vi.fn() });
    const names = [...root.querySelectorAll("button")].map((one) => one.textContent);
    expect(names.filter((name) => name === "Run again")).toHaveLength(2);
  });

  it("says why the run didn't start, and stays on the run", async () => {
    const openRun = vi.fn();
    const startRun = vi.fn(async () => {
      throw Object.assign(new Error("The workflow changed."), { kind: "invalid_input" });
    });
    const announce = vi.fn();
    const root = await open(failed, { startRun }, openRun, announce);
    await act(async () => button(root, "Run again")?.click());
    expect(root.textContent).toContain("Couldn't start the run: The workflow changed.");
    expect(announce).toHaveBeenCalledExactlyOnceWith(
      "Couldn't start the run: The workflow changed.",
    );
    expect(openRun).not.toHaveBeenCalled();
  });

  it("says the engine isn't answering in the host's words only when the host says so", async () => {
    const startRun = vi.fn(async () => {
      throw new EngineNotAnswering();
    });
    const announce = vi.fn();
    const root = await open(failed, { startRun }, vi.fn(), announce, engineWords.phone);
    await act(async () => button(root, "Run again")?.click());
    expect(root.textContent).toContain(
      "Couldn't start the run: Halonic on your computer isn't answering.",
    );
    expect(announce).toHaveBeenCalledExactlyOnceWith(
      "Couldn't start the run: Halonic on your computer isn't answering.",
    );
    expect(button(root, "Copy details")).toBeUndefined();
  });

  it("gives an unexplained failure the can't-explain line with Copy details", async () => {
    const startRun = vi.fn(async () => {
      throw new Error("no answer");
    });
    const root = await open(failed, { startRun }, vi.fn(), undefined, engineWords.phone);
    await act(async () => button(root, "Run again")?.click());
    expect(root.textContent).toContain(
      "Couldn't start the run: Halonic ran into a problem it can't explain yet.",
    );
    expect(root.textContent).not.toContain("isn't answering");
    expect(button(root, "Copy details")).toBeDefined();
  });

  it("says each failed start once", async () => {
    const startRun = vi.fn(async () => {
      throw new Error("no answer");
    });
    const announce = vi.fn();
    const root = await open(failed, { startRun }, vi.fn(), (line) => announce(line));
    await act(async () => button(root, "Run again")?.click());
    expect(announce).toHaveBeenCalledTimes(1);
    await act(async () => button(root, "Run again")?.click());
    expect(announce).toHaveBeenCalledTimes(2);
  });

  it("starts one run however often the buttons are clicked while it starts", async () => {
    let started: (value: { runId: string }) => void = () => {};
    const startRun = vi.fn(() => new Promise<{ runId: string }>((resolve) => (started = resolve)));
    const root = await open(failed, { startRun });
    const header = button(root, "Run again");
    const banner = [...root.querySelectorAll("button")].filter(
      (one) => one.textContent === "Run again",
    )[1];
    await act(async () => {
      header?.click();
      header?.click();
      banner?.click();
    });
    expect(startRun).toHaveBeenCalledTimes(1);
    await act(async () => started({ runId: "run_b_new" }));
    await act(async () => button(root, "Run again")?.click());
    expect(startRun).toHaveBeenCalledTimes(2);
  });

  it("is not there for a running run, a test run or a page without a host", async () => {
    const running = summaryWith({ id: "run_c", status: "running" });
    const test = summaryWith({ id: "run_d", status: "failed", kind: "test" });
    expect(button(await open(running, { startRun: vi.fn() }), "Run again")).toBeUndefined();
    expect(button(await open(test, { startRun: vi.fn() }), "Run again")).toBeUndefined();
    expect(button(await open(failed, undefined), "Run again")).toBeUndefined();
  });
});
