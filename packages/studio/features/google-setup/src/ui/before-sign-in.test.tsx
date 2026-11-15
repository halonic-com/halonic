// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { account, fakeAccounts, record } from "../accounts.test-helper.ts";
import type { GoogleSetupAccount } from "../api.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { GoogleSetupView } from "./google-setup-view.tsx";

afterEach(unmountAll);

const item = {
  kind: "setup",
  key: "setup:google:gaccount_1",
  provider: "google",
  account: "gaccount_1",
  title: "Set up Google for x@example.com",
  progress: "Step 7 of 7 · Sign in",
  changedAt: "2026-11-12T02:10:00.000Z",
} as const;

const upToSignIn = ["project", "apis", "consent", "scopes", "client", "credentials"];
const savedClient = {
  projectId: "halonic-x1",
  clientId: "123-abc.apps.googleusercontent.com",
  inProductionTickedAt: "2026-11-12T02:10:00.000Z",
};

async function open(setup: GoogleSetupAccount) {
  const container = render(
    <GoogleSetupView
      item={item}
      answering
      close={vi.fn()}
      accounts={fakeAccounts([setup]).source}
    />,
  );
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return container;
}

verifies("google-setup.before-sign-in", () => {
  it("previews Google's warning for a personal account, with the app name and the ticked services", async () => {
    const container = await open(account(record(upToSignIn, savedClient)));
    const text = container.textContent ?? "";
    expect(text).toContain(
      "Google will show a warning first, because your app is yours and Google hasn't reviewed it:",
    );
    expect(text).toContain(`"Google hasn't verified this app"`);
    const steps = [...container.querySelectorAll("ol.list-decimal li")].map((li) => li.textContent);
    expect(steps).toEqual([
      'Click "Advanced"',
      'Click "Go to Halonic (own app) (unsafe)"',
      'Tick the boxes for Ledger, then "Continue"',
    ]);
    expect(text).toContain("The name in step 2 is the app name you chose in step 3.");
    expect(text).not.toContain("Copy a note for your admin");
  });

  it("offers a Workspace account the admin note and no preview", async () => {
    const container = await open(
      account(record(upToSignIn, { ...savedClient, accountType: "workspace" })),
    );
    const text = container.textContent ?? "";
    expect(text).toContain("Your admin may have to allow this app");
    expect(text).toContain("project halonic-x1");
    expect(text).toContain("client ID 123-abc.apps.googleusercontent.com");
    expect(
      container.querySelector('button[aria-label="Copy a note for your admin"]'),
    ).not.toBeNull();
    expect(text).not.toContain("Google hasn't verified this app");
  });
});
