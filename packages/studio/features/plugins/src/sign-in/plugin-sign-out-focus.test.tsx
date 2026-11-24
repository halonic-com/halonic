// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { afterEach, expect, it } from "vitest";
import { unmountAll } from "../test-support/render.tsx";
import { button, comeBack, FakeSignIns, press, show } from "../test-support/sign-ins.tsx";

afterEach(unmountAll);

/** Presses a button the way a keyboard does: focus on it first. */
async function pressFromKeyboard(name: string) {
  button(name)?.focus();
  await press(name);
}

/** A sign-in that is signed in, with what the announcer reads written down. */
async function showSignedIn(signIns = new FakeSignIns()) {
  signIns.statuses = [{ signIn: "account", state: "signedIn" }];
  const announced: string[] = [];
  const view = await show(signIns, { announced });
  return { view, announced };
}

verifies("plugins.plugin-sign-out-focus", () => {
  it("puts focus on Sign in and reads the sign-out when the provider confirmed it", async () => {
    const { announced } = await showSignedIn();

    await pressFromKeyboard("Sign out");

    expect(document.activeElement).toBe(button("Sign in"));
    expect(announced).toEqual(["sign-in:acme:account: Signed out of acme."]);
  });

  it("reads the sign-out when there was nothing to sign out", async () => {
    const signIns = new FakeSignIns();
    signIns.signOutResult = { kind: "notSignedIn" };
    const { announced } = await showSignedIn(signIns);

    await pressFromKeyboard("Sign out");

    expect(announced).toEqual(["sign-in:acme:account: Signed out of acme."]);
  });

  it("puts focus on Sign in and reads only the not-confirmed line when the provider didn't confirm", async () => {
    const signIns = new FakeSignIns();
    signIns.signOutResult = { kind: "signedOut", revoke: "notConfirmed" };
    const { view, announced } = await showSignedIn(signIns);

    await pressFromKeyboard("Sign out");

    expect(document.activeElement).toBe(button("Sign in"));
    expect(view.textContent).toContain("You're signed out here.");
    expect(announced).toHaveLength(1);
    expect(announced[0]).toMatch(/^sign-in:acme:account: You're signed out here\. /);
  });
});

verifies("plugins.plugin-sign-in-line-follows-state", () => {
  it("drops a failed start's line once the sign-in turns signed in", async () => {
    const signIns = new FakeSignIns();
    signIns.startAnswer = "https://evil.example.net/oauth/authorize";
    const view = await show(signIns);
    await press("Sign in");
    expect(view.textContent).toContain("Couldn't start the sign-in");
    signIns.statuses = [{ signIn: "account", state: "signedIn" }];

    await comeBack();

    expect(button("Sign out")).toBeDefined();
    expect(view.textContent).not.toContain("Couldn't start the sign-in");
  });

  it("keeps a failed start's line while the sign-in stays signed out", async () => {
    const signIns = new FakeSignIns();
    signIns.startAnswer = "https://evil.example.net/oauth/authorize";
    const view = await show(signIns);
    await press("Sign in");

    await comeBack();

    expect(view.textContent).toContain("Couldn't start the sign-in");
  });
});
