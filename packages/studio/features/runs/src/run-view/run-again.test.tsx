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

// The failed run's banner has its own Copy details; Run again's line may add one.
const copyDetailsCount = (root: HTMLElement) =>
  [...root.querySelectorAll("button")].filter((one) => one.textContent === "Copy details").length;

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

  const runAgainButtons = (root: HTMLElement) =>
    [...root.querySelectorAll("button")].filter((one) => one.textContent === "Run again");

  it("is the failed banner's last button, and then not in the header", async () => {
    const busy = summaryWith({
      id: "run_e_busy",
      status: "failed",
      reason: "provider-busy",
      endedAt: mondayMorning.toISOString(),
    });
    for (const summary of [failed, busy]) {
      const root = await open(summary, { startRun: vi.fn() });
      expect(runAgainButtons(root)).toHaveLength(1);
      expect(root.querySelector("header")?.textContent).not.toContain("Run again");
    }
  });

  it("is in the header when the banner has no Run again of its own", async () => {
    const done = summaryWith({
      id: "run_f",
      status: "completed",
      endedAt: mondayMorning.toISOString(),
    });
    const budget = summaryWith({
      id: "run_g",
      status: "failed",
      reason: "budget",
      endedAt: mondayMorning.toISOString(),
    });
    for (const summary of [done, budget]) {
      const root = await open(summary, { startRun: vi.fn() });
      expect(runAgainButtons(root)).toHaveLength(1);
      expect(root.querySelector("header")?.textContent).toContain("Run again");
    }
  });

  it("says why the run didn't start, and stays on the run", async () => {
    const openRun = vi.fn();
    const startRun = vi.fn(async () => {
      throw Object.assign(new Error("The workflow changed."), { kind: "invalid_input" });
    });
    const announce = vi.fn();
    const root = await open(failed, { startRun }, openRun, announce);
    await act(async () => button(root, "Run again")?.click());
    expect(root.textContent).toContain("Couldn't start the run: the workflow changed.");
    expect(announce).toHaveBeenCalledExactlyOnceWith(
      "Couldn't start the run: the workflow changed.",
    );
    expect(openRun).not.toHaveBeenCalled();
  });

  it("lowers the desktop shell's own sentence after the colon too, and keeps a name's capital", async () => {
    const startRun = vi
      .fn()
      .mockRejectedValueOnce(
        Object.assign(new Error("The desktop shell gave no answer to the run call."), {
          kind: "unavailable",
        }),
      )
      .mockRejectedValueOnce(
        Object.assign(new Error("Ollama isn't running."), { kind: "unavailable" }),
      );
    const announce = vi.fn();
    const root = await open(failed, { startRun }, vi.fn(), announce);
    await act(async () => button(root, "Run again")?.click());
    expect(root.textContent).toContain(
      "Couldn't start the run: the desktop shell gave no answer to the run call.",
    );
    await act(async () => button(root, "Try again")?.click());
    expect(root.textContent).toContain("Couldn't start the run: Ollama isn't running.");
    expect(announce.mock.calls).toEqual([
      ["Couldn't start the run: the desktop shell gave no answer to the run call."],
      ["Couldn't start the run: Ollama isn't running."],
    ]);
  });

  it("says the engine isn't answering in the host's words only when the host says so", async () => {
    const startRun = vi.fn(async () => {
      throw new EngineNotAnswering();
    });
    const announce = vi.fn();
    const root = await open(failed, { startRun }, vi.fn(), announce, engineWords.phone);
    const before = copyDetailsCount(root);
    await act(async () => button(root, "Run again")?.click());
    expect(root.textContent).toContain(
      "Couldn't start the run: Halonic on your computer isn't answering.",
    );
    expect(announce).toHaveBeenCalledExactlyOnceWith(
      "Couldn't start the run: Halonic on your computer isn't answering.",
    );
    expect(copyDetailsCount(root)).toBe(before);
  });

  it("lowers the desktop app's engine words after the colon, and tries again", async () => {
    const startRun = vi
      .fn()
      .mockRejectedValueOnce(new EngineNotAnswering())
      .mockResolvedValue({ runId: "run_b_new" });
    const openRun = vi.fn();
    const root = await open(failed, { startRun }, openRun, undefined, engineWords["desktop-app"]);
    await act(async () => button(root, "Run again")?.click());
    expect(root.textContent).toContain(
      "Couldn't start the run: the engine isn't answering. It may still be starting.",
    );
    await act(async () => button(root, "Try again")?.click());
    expect(startRun).toHaveBeenCalledTimes(2);
    expect(openRun).toHaveBeenCalledWith("run_b_new");
  });

  it("gives an unexplained failure the can't-explain line with Copy details", async () => {
    const startRun = vi.fn(async () => {
      throw new Error("no answer");
    });
    const root = await open(failed, { startRun }, vi.fn(), undefined, engineWords.phone);
    const before = copyDetailsCount(root);
    await act(async () => button(root, "Run again")?.click());
    expect(root.textContent).toContain(
      "Couldn't start the run: Halonic ran into a problem it can't explain yet.",
    );
    expect(root.textContent).not.toContain("isn't answering");
    expect(copyDetailsCount(root)).toBe(before + 1);
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

  it("starts one run however often the button is clicked while it starts", async () => {
    let started: (value: { runId: string }) => void = () => {};
    const startRun = vi.fn(() => new Promise<{ runId: string }>((resolve) => (started = resolve)));
    const root = await open(failed, { startRun });
    const again = button(root, "Run again");
    await act(async () => {
      again?.click();
      again?.click();
      again?.click();
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

verifies("runs.run-view.run-again-review", () => {
  const untrusted = () => {
    throw Object.assign(new Error("This workspace isn't trusted yet, so nothing was started."), {
      kind: "denied",
    });
  };

  it("offers Review under a refusal for an untrusted workspace, which opens the trust check", async () => {
    const askTrust = vi.fn(async () => "declined" as const);
    const root = await open(failed, { startRun: vi.fn(async () => untrusted()), askTrust });
    await act(async () => button(root, "Run again")?.click());

    expect(root.textContent).toContain(
      "Couldn't start the run: This workspace isn't trusted yet, so nothing was started.",
    );
    expect(button(root, "Try again")).toBeUndefined();
    await act(async () => button(root, "Review")?.click());
    expect(askTrust).toHaveBeenCalledOnce();
    // Not now leaves the sentence and its Review.
    expect(button(root, "Review")).toBeDefined();
  });

  it("takes the sentence away and gives Run again focus once the person trusts it", async () => {
    const root = await open(failed, {
      startRun: vi.fn(async () => untrusted()),
      askTrust: async () => "trusted",
    });
    await act(async () => button(root, "Run again")?.click());
    await act(async () => button(root, "Review")?.click());

    expect(root.textContent).not.toContain("Couldn't start the run");
    expect(document.activeElement).toBe(root.querySelector("header button"));
    expect(document.activeElement?.textContent).toBe("Run again");
  });

  it("keeps Try again, not Review, for another refusal, or where the host can't ask", async () => {
    const other = await open(failed, {
      startRun: vi.fn(async () => {
        throw Object.assign(new Error("The workflow changed."), { kind: "invalid_input" });
      }),
      askTrust: vi.fn(),
    });
    await act(async () => button(other, "Run again")?.click());
    expect(button(other, "Review")).toBeUndefined();
    expect(button(other, "Try again")).toBeDefined();

    unmountAll();
    const cantAsk = await open(failed, { startRun: vi.fn(async () => untrusted()) });
    await act(async () => button(cantAsk, "Run again")?.click());
    expect(cantAsk.textContent).toContain("isn't trusted yet");
    expect(button(cantAsk, "Review")).toBeUndefined();
    expect(button(cantAsk, "Try again")).toBeDefined();
  });
});
