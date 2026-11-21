// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type {
  WorkflowGuide,
  WorkflowGuideScreen,
  WorkflowGuideScreenProps,
  WorkflowRef,
} from "../api.ts";
import { memoryHost, memoryRuns, runSummary, show, unmount } from "../test-support.tsx";
import { reply, settings } from "./page-fixtures.ts";
import { WorkflowScreen } from "./workflow-page.tsx";

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
afterEach(() => {
  unmount();
  vi.useRealTimers();
});

/** A stand-in for the first run's Pick a model, which says what the page gave it. */
function PickModelStandIn({ workflow, phone, showRun }: WorkflowGuideScreenProps) {
  return (
    <section data-stand-in="">
      Pick a model for {workflow.id}
      {phone ? " on a phone" : ""}
      <button type="button" onClick={() => showRun("run_mfx3k2a1_01jd8q")}>
        Continue
      </button>
    </section>
  );
}

const pickModel: WorkflowGuideScreen = {
  title: "Pick a model",
  view: "PickModelStandIn",
  load: async () => ({ PickModelStandIn }),
};

/** A guide that gives `screen` for Support reply only, and can change it. */
function guideFor(screen: WorkflowGuideScreen | undefined) {
  let now = screen;
  const listeners = new Set<() => void>();
  const guide: WorkflowGuide = {
    card: () => undefined,
    screen: (workflow: WorkflowRef) => (workflow.id === "reply" ? now : undefined),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return {
    guide,
    change: (next: WorkflowGuideScreen | undefined) =>
      act(async () => {
        now = next;
        for (const listener of listeners) listener();
      }),
  };
}

function page(
  guide: WorkflowGuide,
  parts: { announce?: (line: string) => void } = {},
  runs = memoryRuns(),
) {
  const { host } = memoryHost([], [], [reply], [settings]);
  return (
    <WorkflowScreen
      host={host}
      runs={runs.source}
      hubId="acme"
      id="reply"
      guide={guide}
      {...parts}
    />
  );
}

/** Lets the screen's view load. */
const loaded = () => act(async () => {});

verifies("workflows.page.guide-screen", () => {
  it("shows the guide's screen in place of the page, and reads its title aloud", async () => {
    const announce = vi.fn();
    const shown = await show(page(guideFor(pickModel).guide, { announce }));
    await loaded();
    expect(shown.querySelector("[data-stand-in]")?.textContent).toContain("Pick a model for reply");
    expect(shown.querySelector("[role=tablist]")).toBeNull();
    expect(announce).toHaveBeenCalledWith("Pick a model");
  });

  it("docks the run the screen started on the page, once the screen is gone", async () => {
    const runs = memoryRuns();
    const { guide, change } = guideFor(pickModel);
    const shown = await show(page(guide, {}, runs));
    await loaded();
    await act(async () =>
      shown.querySelector<HTMLButtonElement>("[data-stand-in] button")?.click(),
    );
    await change(undefined);
    await act(async () => runs.change([runSummary({ status: "running", state: "start" })]));
    expect(shown.querySelector("aside[aria-label='Run 01jd8q']")).not.toBeNull();
  });

  it("reads the title aloud once, however often the page draws", async () => {
    const announce = vi.fn();
    const { guide, change } = guideFor(pickModel);
    await show(page(guide, { announce }));
    await loaded();
    await change(pickModel);
    expect(announce).toHaveBeenCalledTimes(1);
  });

  it("comes back as the page once the guide gives no screen", async () => {
    const { guide, change } = guideFor(pickModel);
    const shown = await show(page(guide));
    await loaded();
    await change(undefined);
    expect(shown.querySelector("[data-stand-in]")).toBeNull();
    expect(shown.querySelector("[role=tablist]")).not.toBeNull();
  });

  it("leaves the page as it is when the screen's view can't load", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const broken = { ...pickModel, load: async () => Promise.reject(new Error("gone")) };
    const shown = await show(page(guideFor(broken).guide));
    await loaded();
    expect(shown.querySelector("[role=tablist]")).not.toBeNull();
  });

  it("leaves the page as it is when the guide fails to give a screen", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const guide: WorkflowGuide = {
      card: () => undefined,
      screen: () => {
        throw new Error("The first run's state can't be read.");
      },
      subscribe: () => () => {},
    };
    const shown = await show(page(guide));
    expect(shown.querySelector("[role=tablist]")).not.toBeNull();
  });
});
