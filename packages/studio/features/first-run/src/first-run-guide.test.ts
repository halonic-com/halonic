import { verifies } from "@halonicjs/testing-spec";
import { expect, it, vi } from "vitest";
import { FirstRun } from "./first-run.ts";
import { firstRunGuide } from "./first-run-guide.ts";
import { FirstRunStart } from "./first-run-start.ts";
import type { FirstRunState } from "./first-run-state.ts";

const folder = "/docs/Acme sample";
const supportReply = { hubId: "support", id: "support-reply" };

function firstRunOf(saved: FirstRunState | undefined, sample = true) {
  let text = saved === undefined ? undefined : JSON.stringify(saved);
  const runs = {
    state: { runs: [], loaded: true, error: undefined, workflows: undefined },
    subscribe: () => () => {},
    source: { log: async () => [] },
  };
  const device = { folder, read: () => text, write: (next: string) => (text = next) };
  const firstRun = new FirstRun(runs, { isSample: () => sample }, device, () => new Date(0));
  firstRun.notice();
  return firstRun;
}

/** The guide of `firstRun` on a page that can't start a run, as before the run's build. */
function guideOf(firstRun: FirstRun) {
  const start = new FirstRunStart(firstRun, undefined);
  return firstRunGuide(firstRun, start, { view: "PickModelPage", load: async () => ({}) });
}

verifies("first-run.guide-card", () => {
  it("shows the card on Support reply in the demo while the first run is on", () => {
    const card = guideOf(firstRunOf(undefined)).card(supportReply);
    expect(card?.title).toBe("Your first run");
    expect(card?.lines).toEqual([
      {
        text: "This is Acme, an example company. Its support workflow reads a customer email, drafts a reply, and then waits for you to approve it.",
      },
      { label: "The email", text: "Sam writes that an order arrived damaged." },
    ]);
    expect(card?.action.label).toBe("Run your first workflow");
    expect(card?.action.again).toBe(false);
  });

  it("opens the page's Run form from its button where the page can't start a run itself", () => {
    const openRunForm = vi.fn();
    guideOf(firstRunOf(undefined)).card(supportReply)?.action.run({ openRunForm });
    expect(openRunForm).toHaveBeenCalledOnce();
  });

  it("reads Run again after a run that ended without a win", () => {
    const ended: FirstRunState = { kind: "on", folder, since: "", step: "run", ended: true };
    expect(guideOf(firstRunOf(ended)).card(supportReply)?.action).toMatchObject({
      label: "Run again",
      again: true,
    });
  });

  it("shows none on another workflow, outside the demo, or once the first run is paused or won", () => {
    expect(guideOf(firstRunOf(undefined)).card({ hubId: "support", id: "triage" })).toBeUndefined();
    expect(guideOf(firstRunOf(undefined, false)).card(supportReply)).toBeUndefined();
    const paused: FirstRunState = { kind: "paused", folder, since: "", step: "demo" };
    expect(guideOf(firstRunOf(paused)).card(supportReply)).toBeUndefined();
    expect(guideOf(firstRunOf({ kind: "done", folder })).card(supportReply)).toBeUndefined();
  });

  it("tells the page when its card may have changed", () => {
    const firstRun = firstRunOf(undefined);
    const changed = vi.fn();
    guideOf(firstRun).subscribe(changed);
    firstRun.send({ kind: "left" });
    expect(changed).toHaveBeenCalledOnce();
  });
});
