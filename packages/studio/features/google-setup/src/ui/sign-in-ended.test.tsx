// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { account, record } from "../accounts.test-helper.ts";
import {
  address,
  button,
  driveClock,
  open,
  press,
  ready,
  settle,
  signedOut,
  upToSignIn,
} from "../sign-in-view.test-helper.tsx";
import { unmountAll } from "../test-support/render.tsx";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  driveClock((ms) => vi.advanceTimersByTimeAsync(ms));
});
afterEach(() => {
  unmountAll();
  vi.useRealTimers();
});

const endedAt = "2026-11-12T02:40:00.000Z";

function ended(kind: "cancelled" | "secretRefused" | "adminBlocked") {
  return account(record(upToSignIn, { ...ready, lastSignInEnded: { kind, at: endedAt } }));
}

verifies("google-setup.sign-in-ended", () => {
  it("says the person cancelled, apart from Google's Testing page", async () => {
    const { container } = await open(ended("cancelled"));
    expect(container.textContent).toContain("You cancelled the sign-in. Nothing was saved.");
    expect(container.textContent).not.toContain("Testing");
    expect(button(container, "Sign in with Google")).toBeDefined();
  });

  it("says Google refused the client secret and opens step 6", async () => {
    const { container } = await open(ended("secretRefused"));
    expect(container.textContent).toContain(
      "Google didn't accept the client secret. Paste it again from your client's page, then sign in again.",
    );
    await press(button(container, "Open step 6"));
    expect(container.textContent).toContain("Client secret");
  });

  it("says the admin blocked the app and offers the note", async () => {
    const { container } = await open(ended("adminBlocked"));
    expect(container.textContent).toContain(
      "Your organisation's admin hasn't allowed this app yet. This is set by your admin, not by Halonic.",
    );
    expect(
      container.querySelector('button[aria-label="Copy a note for your admin"]'),
    ).not.toBeNull();
  });

  it("shows none of them when the record has no ending", async () => {
    const { container } = await open(signedOut());
    expect(container.textContent).not.toContain("You cancelled");
    expect(container.textContent).not.toContain("didn't accept the client secret");
    expect(container.textContent).not.toContain("hasn't allowed this app");
  });

  it("shows the note, not 'didn't finish', when a waiting sign-in was cancelled", async () => {
    const { fake, container } = await open(signedOut(), { startSignIn: async () => address });
    await press(button(container, "Sign in with Google"));
    await act(async () => {
      fake.change([
        account(record(upToSignIn, { ...ready, signInStartedAt: "2026-11-12T03:00:00.000Z" })),
      ]);
    });
    await settle();
    await act(async () => {
      fake.change([ended("cancelled")]);
    });
    await settle();
    expect(container.textContent).toContain("You cancelled the sign-in");
    expect(container.textContent).not.toContain("didn't finish");
    expect(container.textContent).not.toContain("Waiting for Google");
  });
});
