// @vitest-environment jsdom

import { KindedError } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  EngineNotAnswering,
  type RoutinesHost,
  type RoutineView,
  type RunNowRefusal,
  type RunNowResult,
} from "../api.ts";
import { buttonNamed, openDialogsInJsdom, show, unmount } from "../test-support.tsx";
import { nextTime } from "../when/when-words.ts";
import { daily, hostReading, screenOf, settle, showWithToasts } from "./page-test-support.tsx";

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
afterEach(() => {
  unmount();
  vi.useRealTimers();
});

/** A host that reads "Daily" and answers Run now with `answer`, or rejects with it when it is an error. */
function hostRunning(answer: RunNowResult | Error, view: RoutineView = daily) {
  const { host } = hostReading(() => view);
  const runNow = vi.fn(async () => {
    if (answer instanceof Error) throw answer;
    return answer;
  });
  return { host: { ...host, runNow } as RoutinesHost, runNow };
}

const runNowButton = (page: HTMLElement) => buttonNamed(page, "Run now");

verifies("routines.page.run-now", () => {
  it("shows no Run now while the host has no engine", async () => {
    const page = await show(screenOf(hostReading(() => daily).host));

    expect(runNowButton(page)).toBeUndefined();
  });

  it("starts the run, also while the routine is off, and offers Open run", async () => {
    const opened: string[] = [];
    const { host, runNow } = hostRunning(
      { started: true, runId: "run_1", shortId: "abc123" },
      { ...daily, enabled: false },
    );
    const { page, toasts } = await showWithToasts(host, (runId) => opened.push(runId));

    await act(async () => runNowButton(page)?.click());

    expect(runNow).toHaveBeenCalledWith(expect.objectContaining({ hubId: "acme", id: "daily" }));
    expect(toasts.list()[0]).toMatchObject({
      title: "Run started · Daily · Run abc123",
      action: { label: "Open run" },
    });
    toasts.list()[0]?.action?.onClick();
    expect(opened).toEqual(["run_1"]);
  });

  it("starts one run for two presses while the host is still starting the first", async () => {
    const { host } = hostRunning({ started: true, runId: "run_1", shortId: "abc123" });
    let answer: (result: RunNowResult) => void = () => {};
    const runNow = vi.fn(() => new Promise<RunNowResult>((resolve) => (answer = resolve)));
    const { page } = await showWithToasts({ ...host, runNow } as RoutinesHost);

    await act(async () => runNowButton(page)?.click());
    await act(async () => runNowButton(page)?.click());
    expect(runNow).toHaveBeenCalledTimes(1);
    expect(runNowButton(page)?.getAttribute("aria-busy")).toBe("true");

    await act(async () => answer({ started: true, runId: "run_1", shortId: "abc123" }));
    await act(async () => runNowButton(page)?.click());
    expect(runNow).toHaveBeenCalledTimes(2);
  });

  it("says the one reason a refusal gives, and the toast stays", async () => {
    const refusals: [RunNowRefusal, string][] = [
      [{ reason: "target-never-live" }, "Not started: Briefing isn't live yet."],
      [{ reason: "target-in-trash" }, "Not started: Briefing is in the trash."],
      [{ reason: "target-not-found" }, "Not started: Briefing isn't in this hub any more."],
      [{ reason: "not-trusted" }, "Not started: Daily isn't trusted yet."],
      [
        { reason: "signed-out", account: "fin@acme.example" },
        "Not started: fin@acme.example is signed out.",
      ],
    ];
    for (const [refusal, title] of refusals) {
      const { host } = hostRunning({ started: false, refusal });
      const { page, toasts } = await showWithToasts(host);

      await act(async () => runNowButton(page)?.click());

      expect(toasts.list()[0]).toMatchObject({ title, sticky: true });
      unmount();
    }
  });

  it("says when the engine isn't answering", async () => {
    const { host } = hostRunning(new EngineNotAnswering());
    const { page, toasts } = await showWithToasts(host);

    await act(async () => runNowButton(page)?.click());

    expect(toasts.list()[0]).toMatchObject({
      title: "Couldn't start Daily.",
      text: "The engine isn't answering.",
      sticky: true,
    });
  });
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
