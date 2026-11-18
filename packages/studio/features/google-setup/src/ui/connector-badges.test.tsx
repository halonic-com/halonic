// @vitest-environment jsdom
import { InboxService } from "@halonicjs/studio-feature-inbox/api";
import { RunsListService, type SourcedRun } from "@halonicjs/studio-feature-runs/api";
import { createBadgeRegistry, limitedLookup, type WorkspaceContext } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { account, fakeAccounts, record } from "../accounts.test-helper.ts";
import { GoogleSetupAccountsService } from "../api.ts";
import { googleSetupFeature } from "../feature.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { ConnectorBadges } from "./connector-badges.tsx";

afterEach(unmountAll);

const at = "2026-11-12T02:10:00.000Z";
const refused = account(
  record([], { lastSignInAt: at, refreshRefused: { reason: "sign-in", at } }),
);
const fine = account(record([], { lastSignInAt: at }));

/** A real run of the Support workflow that started `minutes` after 10:00 and ended. */
function run(minutes: number, changes: object): SourcedRun {
  const startedAt = new Date(Date.UTC(2026, 10, 12, 10, minutes)).toISOString();
  return {
    summary: {
      id: `run_${minutes}`,
      hubId: "acme",
      workflowId: "support-reply",
      kind: "run",
      status: "completed",
      startedAt,
      endedAt: startedAt,
      ...changes,
    } as unknown as SourcedRun["summary"],
  };
}

const gmailOff = run(0, {
  status: "failed",
  error: "Gmail API has not been used in project 123 before",
  cause: {
    kind: "denied",
    code: "google.api-disabled",
    detail: { api: "gmail.googleapis.com", project: "halonic-x" },
  },
});

function setup(initial = [refused], initialRuns: SourcedRun[] = []) {
  const accounts = fakeAccounts(initial);
  const openSetup = vi.fn();
  const openPlace = vi.fn();
  const openItem = vi.fn();
  const listeners = new Set<() => void>();
  const runs = {
    state: { runs: initialRuns },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    change(next: SourcedRun[]) {
      runs.state = { runs: next };
      for (const listener of listeners) listener();
    },
  };
  const badges = createBadgeRegistry();
  const services = new Map<unknown, unknown>([
    [GoogleSetupAccountsService, accounts.source],
    [InboxService, { openSetup }],
    [RunsListService, runs],
  ]);
  const context = {
    services: limitedLookup(googleSetupFeature, { get: (key) => services.get(key) }),
    announcer: {},
    badges,
    openPlace,
    openItem,
  } as unknown as WorkspaceContext;
  return { accounts, badges, openSetup, openPlace, openItem, runs, context };
}

const settle = () => act(async () => {});

verifies("google-setup.connector-badges", () => {
  it("shows a badge for a refused account, and Fix opens its setup item in the Inbox", async () => {
    const { badges, context, openSetup, openPlace } = setup();
    render(<ConnectorBadges context={context} />);
    await settle();
    const [badge] = badges.list();
    expect(badge?.label).toBe("Needs sign-in again");
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

  it("keeps what it shows and logs it when the list can't be read", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { accounts, badges, context } = setup();
    render(<ConnectorBadges context={context} />);
    await settle();
    accounts.source.list = async () => {
      throw new Error("The engine isn't answering.");
    };
    accounts.change([fine]);
    await settle();
    expect(badges.list()).toHaveLength(1);
    expect(error).toHaveBeenCalledTimes(1);
    error.mockRestore();
  });

  it("shows Gmail API off below the sign-in badge, and pressing it opens the failed run's page", async () => {
    const { badges, context, openItem } = setup([refused], [gmailOff]);
    render(<ConnectorBadges context={context} />);
    await settle();
    const [signIn, apiOff] = badges.list();
    expect(signIn?.label).toBe("Needs sign-in again");
    expect(apiOff?.label).toBe("Gmail API off");
    expect(apiOff?.tone).toBe("attention");
    expect(apiOff?.tooltip).toBe("Google's Gmail API is off in project halonic-x.");
    apiOff?.onSelect?.(null);
    expect(openItem).toHaveBeenCalledWith({ kind: "run", hub: "acme", id: "run_0" });
  });

  it("says Drive, and names no project when the cause gives none", async () => {
    const driveOff = run(0, {
      status: "failed",
      cause: {
        kind: "denied",
        code: "google.api-disabled",
        detail: { api: "drive.googleapis.com" },
      },
    });
    const { badges, context } = setup([fine], [driveOff]);
    render(<ConnectorBadges context={context} />);
    await settle();
    const [badge] = badges.list();
    expect(badge?.label).toBe("Drive API off");
    expect(badge?.tooltip).toBe("Google's Drive API is off in your Google project.");
  });

  it("goes when a later run of the same workflow ends without the cause, and not before", async () => {
    const { badges, context, runs } = setup([fine], [gmailOff]);
    render(<ConnectorBadges context={context} />);
    await settle();
    expect(badges.list()).toHaveLength(1);
    runs.change([run(5, { status: "running", endedAt: null }), gmailOff]);
    await settle();
    expect(badges.list()).toHaveLength(1);
    runs.change([run(5, {}), gmailOff]);
    await settle();
    expect(badges.list()).toHaveLength(0);
  });

  it("goes when the last Google account is removed", async () => {
    const { accounts, badges, context } = setup([fine], [gmailOff]);
    render(<ConnectorBadges context={context} />);
    await settle();
    expect(badges.list()).toHaveLength(1);
    accounts.change([]);
    await settle();
    expect(badges.list()).toHaveLength(0);
  });

  it("shows nothing for a failed run whose reason mentions an API but has no typed cause (A5)", async () => {
    const { badges, context } = setup(
      [fine],
      [run(0, { status: "failed", error: "Gmail API has not been used", reason: "unknown" })],
    );
    render(<ConnectorBadges context={context} />);
    await settle();
    expect(badges.list()).toHaveLength(0);
  });
});
