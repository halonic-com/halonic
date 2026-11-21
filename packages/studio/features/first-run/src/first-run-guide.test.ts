import { verifies } from "@halonicjs/testing-spec";
import { expect, it, vi } from "vitest";
import { FirstRun } from "./first-run.ts";
import { firstRunGuide } from "./first-run-guide.ts";
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

verifies("first-run.guide-card", () => {
  it("shows the card on Support reply in the demo while the first run is on", () => {
    const card = firstRunGuide(firstRunOf(undefined)).card(supportReply);
    expect(card?.title).toBe("Your first run");
    expect(card?.lines).toEqual([
      {
        text: "This is Acme, an example company. Its support workflow reads a customer email, drafts a reply, and then waits for you to approve it.",
      },
      { label: "The email:", text: "Sam writes that an order arrived damaged." },
    ]);
    expect(card?.action.label).toBe("Run your first workflow");
  });

  it("opens the page's Run form from its button", () => {
    const openRunForm = vi.fn();
    firstRunGuide(firstRunOf(undefined)).card(supportReply)?.action.run({ openRunForm });
    expect(openRunForm).toHaveBeenCalledOnce();
  });

  it("reads Run again after a run that ended without a win", () => {
    const ended: FirstRunState = { kind: "on", folder, since: "", step: "run", ended: true };
    expect(firstRunGuide(firstRunOf(ended)).card(supportReply)?.action.label).toBe("Run again");
  });

  it("shows none on another workflow, outside the demo, or once the first run is paused or won", () => {
    expect(
      firstRunGuide(firstRunOf(undefined)).card({ hubId: "support", id: "triage" }),
    ).toBeUndefined();
    expect(firstRunGuide(firstRunOf(undefined, false)).card(supportReply)).toBeUndefined();
    const paused: FirstRunState = { kind: "paused", folder, since: "", step: "demo" };
    expect(firstRunGuide(firstRunOf(paused)).card(supportReply)).toBeUndefined();
    expect(firstRunGuide(firstRunOf({ kind: "done", folder })).card(supportReply)).toBeUndefined();
  });

  it("tells the page when its card may have changed", () => {
    const firstRun = firstRunOf(undefined);
    const changed = vi.fn();
    firstRunGuide(firstRun).subscribe(changed);
    firstRun.send({ kind: "left" });
    expect(changed).toHaveBeenCalledOnce();
  });
});
