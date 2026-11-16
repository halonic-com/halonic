// @vitest-environment jsdom
import type { LoggedInstructionPin, RunEvent } from "@halonicjs/events";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import type { InstructionTrustAnswer } from "../api.ts";
import { RunsList } from "../runs-list.ts";
import { fakeSource } from "../source.test-helper.ts";
import { mondayMorning, summaryWith } from "../summary.test-helper.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { RunView } from "./run-page.tsx";

afterEach(unmountAll);

const pin: LoggedInstructionPin = { digest: "d1", files: { "AGENTS.md": "f1" } };
const failedRun = summaryWith({
  id: "run_a_7k2m9p",
  status: "failed",
  reason: "instructions-not-trusted",
  error: "not trusted",
  endedAt: mondayMorning.toISOString(),
});

function event(rest: Record<string, unknown>, seq: number): RunEvent {
  return { runId: failedRun.id, seq, at: "2026-11-16T08:00:00Z", ...rest } as RunEvent;
}

const refusedLog = (changed?: boolean): RunEvent[] => [
  event(
    {
      type: "run.failed",
      state: "draft",
      error: "not trusted",
      reason: "instructions-not-trusted",
      agent: "reporter",
      pin,
      ...(changed === undefined ? {} : { changed }),
    },
    1,
  ),
];

async function open(
  log: RunEvent[],
  trust?: (agent: string, pin: LoggedInstructionPin) => Promise<InstructionTrustAnswer>,
) {
  const list = new RunsList(fakeSource([failedRun], { [failedRun.id]: log }).source);
  const root = render(
    <RunView
      list={list}
      runId={failedRun.id}
      now={() => mondayMorning}
      {...(trust === undefined ? {} : { instructionTrust: { trust } })}
    />,
  );
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return root;
}

const banner = (root: HTMLElement) =>
  root.querySelector('section[aria-label="Instructions not trusted"]');
const reviewButton = (root: HTMLElement) =>
  [...root.querySelectorAll("button")].find((b) => b.textContent === "Review instructions");

verifies("runs.run-view.instructions-refusal", () => {
  it("says it is the first time, and asks the host for exactly the agent and pin the log carries", async () => {
    const trust = vi.fn(async () => "declined" as const);
    const root = await open(refusedLog(false), trust);

    expect(banner(root)?.textContent).toBe(
      "Reporter didn't start. You haven't trusted its instructions yet.Review instructions",
    );
    await act(async () => reviewButton(root)?.click());
    expect(trust).toHaveBeenCalledWith("reporter", pin);
  });

  it("says the instructions changed, and keeps the button after a decline", async () => {
    const root = await open(refusedLog(true), async () => "declined");
    await act(async () => reviewButton(root)?.click());

    expect(banner(root)?.textContent).toBe(
      "Reporter didn't start. Its instructions changed since you trusted them.Nothing was trusted, so the run didn't start.Review instructions",
    );
    expect(reviewButton(root)).toBeDefined();
  });

  it("drops the button once trusted", async () => {
    const root = await open(refusedLog(), async () => "trusted");
    await act(async () => reviewButton(root)?.click());

    expect(banner(root)?.textContent).toContain("Trusted. Run again to start it.");
    expect(reviewButton(root)).toBeUndefined();
  });

  it.each([
    ["busy", "A question about instructions is already open. Answer it first."],
    ["unavailable", "Nothing was trusted. Try again."],
  ] as const)("words a %s answer itself", async (answer, line) => {
    const root = await open(refusedLog(), async () => answer);
    await act(async () => reviewButton(root)?.click());

    expect(banner(root)?.textContent).toContain(line);
  });

  it("offers no button where nothing can ask", async () => {
    const root = await open(refusedLog(true));

    expect(banner(root)?.textContent).toBe(
      "Reporter didn't start. Its instructions changed since you trusted them.Trust these instructions on your computer first.",
    );
    expect(reviewButton(root)).toBeUndefined();
  });

  it("reads the agent and pin of a refused parallel branch from its agent.finished", async () => {
    const trust = vi.fn(async () => "declined" as const);
    const root = await open(
      [
        event(
          {
            type: "agent.finished",
            state: "fan",
            agent: "translator",
            output: null,
            parent: "fan",
            error: "not trusted",
            reason: "instructions-not-trusted",
            pin,
            changed: true,
          },
          1,
        ),
        event(
          {
            type: "run.failed",
            state: "fan",
            error: "not trusted",
            reason: "instructions-not-trusted",
          },
          2,
        ),
      ],
      trust,
    );
    await act(async () => reviewButton(root)?.click());

    expect(trust).toHaveBeenCalledWith("translator", pin);
  });

  it("shows the usual banner for a log without the pin", async () => {
    const root = await open([
      event(
        { type: "run.failed", state: "draft", error: "x", reason: "instructions-not-trusted" },
        1,
      ),
    ]);

    expect(banner(root)).toBeNull();
    expect(root.querySelector('section[aria-label="Run failed"]')?.textContent).toContain("failed");
  });
});
