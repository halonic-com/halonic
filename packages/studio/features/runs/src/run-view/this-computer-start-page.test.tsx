// @vitest-environment jsdom
import { type ExternalAddress, OpenExternalProvider } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it } from "vitest";
import { RunsList } from "../runs-list.ts";
import { fakeSource } from "../source.test-helper.ts";
import { mondayMorning, summaryWith } from "../summary.test-helper.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { entered, logOf } from "./run-log.test-helper.ts";
import { RunView } from "./run-page.tsx";

afterEach(unmountAll);

const reason = "a program started without a fence can't reach a bridge on a Unix socket";

const run = summaryWith({
  id: "run_a_7k2m9p",
  status: "failed",
  reason: "this-computer-start-failed",
  state: "draft",
  error: reason,
});

/** The run's page, with the step Draft's start and the launcher's refusal in its log. */
async function open() {
  const opened: ExternalAddress[] = [];
  const log = logOf(run.id, [
    [0, entered("draft")],
    [0, { type: "sandbox.started", state: "draft", agent: "writer", timeoutMs: 30_000 }],
    [
      1,
      { type: "run.failed", state: "draft", error: reason, reason: "this-computer-start-failed" },
    ],
  ]);
  const list = new RunsList(fakeSource([run], { [run.id]: log }).source);
  const root = render(
    <OpenExternalProvider
      openExternal={async (address) => {
        opened.push(address);
      }}
    >
      <RunView
        list={list}
        runId={run.id}
        now={() => mondayMorning}
        openRun={() => undefined}
        runStart={{ startRun: async () => ({ runId: "run_next" }) }}
      />
    </OpenExternalProvider>,
  );
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return { root, opened };
}

const bannerButtons = (container: Element) => [
  ...(container.querySelector('section[aria-label="Run failed"]')?.querySelectorAll("button") ??
    []),
];

verifies("runs.run-view.this-computer-start", () => {
  it("shows Report a problem after Copy details, and opens a new issue through the host", async () => {
    const { root, opened } = await open();
    const buttons = bannerButtons(root);

    expect(buttons.map((button) => button.textContent)).toEqual([
      "Copy details",
      "Report a problem ↗. Opens GitHub",
    ]);
    await act(async () => buttons[1]?.click());
    expect(opened).toEqual(["https://github.com/halonic-com/halonic/issues/new"]);
  });
});
