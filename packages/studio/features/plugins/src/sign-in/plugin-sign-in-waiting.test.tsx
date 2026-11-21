// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { unmountAll } from "../test-support/render.tsx";
import { button, comeBack, FakeSignIns, press, show } from "../test-support/sign-ins.tsx";

afterEach(unmountAll);

const waitingLine = "Waiting for acme… Finish in your browser.";

verifies("plugins.plugin-sign-in-waiting", () => {
  it("waits for the browser with Cancel in place of Sign in", async () => {
    const view = await show(new FakeSignIns());

    await press("Sign in");

    expect(view.textContent).toContain(waitingLine);
    expect(button("Cancel")).toBeDefined();
    expect(button("Sign in")).toBeUndefined();
  });

  it("keeps waiting when the person comes back before the browser finished", async () => {
    const view = await show(new FakeSignIns());
    await press("Sign in");

    await comeBack();

    expect(view.textContent).toContain(waitingLine);
  });

  it("ends the wait when the sign-in finished in the browser", async () => {
    const signIns = new FakeSignIns();
    const view = await show(signIns);
    await press("Sign in");
    signIns.statuses = [{ signIn: "account", state: "signedIn" }];

    await comeBack();

    expect(view.textContent).not.toContain(waitingLine);
    expect(view.textContent).toContain("Signed in");
    expect(button("Sign out")).toBeDefined();
  });

  it("ends the wait and says how when the sign-in ended without a grant", async () => {
    const signIns = new FakeSignIns();
    const view = await show(signIns);
    await press("Sign in");
    signIns.statuses = [
      {
        signIn: "account",
        state: "signedOut",
        lastOutcome: { kind: "providerError", errorCode: "access_denied" },
      },
    ];

    await comeBack();

    expect(view.textContent).not.toContain(waitingLine);
    expect(view.textContent).toContain("acme answered with the error access_denied.");
    expect(button("Sign in")).toBeDefined();
  });

  it("hides how the last sign-in ended while it waits for a new one", async () => {
    const signIns = new FakeSignIns();
    signIns.statuses = [
      { signIn: "account", state: "signedOut", lastOutcome: { kind: "cancelled" } },
    ];
    const view = await show(signIns);

    await press("Sign in");

    expect(view.textContent).not.toContain("You cancelled the sign-in.");
  });

  it("cancels the pending sign-in at the host and offers Sign in again, with focus on it", async () => {
    const signIns = new FakeSignIns();
    const view = await show(signIns);
    await press("Sign in");
    button("Cancel")?.focus();

    await press("Cancel");

    expect(signIns.calls).toContain("cancel acme account");
    expect(view.textContent).not.toContain(waitingLine);
    expect(document.activeElement).toBe(button("Sign in"));
  });

  it("keeps waiting and says why when Cancel fails", async () => {
    const signIns = new FakeSignIns();
    signIns.cancelError = new Error("The agent host isn't running.");
    const view = await show(signIns);
    await press("Sign in");

    await press("Cancel");

    expect(view.textContent).toContain(waitingLine);
    expect(view.textContent).toContain("Couldn't cancel the sign-in:");
  });

  it("stops waiting when the host no longer takes the browser's answer", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      const view = await show(new FakeSignIns());
      await press("Sign in");

      await act(async () => vi.advanceTimersByTime(10 * 60 * 1000));

      expect(view.textContent).not.toContain(waitingLine);
      expect(view.textContent).toContain("The sign-in didn't finish. Try again.");
      expect(button("Sign in")).toBeDefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it("doesn't wait when the browser didn't open", async () => {
    const signIns = new FakeSignIns();
    signIns.startAnswer = "https://evil.example.net/oauth/authorize";
    const view = await show(signIns);

    await press("Sign in");

    expect(view.textContent).not.toContain(waitingLine);
    expect(button("Sign in")).toBeDefined();
  });

  it("reads the waiting line once through the window's announcer", async () => {
    const announced: string[] = [];
    await show(new FakeSignIns(), { announced });

    await press("Sign in");

    expect(announced).toEqual([`sign-in:acme:account: ${waitingLine}`]);
  });
});
