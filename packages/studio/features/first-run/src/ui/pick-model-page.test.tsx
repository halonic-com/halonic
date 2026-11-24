// @vitest-environment jsdom
import type { RunStartHost } from "@halonicjs/studio-feature-runs/api";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { FirstRun } from "../first-run.ts";
import { FirstRunStart } from "../first-run-start.ts";
import { pickModelPageOf } from "./pick-model-page.tsx";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mounted: { root: Root; container: HTMLElement }[] = [];

afterEach(() => {
  for (const { root, container } of mounted.splice(0)) {
    act(() => root.unmount());
    container.remove();
  }
});

function firstRunPicking() {
  let text: string | undefined;
  const runs = {
    state: { runs: [], loaded: true, error: undefined, workflows: undefined },
    subscribe: () => () => {},
    source: { log: async () => [] },
  };
  const device = {
    folder: "/docs/Acme sample",
    read: () => text,
    write: (next: string) => (text = next),
  };
  const firstRun = new FirstRun(runs, { isSample: () => true }, device, () => new Date(0));
  firstRun.notice();
  firstRun.pickModel();
  return firstRun;
}

/** The page with no model service, as in the browser demo: only Sample answers can be ticked. */
async function open(runStart: RunStartHost) {
  const firstRun = firstRunPicking();
  const PickModelPage = pickModelPageOf({
    firstRun,
    start: new FirstRunStart(firstRun, runStart),
    service: undefined,
  });
  const showRun = vi.fn();
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  mounted.push({ root, container });
  await act(async () =>
    root.render(
      <PickModelPage
        workflow={{ hubId: "support", id: "support-reply" }}
        phone={false}
        showRun={showRun}
      />,
    ),
  );
  return { container, firstRun, showRun };
}

const press = (root: HTMLElement, name: string) =>
  act(async () =>
    // A busy-able button keeps a hidden copy of its words for its width, so the text repeats.
    [...root.querySelectorAll("button")]
      .find((button) => button.textContent?.startsWith(name))
      ?.click(),
  );

verifies("first-run.run", () => {
  it("starts the run on Continue and shows it on the page", async () => {
    const startRun = vi.fn(async () => ({ runId: "run_mfx3k2a1_01jd8q" }));
    const { container, firstRun, showRun } = await open({ startRun });
    await press(container, "Continue");
    expect(startRun).toHaveBeenCalledOnce();
    expect(showRun).toHaveBeenCalledWith("run_mfx3k2a1_01jd8q");
    expect(firstRun.isPicking).toBe(false);
  });

  it("stays with why when the run doesn't start, and Try again starts it", async () => {
    const startRun = vi
      .fn<RunStartHost["startRun"]>()
      .mockRejectedValueOnce(
        Object.assign(new Error("The workflow changed."), { kind: "invalid_input" }),
      )
      .mockResolvedValueOnce({ runId: "run_mfx3k2a1_01jd8q" });
    const { container, firstRun, showRun } = await open({ startRun });
    await press(container, "Continue");
    expect(container.textContent).toContain("the workflow changed.");
    expect(firstRun.isPicking).toBe(true);
    await press(container, "Try again");
    expect(showRun).toHaveBeenCalledWith("run_mfx3k2a1_01jd8q");
  });

  it("closes with Back, back to the step the runs say", async () => {
    const { container, firstRun } = await open({ startRun: vi.fn() });
    await press(container, "Back");
    expect(firstRun.isPicking).toBe(false);
    expect(firstRun.state).toMatchObject({ kind: "on", step: "demo" });
  });
});

verifies("first-run.pick-model-focus", () => {
  it("opens with the focus on its heading, not the body, since the button that opened it is gone", async () => {
    const { container } = await open({ startRun: vi.fn() });
    const heading = container.querySelector("h1");
    expect(heading?.textContent).toBe("Pick a model");
    expect(document.activeElement).toBe(heading);
    expect(heading?.className).toContain("focus-ring");
  });
});
