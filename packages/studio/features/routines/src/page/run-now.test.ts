// @vitest-environment jsdom

import { KindedError } from "@halonicjs/std";
import { createToastStore } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { EngineNotAnswering, type RoutinesHost } from "../api.ts";
import { runRoutineNow } from "./run-now.ts";

const daily = { hubId: "acme", id: "daily", name: "Daily", targetName: "Support reply" };

/** The engine lock's refusal, as the window's `engine-lock.ts` words it. */
function lockRefusal(): KindedError {
  return new KindedError(
    "conflict",
    "Acme is already running in another Halonic on this computer (process 4120).",
    { fix: "Stop that one, then try again." },
  );
}

/** A workflow's refusal with the command for a terminal, as `StartRefused` carries it (L4). */
function harnessRefusal(): KindedError {
  const refusal = new KindedError(
    "unavailable",
    "Reporter runs in Claude Code, which Halonic can't start yet.",
    { fix: "To run it in Halonic's own loop instead, run this in a terminal:" },
  );
  return Object.assign(refusal, { command: "halonic run support-reply --harness halonic" });
}

/** A host whose Run now rejects with each error in turn, then starts run `run_1abc23`. */
function hostFailing(...errors: Error[]) {
  const runNow = vi.fn(async () => {
    const error = errors.shift();
    if (error !== undefined) throw error;
    return { started: true as const, runId: "run_1abc23", shortId: "1abc23" };
  });
  return { host: { runNow } as unknown as RoutinesHost, runNow };
}

const writeText = vi.fn(async () => {});

beforeEach(() => {
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
});

afterEach(() => {
  writeText.mockClear();
});

verifies("routines.page.run-now-failed", () => {
  it("says the lock's refusal with its next step, and Try again starts the routine again", async () => {
    const { host, runNow } = hostFailing(lockRefusal());
    const toasts = createToastStore();

    await runRoutineNow(host, toasts, daily, undefined);

    const [toast] = toasts.list();
    expect(toast).toMatchObject({
      tone: "danger",
      title: "Couldn't start Daily.",
      text: "Acme is already running in another Halonic on this computer (process 4120). Stop that one, then try again.",
      sticky: true,
      action: { label: "Try again" },
    });
    expect(toast?.secondAction).toBeUndefined();

    toast?.action?.onClick();
    await vi.waitFor(() => expect(runNow).toHaveBeenCalledTimes(2));
    await vi.waitFor(() =>
      expect(toasts.list()[1]?.title).toBe("Run started · Daily · Run 1abc23"),
    );
  });

  it("ends a workflow's refusal with its command, with Copy command and no Try again", async () => {
    const { host } = hostFailing(harnessRefusal());
    const toasts = createToastStore();

    await runRoutineNow(host, toasts, daily, undefined);

    const [toast] = toasts.list();
    expect(toast).toMatchObject({
      title: "Couldn't start Daily.",
      text:
        "Reporter runs in Claude Code, which Halonic can't start yet. To run it in Halonic's own " +
        "loop instead, run this in a terminal: halonic run support-reply --harness halonic",
      action: { label: "Copy command", keepOpen: true },
    });
    expect(toast?.text).not.toContain("isn't answering");
    expect(toast?.secondAction).toBeUndefined();

    toast?.action?.onClick();
    await vi.waitFor(() =>
      expect(writeText).toHaveBeenCalledWith("halonic run support-reply --harness halonic"),
    );
  });

  it("says the engine isn't answering only when it can't be reached, with Try again", async () => {
    const { host } = hostFailing(new EngineNotAnswering());
    const toasts = createToastStore();

    await runRoutineNow(host, toasts, daily, undefined);

    expect(toasts.list()[0]).toMatchObject({
      title: "Couldn't start Daily.",
      text: "The engine isn't answering.",
      action: { label: "Try again" },
    });
  });
});
