// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it } from "vitest";
import { StartRefused, type WorkflowView } from "../api.ts";
import { WorkflowScreen } from "../page/workflow-page.tsx";
import { buttonNamed, memoryHost, memoryRuns, show, unmount } from "../test-support.tsx";

afterEach(unmount);

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

/** The page with a `startRun` that refuses, as the engine does when a run can't start. */
function refusing(refused: StartRefused) {
  const { host } = memoryHost([], [], [reply], [], {
    startRun: async () => {
      throw refused;
    },
  });
  return show(<WorkflowScreen host={host} runs={memoryRuns().source} hubId="acme" id="reply" />);
}

// When a run can't start: the card after Run is pressed says why and the next step, and, when the
// files already say so, Run is unavailable (rule N5, HAL-12363).
verifies("workflows.start.start-run", () => {
  it("shows Run unavailable, with why and the command in the band under the header, when the files already say it can't start", async () => {
    const { host } = memoryHost([], [], [reply], [], {
      startRun: async () => ({ runId: "x" }),
      startRefusal: async () => ({
        reason: "Reporter uses a connector, which Studio can't start yet.",
        fix: "To start it, run this in a terminal:",
        command: "halonic run reply",
      }),
    });
    const page = await show(
      <WorkflowScreen host={host} runs={memoryRuns().source} hubId="acme" id="reply" />,
    );

    const run = runButton(page);
    expect(run?.getAttribute("aria-disabled")).toBe("true");
    const firstLine = page.querySelector(`[id="${run?.getAttribute("aria-describedby")}"]`);
    expect(firstLine?.textContent).toBe(
      "Support reply can't run: Reporter uses a connector, which Studio can't start yet.",
    );
    const band = page.querySelector("[data-testid='start-refusal']");
    expect(band?.textContent).toContain("To start it, run this in a terminal:");
    expect(band?.querySelector("code")?.textContent).toBe("halonic run reply");
    await click(run);
    expect(buttonNamed(page, "Start run")).toBeUndefined();
  });

  it("shows Run unavailable with a step in Studio and no command, when the refusal has none", async () => {
    const { host } = memoryHost([], [], [reply], [], {
      startRun: async () => ({ runId: "x" }),
      startRefusal: async () => ({
        reason: "Reporter runs in Claude Code, which Halonic can't start yet.",
        fix: "Set Reporter to Halonic on its Harness page to run it now.",
      }),
    });
    const page = await show(
      <WorkflowScreen host={host} runs={memoryRuns().source} hubId="acme" id="reply" />,
    );

    const run = runButton(page);
    expect(run?.getAttribute("aria-disabled")).toBe("true");
    const firstLine = page.querySelector(`[id="${run?.getAttribute("aria-describedby")}"]`);
    expect(firstLine?.textContent).toBe(
      "Support reply can't run: Reporter runs in Claude Code, which Halonic can't start yet.",
    );
    const band = page.querySelector("[data-testid='start-refusal']");
    expect(band?.textContent).toContain(
      "Set Reporter to Halonic on its Harness page to run it now.",
    );
    expect(band?.querySelector("code")).toBeNull();
  });

  it("shows the command that starts it in a terminal, with no Try again, when only a terminal can", async () => {
    const page = await refusing(
      new StartRefused({
        reason: "Reporter uses a connector, which Studio can't start yet.",
        fix: "To start it, run this in a terminal:",
        command: "halonic run reply",
      }),
    );

    await click(runButton(page));
    await click(buttonNamed(page, "Start run"));

    expect(page.textContent).toContain(
      "Couldn't start the run: Reporter uses a connector, which Studio can't start yet.",
    );
    expect(page.textContent).toContain("To start it, run this in a terminal:");
    expect(page.textContent).not.toContain("terminal:.");
    expect(page.querySelector("aside code")?.textContent).toBe("halonic run reply");
    expect(page.textContent).not.toContain("Try again");
  });

  it("shows a step in Studio with no command and no Try again, when the refusal names one", async () => {
    const page = await refusing(
      new StartRefused({
        reason: "Reporter runs in Claude Code, which Halonic can't start yet.",
        fix: "Set Reporter to Halonic on its Harness page to run it now.",
      }),
    );

    await click(runButton(page));
    await click(buttonNamed(page, "Start run"));

    expect(page.textContent).toContain(
      "Couldn't start the run: Reporter runs in Claude Code, which Halonic can't start yet.",
    );
    expect(page.textContent).toContain(
      "Set Reporter to Halonic on its Harness page to run it now.",
    );
    expect(page.querySelector("aside code")).toBeNull();
    expect(page.textContent).not.toContain("Try again");
  });
});
