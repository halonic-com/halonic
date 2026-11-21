// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { unmountAll } from "../test-support/render.tsx";
import { button, comeBack, FakeSignIns, press, show } from "../test-support/sign-ins.tsx";

afterEach(unmountAll);

/** Presses a button the way a keyboard does: focus on it first. */
async function pressFromKeyboard(name: string) {
  button(name)?.focus();
  await press(name);
}

verifies("plugins.plugin-sign-in-waiting-focus", () => {
  it("puts focus on Cancel when the wait starts from Sign in", async () => {
    await show(new FakeSignIns());

    await pressFromKeyboard("Sign in");

    expect(document.activeElement).toBe(button("Cancel"));
  });

  it("puts focus on Sign out when the sign-in finished in the browser", async () => {
    const signIns = new FakeSignIns();
    await show(signIns);
    await pressFromKeyboard("Sign in");
    signIns.statuses = [{ signIn: "account", state: "signedIn" }];

    await comeBack();

    expect(document.activeElement).toBe(button("Sign out"));
  });

  it("puts focus on Sign out when the person was on Open again", async () => {
    const signIns = new FakeSignIns();
    await show(signIns);
    await pressFromKeyboard("Sign in");
    button("Open again")?.focus();
    signIns.statuses = [{ signIn: "account", state: "signedIn" }];

    await comeBack();

    expect(document.activeElement).toBe(button("Sign out"));
  });

  it("puts focus on Sign in when the sign-in ended without a grant", async () => {
    const signIns = new FakeSignIns();
    await show(signIns);
    await pressFromKeyboard("Sign in");
    signIns.statuses = [
      {
        signIn: "account",
        state: "signedOut",
        lastOutcome: { kind: "providerError", errorCode: "access_denied" },
      },
    ];

    await comeBack();

    expect(document.activeElement).toBe(button("Sign in"));
  });

  it("puts focus on Sign in when the host's wait runs out", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      await show(new FakeSignIns());
      await pressFromKeyboard("Sign in");

      await act(async () => vi.advanceTimersByTime(10 * 60 * 1000));

      expect(document.activeElement).toBe(button("Sign in"));
    } finally {
      vi.useRealTimers();
    }
  });

  it("makes Sign in, Open again and Cancel touch buttons on a phone", async () => {
    await show(new FakeSignIns(), { presentation: "phone" });
    expect(button("Sign in")?.className).toContain("min-h-touch");

    await press("Sign in");

    expect(button("Open again")?.className).toContain("min-h-touch");
    expect(button("Cancel")?.className).toContain("min-h-touch");
  });

  it("keeps the small buttons on a desktop", async () => {
    await show(new FakeSignIns());

    expect(button("Sign in")?.className).not.toContain("min-h-touch");
  });
});
