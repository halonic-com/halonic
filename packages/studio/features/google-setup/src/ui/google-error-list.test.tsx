// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { account, record } from "../accounts.test-helper.ts";
import type { GoogleSetupAccount } from "../api.ts";
import {
  address,
  button,
  driveClock,
  open,
  press,
  ready,
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

function summary(container: HTMLElement): HTMLElement {
  const found = [...container.querySelectorAll("summary")].find((s) =>
    s.textContent?.includes("Google showed an error instead?"),
  );
  if (found === undefined) throw new Error("No error list");
  return found;
}

function errorCodes(container: HTMLElement): string[] {
  const list = summary(container).closest("details");
  return [...(list?.querySelectorAll("li strong") ?? [])].map((row) => row.textContent ?? "");
}

async function waiting(setup: GoogleSetupAccount) {
  const opened = await open(setup, { startSignIn: async () => address });
  await press(button(opened.container, "Sign in with Google"));
  return opened;
}

verifies("google-setup.google-error-list", () => {
  it("is folded under the waiting state, and not there before a sign-in starts", async () => {
    const before = await open(signedOut());
    expect(() => summary(before.container)).toThrow();
    const { container } = await waiting(signedOut());
    expect(summary(container).closest("details")?.open).toBe(false);
  });

  it("gives a personal account three rows and no Workspace row", async () => {
    const { container } = await waiting(signedOut());
    expect(errorCodes(container)).toEqual([
      "Error 401: invalid_client",
      "Error 400: redirect_uri_mismatch",
      "Error 403: access_denied",
    ]);
    expect(container.textContent).toContain(
      "The client ID isn't right. Copy it again from your client's page into step 6, then sign in again.",
    );
  });

  it("adds the organisation rows for a Workspace account, with the note for the admin, and no Testing row", async () => {
    const { container } = await waiting(
      account(record(upToSignIn, { ...ready, accountType: "workspace" })),
    );
    expect(errorCodes(container)).toEqual([
      "Error 401: invalid_client",
      "Error 400: redirect_uri_mismatch",
      "Error 403: org_internal",
      "admin_policy_enforced",
    ]);
    expect(container.textContent).toContain("Choose x@example.com when Google asks.");
    const list = summary(container).closest("details");
    expect(list?.querySelector('button[aria-label="Copy a note for your admin"]')).not.toBeNull();
  });

  it("opens step 6 from the invalid_client row", async () => {
    const { container } = await waiting(signedOut());
    await press(button(container, "Open step 6"));
    expect(container.textContent).toContain("Closed Google's window before copying the secret?");
    expect(() => summary(container)).toThrow();
    expect(() => button(container, "Open again")).toThrow();
  });

  it("gives the redirect_uri_mismatch row one button, to step 5", async () => {
    const { container } = await waiting(signedOut());
    const list = summary(container).closest("details");
    const row = [...(list?.querySelectorAll("li") ?? [])].find((li) =>
      li.textContent?.includes("redirect_uri_mismatch"),
    );
    expect([...(row?.querySelectorAll("button") ?? [])].map((b) => b.textContent)).toEqual([
      "Open step 5",
    ]);
  });

  it("clears the In production tick and opens step 3 from the access_denied row", async () => {
    const { fake, container } = await waiting(signedOut());
    await press(button(container, "Open step 3"));
    expect(fake.edits).toContainEqual({
      accountRef: "gaccount_1",
      edit: { kind: "in-production", ticked: false },
    });
    expect(container.textContent).toContain('The status says "In production"');
    expect(() => button(container, "Open again")).toThrow();
  });

  it("ends the wait before it opens a step", async () => {
    const { fake, container } = await waiting(signedOut());
    await press(button(container, "Open step 6"));
    expect(fake.cancelled).toEqual(["gaccount_1"]);
    expect(container.textContent).toContain("Client secret");
  });

  it("opens the step even when the cancel fails", async () => {
    const { fake, container } = await open(signedOut(), {
      startSignIn: async () => address,
      cancelSignIn: async () => {
        throw new Error("offline");
      },
    });
    await press(button(container, "Sign in with Google"));
    await press(button(container, "Open step 6"));
    expect(fake.cancelled).toEqual([]);
    expect(container.textContent).toContain("Client secret");
  });
});
