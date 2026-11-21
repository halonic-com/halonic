import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import {
  type FirstRunEvent,
  type FirstRunState,
  nextFirstRun,
  parseFirstRun,
  serializeFirstRun,
} from "./first-run-state.ts";

const at = "2026-11-21T09:00:00.000Z";
const off: FirstRunState = { kind: "off" };
const demo: FirstRunState = { kind: "on", folder: "/docs/Acme sample", since: at, step: "demo" };

/** The state after each event in turn. */
function after(state: FirstRunState, ...events: FirstRunEvent[]): FirstRunState {
  return events.reduce(nextFirstRun, state);
}

verifies("first-run.state", () => {
  it("turns on at the demo when Open demo opens the first copy", () => {
    expect(after(off, { kind: "demo-opened", folder: "/docs/Acme sample", at })).toEqual(demo);
  });

  it("doesn't start again for a later copy or after the first win", () => {
    const later = { kind: "demo-opened", folder: "/docs/Acme sample 2", at } as const;
    expect(after(demo, later)).toEqual(demo);
    const done: FirstRunState = { kind: "done", folder: "/docs/Acme sample" };
    expect(after(done, later)).toEqual(done);
  });

  it("moves through the steps by the run, and Approve is current while it waits", () => {
    expect(after(demo, { kind: "model-picking" })).toMatchObject({ step: "model" });
    expect(after(demo, { kind: "run-started" })).toMatchObject({ step: "run" });
    expect(after(demo, { kind: "run-started" }, { kind: "run-waiting" })).toMatchObject({
      step: "approve",
    });
  });

  it("marks a failed run and a run that ended without a win at the Run step, until the next run", () => {
    const failed = after(demo, { kind: "run-started" }, { kind: "run-failed" });
    expect(failed).toEqual({ ...demo, step: "run", failed: true });
    const ended = after(demo, { kind: "run-waiting" }, { kind: "run-ended" });
    expect(ended).toEqual({ ...demo, step: "run", ended: true });
    expect(after(ended, { kind: "run-started" })).toEqual({ ...demo, step: "run" });
  });

  it("goes off at the first win, also while paused", () => {
    expect(after(demo, { kind: "run-waiting" }, { kind: "first-win" })).toEqual({
      kind: "done",
      folder: "/docs/Acme sample",
    });
    expect(after(demo, { kind: "left" }, { kind: "first-win" })).toMatchObject({ kind: "done" });
  });

  it("is paused by Skip or Set up later at its step, and Continue takes it up there", () => {
    const paused = after(demo, { kind: "model-picking" }, { kind: "left" });
    expect(paused).toEqual({ kind: "paused", folder: demo.folder, since: at, step: "model" });
    // A paused first run doesn't move with the runs; Continue reads them again.
    expect(after(paused, { kind: "run-started" })).toEqual(paused);
    expect(after(paused, { kind: "resumed" })).toEqual({ ...demo, step: "model" });
  });

  it("leaves a paused first run for good when its setup item is dismissed", () => {
    const dismissed = after(demo, { kind: "left" }, { kind: "dismissed" });
    expect(dismissed).toEqual({ kind: "dismissed", folder: demo.folder });
    expect(after(dismissed, { kind: "resumed" }, { kind: "first-win" })).toEqual(dismissed);
    expect(after(demo, { kind: "dismissed" })).toEqual(demo);
    expect(parseFirstRun(serializeFirstRun(dismissed))).toEqual(dismissed);
  });

  it("begins again at the demo of a new folder on Start over, whatever it was", () => {
    const again = { kind: "started-over", folder: "/docs/Acme sample 2", at: "later" } as const;
    for (const state of [off, demo, { kind: "done", folder: demo.folder } as const]) {
      expect(after(state, again)).toEqual({
        kind: "on",
        folder: "/docs/Acme sample 2",
        since: "later",
        step: "demo",
      });
    }
  });

  it("is kept after a restart, and a save it can't read counts as off", () => {
    const running = after(demo, { kind: "run-started" }, { kind: "run-failed" });
    expect(parseFirstRun(serializeFirstRun(running))).toEqual(running);
    expect(parseFirstRun(undefined)).toEqual(off);
    expect(parseFirstRun("{not json")).toEqual(off);
    expect(
      parseFirstRun(JSON.stringify({ kind: "on", folder: "/x", since: at, step: "lunch" })),
    ).toEqual(off);
    expect(parseFirstRun(JSON.stringify({ kind: "paused", step: "demo" }))).toEqual(off);
  });
});
