import type { ExternalAddress } from "@halonicjs/studio-kit";
import { OpenExternalProvider } from "@halonicjs/studio-kit";
import { act } from "react";
import { vi } from "vitest";
import { account, fakeAccounts, record } from "./accounts.test-helper.ts";
import type { GoogleSetupAccount } from "./api.ts";
import { render } from "./test-support/render.tsx";
import { GoogleSetupView } from "./ui/google-setup-view.tsx";

export const item = {
  kind: "setup",
  key: "setup:google:gaccount_1",
  provider: "google",
  account: "gaccount_1",
  title: "Set up Google for x@example.com",
  progress: "Step 7 of 7 · Sign in",
  changedAt: "2026-11-12T02:10:00.000Z",
} as const;

export const address = "https://accounts.example.com/sign-in?state=abc";
export const upToSignIn = ["project", "apis", "consent", "scopes", "client", "credentials"];
export const ready = {
  projectId: "halonic-x1",
  clientId: "123-abc.apps.googleusercontent.com",
  inProductionTickedAt: "2026-11-12T02:10:00.000Z",
};

export async function settle(): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}

export async function open(
  setup: GoogleSetupAccount,
  options: Parameters<typeof fakeAccounts>[1] = {},
  answering = true,
) {
  const fake = fakeAccounts([setup], options);
  const opened: string[] = [];
  const openExternal = async (target: ExternalAddress) => {
    opened.push(await target);
  };
  const container = render(
    <OpenExternalProvider openExternal={openExternal}>
      <GoogleSetupView item={item} answering={answering} close={() => {}} accounts={fake.source} />
    </OpenExternalProvider>,
  );
  await settle();
  return { fake, container, opened };
}

export function button(container: HTMLElement, name: string): HTMLButtonElement {
  const found = [...container.querySelectorAll("button")].find((b) =>
    b.textContent?.startsWith(name),
  );
  if (found === undefined) throw new Error(`No button "${name}"`);
  return found;
}

export async function press(element: HTMLElement): Promise<void> {
  await act(async () => element.click());
  await settle();
}

export const signedOut = () => account(record(upToSignIn, ready));
