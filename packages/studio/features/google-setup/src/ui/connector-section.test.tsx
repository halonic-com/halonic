// @vitest-environment jsdom
import { InboxService } from "@halonicjs/studio-feature-inbox/api";
import { createToastStore, ToastStoreProvider } from "@halonicjs/studio-kit";
import { type ItemPageSectionViewProps, limitedLookup } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { account, fakeAccounts, record } from "../accounts.test-helper.ts";
import { GoogleSetupAccountsService } from "../api.ts";
import { googleSetupFeature } from "../feature.ts";
import { fakeModal, restoreModal } from "../test-support/modal.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { ConnectorSection } from "./connector-section.tsx";

beforeEach(fakeModal);
afterEach(() => {
  unmountAll();
  restoreModal();
});

const at = "2026-11-12T02:10:00.000Z";
// The helper's record is linked to the connector `gmail`.
const signedIn = account(
  record(["project", "apis"], {
    projectId: "halonic-x",
    clientId: "1234-abc.apps.googleusercontent.com",
    clientSecret: { clientRef: "gclient_1", savedAt: at },
    lastSignInAt: at,
  }),
);
const disconnected = account(record([]));

function setup(connectorId: string, initial = [signedIn]) {
  const accounts = fakeAccounts(initial);
  const openSetup = vi.fn();
  const openPlace = vi.fn();
  const services = new Map<unknown, unknown>([
    [GoogleSetupAccountsService, accounts.source],
    [InboxService, { openSetup }],
  ]);
  const props = {
    item: { kind: "connector", hub: "local", id: connectorId },
    context: {
      services: limitedLookup(googleSetupFeature, { get: (key) => services.get(key) }),
      openPlace,
    },
  } as unknown as ItemPageSectionViewProps;
  return { accounts, openSetup, openPlace, props };
}

const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

function button(container: HTMLElement, name: string): HTMLButtonElement {
  const found = [...container.querySelectorAll("button")].find((b) => b.textContent === name);
  if (found === undefined) throw new Error(`No button "${name}"`);
  return found;
}

function questionButton(container: HTMLElement, name: string): HTMLButtonElement {
  const found = [
    ...(container.querySelector("dialog[open]")?.querySelectorAll("button") ?? []),
  ].find((b) => b.textContent?.startsWith(name));
  if (found === undefined) throw new Error(`No button "${name}" in the question`);
  return found;
}

async function press(target: HTMLElement): Promise<void> {
  await act(async () => target.click());
  await settle();
}

verifies("google-setup.connector-section", () => {
  it("shows the block on the page of the connector its account is linked to", async () => {
    const { props } = setup("gmail");
    const root = render(<ConnectorSection {...props} />);
    await settle();
    expect(root.textContent).toContain("Google account");
    expect(root.textContent).toContain("x@example.com");
  });

  it("shows nothing on the page of another connector", async () => {
    const { props } = setup("notes");
    const root = render(<ConnectorSection {...props} />);
    await settle();
    expect(root.textContent).toBe("");
  });

  it("opens the setup item in the Inbox from Sign in again", async () => {
    const { props, openSetup, openPlace } = setup("gmail");
    const root = render(<ConnectorSection {...props} />);
    await settle();
    await press(button(root, "Sign in again"));
    expect(openSetup).toHaveBeenCalledWith("google", "gaccount_1");
    expect(openPlace).toHaveBeenCalledWith("inbox");
  });

  it("disconnects through the app, then reads the account again", async () => {
    const { props, accounts } = setup("gmail");
    const toasts = createToastStore();
    const root = render(
      <ToastStoreProvider store={toasts}>
        <ConnectorSection {...props} />
      </ToastStoreProvider>,
    );
    await settle();
    await press(button(root, "Disconnect Google…"));
    await press(questionButton(root, "Disconnect"));
    expect(accounts.disconnects).toEqual(["gaccount_1"]);
    accounts.change([disconnected]);
    await settle();
    expect(button(root, "Set up")).toBeDefined();
  });

  it("keeps the block when the accounts can't be read again", async () => {
    const { props, accounts } = setup("gmail");
    const root = render(<ConnectorSection {...props} />);
    await settle();
    accounts.source.list = async () => {
      throw new Error("The engine isn't answering.");
    };
    accounts.change([signedIn]);
    await settle();
    expect(root.textContent).toContain("x@example.com");
    expect(button(root, "Disconnect Google…").getAttribute("aria-disabled")).toBe("true");
  });
});
