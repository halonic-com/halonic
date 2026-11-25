// @vitest-environment jsdom
import type { SetupViewProps } from "@halonicjs/studio-feature-inbox/api";
import { PresentationProvider } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { account, fakeAccounts, record } from "../accounts.test-helper.ts";
import type { GoogleSetupAccount } from "../api.ts";
import { fakeModal, restoreModal } from "../test-support/modal.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { GoogleSetupView } from "./google-setup-view.tsx";

beforeEach(fakeModal);
afterEach(() => {
  unmountAll();
  restoreModal();
});

const item: SetupViewProps["item"] = {
  kind: "setup",
  key: "setup:google:gaccount_1",
  provider: "google",
  account: "gaccount_1",
  title: "Sign in to Google again for x@example.com",
  progress: "Needs sign-in since 02:10",
  changedAt: "2026-11-12T02:10:00.000Z",
};

const everyStep = ["project", "apis", "consent", "scopes", "client", "credentials", "sign-in"];
const signedInAt = "2026-11-05T02:10:00.000Z";
const refusedAt = "2026-11-12T02:10:00.000Z";

/** A finished setup that Google then refused, for the reason given. */
function refused(
  reason: "sign-in" | "client" | "client-gone",
  extra: Parameters<typeof record>[1] = {},
): GoogleSetupAccount {
  return account(
    record(everyStep, {
      projectId: "halonic-x",
      lastSignInAt: signedInAt,
      refreshRefused: { reason, at: refusedAt },
      ...extra,
    }),
  );
}

async function settled(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function open(accounts: readonly GoogleSetupAccount[], presentation?: "phone") {
  const fake = fakeAccounts(accounts);
  const view = <GoogleSetupView item={item} answering close={vi.fn()} accounts={fake.source} />;
  const container = render(
    presentation === undefined ? (
      view
    ) : (
      <PresentationProvider presentation={presentation}>{view}</PresentationProvider>
    ),
  );
  await settled();
  return container;
}

/** The number of the step that shows its **Not now**, which only the open step does. */
function openStepNumber(container: HTMLElement): number {
  const items = [...(container.querySelector("section > ol") as HTMLElement).children];
  return items.findIndex((li) => li.textContent?.includes("Not now")) + 1;
}

function buttonNames(container: HTMLElement): string[] {
  return [...container.querySelectorAll("button")].map((b) => b.textContent ?? "");
}

verifies("google-setup.connector-problem", () => {
  it("opens a refused sign-in at step 7 with the sentence and Sign in with Google", async () => {
    const container = await open([refused("sign-in", { inProductionTickedAt: signedInAt })]);
    expect(openStepNumber(container)).toBe(7);
    expect(container.textContent).toContain(
      "Google no longer accepts Halonic's sign-in for x@example.com. This happens when access is removed in your Google account or when the password changes. Nothing ran.",
    );
    expect(buttonNames(container)).toContain("Sign in with Google");
  });

  it("says the weekly sign-in ended for invalid_grant at day 7 on a Testing app, at step 7 only", async () => {
    const container = await open([refused("sign-in")]);
    expect(container.textContent).toContain(
      "Your weekly sign-in ended. Google ends the sign-in after 7 days for apps in Testing. Sign in again; your setup is kept. Nothing ran.",
    );
    expect(container.textContent).not.toContain("no longer accepts");
    const summaries = [...container.querySelectorAll("details summary")].map((x) => x.textContent);
    expect(summaries).toContain("Why not publish?");
    // A personal app in Testing has six steps, so signing in is step 6.
    expect(openStepNumber(container)).toBe(6);
  });

  it("gives the generic sentence for invalid_grant at day 3, or at day 7 on an app In production", async () => {
    const early = await open([
      refused("sign-in", { refreshRefused: { reason: "sign-in", at: "2026-11-08T02:10:00.000Z" } }),
    ]);
    expect(early.textContent).toContain(
      "Google no longer accepts Halonic's sign-in for x@example.com. This happens when access is removed in your Google account, when the password changes, or when an app in Testing reaches 7 days. Nothing ran.",
    );
    expect(early.textContent).not.toContain("Your weekly sign-in ended.");
    unmountAll();

    const published = await open([
      refused("sign-in", {
        personalApp: { publishing: "production", testUserTickedAt: null, sharedApp: false },
      }),
    ]);
    expect(published.textContent).toContain("Google no longer accepts Halonic's sign-in");
    expect(published.textContent).not.toContain("Your weekly sign-in ended.");
    expect(published.textContent).not.toContain("or when an app in Testing reaches 7 days");
  });

  it("never says the weekly sign-in ended on a Workspace account, which has no app in Testing", async () => {
    const container = await open([
      refused("sign-in", { accountType: "workspace", inProductionTickedAt: null }),
    ]);
    expect(container.textContent).toContain("Google no longer accepts Halonic's sign-in");
    expect(container.textContent).not.toContain("Your weekly sign-in ended.");
    expect(openStepNumber(container)).toBe(7);
  });

  it("opens the sign-in step, not Google, when you choose Sign in with Google", async () => {
    const container = await open([refused("sign-in")]);
    const button = [...container.querySelectorAll("button")].find(
      (b) => b.textContent === "Sign in with Google",
    );
    await act(async () => button?.click());
    // A personal app in Testing has six steps, so signing in is step 6.
    expect(openStepNumber(container)).toBe(6);
  });

  it("opens a refused client secret at step 6 with Replace secret", async () => {
    const container = await open([refused("client")]);
    expect(openStepNumber(container)).toBe(5);
    expect(container.textContent).toContain(
      "Google no longer accepts the saved client secret. Paste the current one.",
    );
    expect(buttonNames(container)).toContain("Replace secret");
  });

  it("opens a client Google no longer knows at step 5", async () => {
    const container = await open([refused("client-gone")]);
    expect(openStepNumber(container)).toBe(4);
    expect(container.textContent).toContain(
      "Google doesn't recognise this client any more. Create a new client and sign in again.",
    );
    expect(buttonNames(container)).toContain("Create a new client");
  });

  it("shows no banner for an account Google has refused nothing for", async () => {
    const container = await open([
      account(record(everyStep, { projectId: "halonic-x", inProductionTickedAt: signedInAt })),
    ]);
    expect(container.textContent).not.toContain("no longer accepts");
    expect(buttonNames(container)).not.toContain("Sign in with Google");
  });

  it("leaves focus on the open step's title, not on the banner", async () => {
    await open([refused("sign-in")]);
    expect(document.activeElement?.tagName).toBe("H3");
  });

  it("has no button on a phone and says to fix it on the computer", async () => {
    const container = await open(
      [refused("sign-in", { inProductionTickedAt: signedInAt })],
      "phone",
    );
    expect(container.querySelectorAll("button")).toHaveLength(0);
    expect(container.textContent).toContain("Google no longer accepts Halonic's sign-in");
    expect(container.textContent).toContain("Fix this on your computer: Library › Connectors");
    expect(container.textContent).toContain(
      "Your client ID and secret are kept. Only the sign-in is needed.",
    );
  });

  it("does not say the client is kept again on a phone when the weekly sign-in ended, which says so", async () => {
    const container = await open([refused("sign-in")], "phone");
    expect(container.textContent).toContain("your setup is kept");
    expect(container.textContent).not.toContain("are kept");
  });

  it("does not say the client is kept on a phone when the secret was refused", async () => {
    const container = await open([refused("client")], "phone");
    expect(container.textContent).not.toContain("are kept");
  });
});
