// @vitest-environment jsdom

import { KindedError } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { RoutineInputRefused, type RoutinesHost } from "../api.ts";
import { unmount } from "../test-support.tsx";
import { daily, hostReading, runNowButton, showWithToasts } from "./page.test-helper.tsx";

afterEach(unmount);

/** Daily, whose Run now rejects with `error` each time it is pressed. */
function hostFailing(error: Error) {
  const { host } = hostReading(() => daily);
  const runNow = vi.fn(async () => {
    throw error;
  });
  return { host: { ...host, runNow } as RoutinesHost, runNow };
}

// What a start that failed says, apart from routine-page.test.tsx so neither file passes the
// 500-line limit (RT3 and RT4 of HAL-15304).
verifies("routines.page.run-now-failed", () => {
  it("gives the engine's refusal of the input in its own words, then where to fill it in", async () => {
    const refusal = new RoutineInputRefused(
      "The input has no field mail, which the step Read the email reads.",
    );
    const { page, toasts } = await showWithToasts(hostFailing(refusal).host);

    await act(async () => runNowButton(page)?.click());

    expect(toasts.list()[0]).toMatchObject({
      tone: "danger",
      title: "Couldn't start Daily.",
      text: "The input has no field mail, which the step Read the email reads. Fill it in under Starts on the routine's page.",
      sticky: true,
    });
    // Starting again fails the same way until the field is filled in (HAL-15680).
    expect(toasts.list()[0]?.action).toBeUndefined();
  });

  it("keeps an unavailable refusal's sentence and its next step, not 'isn't answering'", async () => {
    const refusal = new KindedError(
      "unavailable",
      "Analyst runs in Claude Code, which Halonic can't start yet.",
      { fix: "Set Analyst to Halonic on its Harness page to run it now." },
    );
    const { page, toasts } = await showWithToasts(hostFailing(refusal).host);

    await act(async () => runNowButton(page)?.click());

    expect(toasts.list()[0]?.text).toBe(
      "Analyst runs in Claude Code, which Halonic can't start yet. Set Analyst to Halonic on its Harness page to run it now.",
    );
    expect(toasts.list()[0]?.action).toBeUndefined();
  });

  it("says a failure without a reason can't be explained, never that the engine isn't answering", async () => {
    const { page, toasts } = await showWithToasts(hostFailing(new Error("ENOENT")).host);

    await act(async () => runNowButton(page)?.click());

    expect(toasts.list()[0]?.text).toBe("Halonic ran into a problem it can't explain yet.");
  });

  it("names the other Halonic that holds the workspace, and Try again runs Run now again", async () => {
    const lock = new KindedError(
      "conflict",
      "Acme is already running in another Halonic on this computer (process 4321).",
      { fix: "Stop that one, then try again." },
    );
    const { host, runNow } = hostFailing(lock);
    const { page, toasts } = await showWithToasts(host);

    await act(async () => runNowButton(page)?.click());

    expect(toasts.list()[0]).toMatchObject({
      title: "Couldn't start Daily.",
      text: "Acme is already running in another Halonic on this computer (process 4321). Stop that one, then try again.",
      action: { label: "Try again" },
      sticky: true,
    });
    await act(async () => toasts.list()[0]?.action?.onClick());
    expect(runNow).toHaveBeenCalledTimes(2);
  });
});
