// @vitest-environment jsdom
import { InboxService } from "@halonicjs/studio-feature-inbox/api";
import { createBadgeRegistry, type WorkspaceContext } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { account, fakeAccounts, record } from "../accounts.test-helper.ts";
import { GoogleSetupAccountsService } from "../api.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { ConnectorBadges } from "./connector-badges.tsx";

afterEach(unmountAll);

const at = "2026-11-12T02:10:00.000Z";
const refused = account(
  record([], { lastSignInAt: at, refreshRefused: { reason: "sign-in", at } }),
);
const fine = account(record([], { lastSignInAt: at }));

function setup(initial = [refused]) {
  const accounts = fakeAccounts(initial);
  const openSetup = vi.fn();
  const openPlace = vi.fn();
  const badges = createBadgeRegistry();
  const services = new Map<unknown, unknown>([
    [GoogleSetupAccountsService, accounts.source],
    [InboxService, { openSetup }],
  ]);
  const context = {
    services: { get: (key: unknown) => services.get(key) },
    announcer: {},
    badges,
    openPlace,
  } as unknown as WorkspaceContext;
  return { accounts, badges, openSetup, openPlace, context };
}

const settle = () => act(async () => {});

verifies("google-setup.connector-badges", () => {
  it("shows a badge for a refused account, and Fix opens its setup item in the Inbox", async () => {
    const { badges, context, openSetup, openPlace } = setup();
    render(<ConnectorBadges context={context} />);
    await settle();
    const [badge] = badges.list();
    expect(badge?.label).toBe("Needs sign-in");
    badge?.onSelect?.(null);
    expect(openSetup).toHaveBeenCalledWith("google", "gaccount_1");
    expect(openPlace).toHaveBeenCalledWith("inbox");
  });

  it("removes the badge when the account is fixed, and when the window closes", async () => {
    const { accounts, badges, context } = setup();
    render(<ConnectorBadges context={context} />);
    await settle();
    expect(badges.list()).toHaveLength(1);
    accounts.change([fine]);
    await settle();
    expect(badges.list()).toHaveLength(0);
    accounts.change([refused]);
    await settle();
    expect(badges.list()).toHaveLength(1);
    unmountAll();
    expect(badges.list()).toHaveLength(0);
  });
});
