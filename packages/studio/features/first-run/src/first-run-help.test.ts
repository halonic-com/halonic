import type { ItemRef } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it, vi } from "vitest";
import type { FirstRunDevice } from "./api.ts";
import { FirstRun } from "./first-run.ts";
import { firstRunHelpItems } from "./first-run-help.ts";
import type { FirstRunState } from "./first-run-state.ts";

const folder = "/docs/Acme sample";
const opened = new Date("2026-11-21T10:00:00.000Z");

function firstRunOf(
  saved: FirstRunState | undefined,
  { sample = true, startOver }: { sample?: boolean; startOver?: () => void } = {},
) {
  let text = saved === undefined ? undefined : JSON.stringify(saved);
  const runs = {
    state: { runs: [], loaded: true, error: undefined, workflows: undefined },
    subscribe: () => () => {},
    source: { log: async () => [] },
  };
  const device: FirstRunDevice = {
    folder,
    read: () => text,
    write: (next) => {
      text = next;
    },
    ...(startOver === undefined ? {} : { startOver }),
  };
  return new FirstRun(runs, { isSample: () => sample }, device, () => opened);
}

const labels = (firstRun: FirstRun) =>
  firstRunHelpItems(firstRun, undefined).map((item) => item.label);
const pick = (firstRun: FirstRun, label: string, openItem?: (item: ItemRef) => void) =>
  firstRunHelpItems(firstRun, openItem)
    .find((item) => item.label === label)
    ?.run();

verifies("first-run.help", () => {
  it("offers Show the guide in the demo and Start over where the app can copy it", () => {
    expect(labels(firstRunOf(undefined, { startOver: () => {} }))).toEqual([
      "Show the guide",
      "Start over",
    ]);
    expect(labels(firstRunOf(undefined))).toEqual(["Show the guide"]);
    expect(labels(firstRunOf(undefined, { sample: false }))).toEqual([]);
  });

  it("begins the first run again at Demo after the win, and opens Support reply", () => {
    const firstRun = firstRunOf({ kind: "done", folder });
    const opened: ItemRef[] = [];
    pick(firstRun, "Show the guide", (item) => opened.push(item));
    expect(firstRun.state).toEqual({
      kind: "on",
      folder,
      since: "2026-11-21T10:00:00.000Z",
      step: "demo",
    });
    expect(opened).toEqual([{ kind: "workflow", hub: "support", id: "support-reply" }]);
  });

  it("takes a first run paused here up again at its step, and leaves one that is on as it is", () => {
    const paused = firstRunOf({ kind: "paused", folder, since: "", step: "model" });
    pick(paused, "Show the guide");
    expect(paused.state).toEqual({ kind: "on", folder, since: "", step: "model" });
    const running: FirstRunState = { kind: "on", folder, since: "", step: "run", failed: true };
    const on = firstRunOf(running);
    pick(on, "Show the guide");
    expect(on.state).toEqual(running);
  });

  it("turns the first run off and asks for a fresh copy on Start over", () => {
    const startOver = vi.fn();
    const firstRun = firstRunOf({ kind: "on", folder, since: "", step: "run" }, { startOver });
    pick(firstRun, "Start over");
    expect(firstRun.state).toEqual({ kind: "off" });
    expect(startOver).toHaveBeenCalledOnce();
  });
});
