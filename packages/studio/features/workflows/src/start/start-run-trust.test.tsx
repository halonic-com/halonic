// @vitest-environment jsdom

import { KindedError } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { WorkflowView } from "../api.ts";
import { WorkflowScreen } from "../page/workflow-page.tsx";
import { buttonNamed, memoryHost, memoryRuns, show, unmount } from "../test-support.tsx";

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
afterEach(() => {
  unmount();
  vi.useRealTimers();
});

const reply: WorkflowView = {
  hubId: "acme",
  id: "reply",
  name: "Support reply",
  initial: "read",
  steps: [
    { id: "read", type: "task" },
    { id: "draft", type: "task", agent: "writer" },
    { id: "done", type: "final" },
  ],
  arrows: [
    { from: "read", to: "draft" },
    { from: "draft", to: "done" },
  ],
  layout: {},
};

/** The header's Run, not the Runs tab, whose name starts the same. */
const runButton = (page: HTMLElement) =>
  [...page.querySelectorAll("button")].find((button) => button.textContent?.trim() === "Run");

const click = (button: HTMLButtonElement | undefined) =>
  act(async () => {
    button?.click();
  });

async function open(
  startRun: (input: Record<string, unknown>) => Promise<{ runId: string }>,
  askTrust?: () => Promise<"trusted" | "declined">,
) {
  const { host } = memoryHost([], [], [reply], [], {
    startRun: async (_ref, input) => startRun(input),
    ...(askTrust && { askTrust }),
  });
  return show(<WorkflowScreen host={host} runs={memoryRuns().source} hubId="acme" id="reply" />);
}

verifies("workflows.start.start-run", () => {
  it("offers Review in place of Try again when the workspace isn't trusted yet", async () => {
    const untrusted = new KindedError(
      "denied",
      "This workspace isn't trusted yet, so nothing was started.",
    );
    const attempts = vi
      .fn<(input: Record<string, unknown>) => Promise<{ runId: string }>>()
      .mockRejectedValue(untrusted);
    const askTrust = vi.fn(async () => "declined" as const);
    const page = await open(attempts, askTrust);

    await click(runButton(page));
    await click(buttonNamed(page, "Start run"));

    expect(page.textContent).toContain(
      "Couldn't start the run: this workspace isn't trusted yet, so nothing was started.",
    );
    expect(page.textContent).not.toContain("Try again");
    await click(buttonNamed(page, "Review"));
    expect(askTrust).toHaveBeenCalledOnce();
    // Not now leaves the sentence and its Review.
    expect(buttonNamed(page, "Review")).toBeDefined();
    expect(attempts).toHaveBeenCalledOnce();
  });

  it("brings Start run back, focused, once the person trusts the workspace from Review", async () => {
    const page = await open(
      async () => {
        throw new KindedError(
          "denied",
          "This workspace isn't trusted yet, so nothing was started.",
        );
      },
      async () => "trusted",
    );

    await click(runButton(page));
    await click(buttonNamed(page, "Start run"));
    await click(buttonNamed(page, "Review"));

    expect(page.textContent).not.toContain("Couldn't start the run");
    expect(document.activeElement).toBe(buttonNamed(page, "Start run"));
  });

  it("keeps Try again for a refusal when the host can't ask for trust", async () => {
    const page = await open(async () => {
      throw new KindedError("denied", "This workspace isn't trusted yet, so nothing was started.");
    });

    await click(runButton(page));
    await click(buttonNamed(page, "Start run"));

    expect(buttonNamed(page, "Try again")).toBeDefined();
    expect(buttonNamed(page, "Review")).toBeUndefined();
  });
});
