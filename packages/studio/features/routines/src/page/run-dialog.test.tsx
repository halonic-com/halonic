// @vitest-environment jsdom

import { KindedError } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { RoutinesHost, RoutineView, RunNowResult } from "../api.ts";
import { buttonNamed, openDialogsInJsdom, unmount } from "../test-support.tsx";
import { nextTime } from "../when/when-words.ts";
import {
  daily,
  hostReading,
  hostRunning,
  runNowButton,
  settle,
  showWithToasts,
} from "./page-test-support.tsx";

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
afterEach(() => {
  unmount();
  vi.useRealTimers();
});

const dialogButton = (text: string) =>
  buttonNamed(document.querySelector("dialog") as HTMLElement, text);

const liveSince = "2026-11-06T09:30:00.000Z";
const started: RunNowResult = { started: true, runId: "run_1", shortId: "abc123" };

/** A host that can make the routine live, with the routine's changes gone after it did. */
function hostMakingLive(
  view: RoutineView,
  made: "made" | "cancelled" | Error = "made",
  more: Partial<RoutinesHost> = {},
) {
  let current = view;
  const { host, change } = hostReading(() => current);
  const makeLive = vi.fn(async () => {
    if (made instanceof Error) throw made;
    if (made === "made") current = { ...current, everLive: true, changesNotLive: false };
    if (made === "made") change();
    return made;
  });
  const runNow = vi.fn(async () => started);
  return { host: { ...host, runNow, makeLive, ...more } as RoutinesHost, makeLive, runNow };
}

verifies("routines.page.run-dialog", () => {
  beforeEach(openDialogsInJsdom);

  const changed = { ...daily, changesNotLive: true, liveSince };

  it("asks first when the routine has changes that aren't live, and starts nothing yet", async () => {
    const { host, runNow } = hostMakingLive(changed);
    const { page } = await showWithToasts(host);

    await act(async () => runNowButton(page)?.click());

    const dialog = document.querySelector("dialog") as HTMLElement;
    expect(dialog.textContent).toContain("Run Daily now?");
    expect(dialog.textContent).toContain(
      `Runs the live version from ${nextTime(liveSince, undefined, Intl.DateTimeFormat().resolvedOptions().timeZone)}. Your changes aren't in it.`,
    );
    expect(runNow).not.toHaveBeenCalled();
  });

  it("runs the live version on Run now", async () => {
    const { host, runNow } = hostMakingLive(changed);
    const { page, toasts } = await showWithToasts(host);

    await act(async () => runNowButton(page)?.click());
    await act(async () => dialogButton("Run now")?.click());

    expect(runNow).toHaveBeenCalledTimes(1);
    expect(document.querySelector("dialog")).toBeNull();
    expect(toasts.list()[0]?.title).toBe("Run started · Daily · Run abc123");
  });

  it("changes nothing on Cancel", async () => {
    const { host, runNow, makeLive } = hostMakingLive(changed);
    const { page } = await showWithToasts(host);

    await act(async () => runNowButton(page)?.click());
    await act(async () => dialogButton("Cancel")?.click());

    expect(document.querySelector("dialog")).toBeNull();
    expect(runNow).not.toHaveBeenCalled();
    expect(makeLive).not.toHaveBeenCalled();
  });

  it("comes back without Make live first once the version is made", async () => {
    const { host, makeLive, runNow } = hostMakingLive(changed);
    const { page } = await showWithToasts(host);

    await act(async () => runNowButton(page)?.click());
    await act(async () => dialogButton("Make live first")?.click());
    await settle();

    expect(makeLive).toHaveBeenCalledWith(expect.objectContaining({ hubId: "acme", id: "daily" }));
    expect(dialogButton("Make live first")).toBeUndefined();
    expect(document.querySelector("dialog")?.textContent).not.toContain("aren't in it");
    expect(runNow).not.toHaveBeenCalled();
  });

  it("stays as it was when the version isn't made", async () => {
    const { host } = hostMakingLive(changed, "cancelled");
    const { page } = await showWithToasts(host);

    await act(async () => runNowButton(page)?.click());
    await act(async () => dialogButton("Make live first")?.click());
    await settle();

    expect(dialogButton("Make live first")).toBeDefined();
  });

  it("says why a version couldn't be made, and keeps the dialog", async () => {
    const { host } = hostMakingLive(changed, new KindedError("unavailable", "No room."));
    const { page, toasts } = await showWithToasts(host);

    await act(async () => runNowButton(page)?.click());
    await act(async () => dialogButton("Make live first")?.click());
    await settle();

    expect(toasts.list()[0]).toMatchObject({
      title: "Couldn't make Daily live.",
      text: "No room.",
    });
    expect(document.querySelector("dialog")).not.toBeNull();
  });

  it("makes a routine that never had a version live, then runs it", async () => {
    const { host, makeLive, runNow } = hostMakingLive({ ...daily, everLive: false });
    const { page } = await showWithToasts(host);

    await act(async () => runNowButton(page)?.click());
    expect(dialogButton("Run now")).toBeUndefined();
    await act(async () => dialogButton("Make live and run")?.click());
    await settle();

    expect(makeLive).toHaveBeenCalledTimes(1);
    expect(runNow).toHaveBeenCalledTimes(1);
  });

  it("starts nothing when a never-live routine's version isn't made", async () => {
    const { host, runNow } = hostMakingLive({ ...daily, everLive: false }, "cancelled");
    const { page } = await showWithToasts(host);

    await act(async () => runNowButton(page)?.click());
    await act(async () => dialogButton("Make live and run")?.click());
    await settle();

    expect(runNow).not.toHaveBeenCalled();
    expect(document.querySelector("dialog")).not.toBeNull();
  });

  it("starts at once with no changes, or where the host can't make live", async () => {
    const live = hostMakingLive(daily);
    const first = await showWithToasts(live.host);
    await act(async () => runNowButton(first.page)?.click());
    expect(live.runNow).toHaveBeenCalledTimes(1);
    expect(document.querySelector("dialog")).toBeNull();
    unmount();

    const { host, runNow } = hostMakingLive(changed);
    const second = await showWithToasts({
      ...host,
      makeLive: undefined,
    } as unknown as RoutinesHost);
    await act(async () => runNowButton(second.page)?.click());
    expect(runNow).toHaveBeenCalledTimes(1);
  });
});

verifies("routines.page.run-now-steps", () => {
  const signedOut: RunNowResult = {
    started: false,
    refusal: { reason: "signed-out", account: "fin@acme.example" },
  };
  const notTrusted: RunNowResult = { started: false, refusal: { reason: "not-trusted" } };

  it("offers Sign in with Google on a signed-out refusal, and starts the sign-in", async () => {
    const signIn = vi.fn(async () => {});
    const { host } = hostRunning(signedOut);
    const { page, toasts } = await showWithToasts({ ...host, signIn });

    await act(async () => runNowButton(page)?.click());
    expect(toasts.list()[0]?.action?.label).toBe("Sign in with Google");
    toasts.list()[0]?.action?.onClick();

    expect(signIn).toHaveBeenCalledWith("fin@acme.example");
  });

  it("says why the sign-in couldn't start", async () => {
    const signIn = vi.fn(async () => {
      throw new KindedError("unavailable", "Google isn't reachable.");
    });
    const { host } = hostRunning(signedOut);
    const { page, toasts } = await showWithToasts({ ...host, signIn });

    await act(async () => runNowButton(page)?.click());
    await act(async () => toasts.list()[0]?.action?.onClick());
    await settle();

    expect(toasts.list()[1]).toMatchObject({
      title: "Couldn't start the sign-in for fin@acme.example.",
      text: "Google isn't reachable.",
    });
  });

  it("has no step where the host can't sign in", async () => {
    const { host } = hostRunning(signedOut);
    const { page, toasts } = await showWithToasts(host);

    await act(async () => runNowButton(page)?.click());

    expect(toasts.list()[0]?.action).toBeUndefined();
  });

  it("opens the trust gate instead of a toast, and starts the run once it is trusted", async () => {
    const { host, runNow } = hostRunning(notTrusted);
    runNow.mockResolvedValueOnce(notTrusted).mockResolvedValueOnce(started);
    const askTrust = vi.fn(async () => "trusted" as const);
    const { page, toasts } = await showWithToasts({ ...host, askTrust });

    await act(async () => runNowButton(page)?.click());
    await settle();

    expect(askTrust).toHaveBeenCalledTimes(1);
    expect(runNow).toHaveBeenCalledTimes(2);
    expect(toasts.list()[0]?.title).toBe("Run started · Daily · Run abc123");
  });

  it("says Daily isn't trusted yet on Not now", async () => {
    const { host } = hostRunning(notTrusted);
    const askTrust = vi.fn(async () => "declined" as const);
    const { page, toasts } = await showWithToasts({ ...host, askTrust });

    await act(async () => runNowButton(page)?.click());

    expect(toasts.list()[0]).toMatchObject({
      title: "Not started: Daily isn't trusted yet.",
      sticky: true,
    });
  });

  it("asks for trust only once when the workspace is still refused", async () => {
    const { host, runNow } = hostRunning(notTrusted);
    const askTrust = vi.fn(async () => "trusted" as const);
    const { page, toasts } = await showWithToasts({ ...host, askTrust });

    await act(async () => runNowButton(page)?.click());
    await settle();

    expect(askTrust).toHaveBeenCalledTimes(1);
    expect(runNow).toHaveBeenCalledTimes(2);
    expect(toasts.list()[0]?.title).toBe("Not started: Daily isn't trusted yet.");
  });
});
