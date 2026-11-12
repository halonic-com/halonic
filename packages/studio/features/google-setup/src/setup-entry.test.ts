import { clockTime } from "@halonicjs/studio-feature-inbox/api";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { account, atlas, ledger, record } from "./accounts.test-helper.ts";
import { setupEntry } from "./setup-entry.ts";

const allSteps = ["project", "apis", "consent", "scopes", "client", "credentials", "sign-in"];
// Local times, so the tests read the same in every time zone.
const now = new Date(2026, 10, 12, 15, 30);
const refusedAt = (daysAgo: number) =>
  record(allSteps, {
    refreshRefused: {
      reason: "sign-in",
      at: new Date(2026, 10, 12 - daysAgo, 2, 10).toISOString(),
    },
  });
const fine = { result: { kind: "works" as const }, checkedAt: "2026-11-12T02:10:00.000Z" };

verifies("google-setup.setup-source", () => {
  it("names the next step of a setup under way", () => {
    const entry = setupEntry(account(record(["project", "apis", "consent"])), clockTime, now);
    expect(entry).toMatchObject({
      account: "gaccount_1",
      title: "Set up Google for x@example.com",
      progress: "Step 4 of 7 · Scopes",
    });
  });

  it("starts at the project step of a setup not begun", () => {
    const entry = setupEntry(account(record([])), clockTime, now);
    expect(entry?.progress).toBe("Step 1 of 7 · Project");
  });

  it("says how many services failed their check once every step is done", () => {
    const failed = record(allSteps, {
      services: { ledger: { result: { kind: "unreachable" }, checkedAt: fine.checkedAt } },
    });
    expect(setupEntry(account(failed), clockTime, now)?.progress).toBe(
      "Step 7 of 7 · 1 service to fix",
    );
  });

  it("ignores a failed check of a service that is no longer listed", () => {
    const stale = record(allSteps, {
      services: { atlas: { result: { kind: "unreachable" }, checkedAt: fine.checkedAt } },
    });
    expect(setupEntry(account(stale), clockTime, now)).toBeUndefined();
  });

  it("has no entry when everything works", () => {
    const done = record(allSteps, { services: { ledger: fine } });
    expect(setupEntry(account(done), clockTime, now)).toBeUndefined();
  });

  it("has no entry for an account without a service", () => {
    expect(setupEntry(account(record([]), { services: [] }), clockTime, now)).toBeUndefined();
  });

  it("asks you to sign in again, with the time and the routines on hold", () => {
    const refused = refusedAt(0);
    expect(setupEntry(account(refused, { routinesOnHold: 2 }), clockTime, now)).toMatchObject({
      title: "Sign in to Google again for x@example.com",
      progress: "Needs sign-in since 02:10 · 2 routines on hold",
    });
    expect(setupEntry(account(refused), clockTime, now)?.progress).toBe(
      "Needs sign-in since 02:10",
    );
  });

  it("says the day of a sign-in refused earlier this week, as the Inbox does", () => {
    expect(setupEntry(account(refusedAt(0)), clockTime, now)?.progress).toBe(
      "Needs sign-in since 02:10",
    );
    expect(setupEntry(account(refusedAt(3)), clockTime, now)?.progress).toBe(
      "Needs sign-in since Mon 02:10",
    );
  });

  it("switches to the date once the refusal is 6 days old", () => {
    expect(setupEntry(account(refusedAt(5)), clockTime, now)?.progress).toBe(
      "Needs sign-in since Sat 02:10",
    );
    expect(setupEntry(account(refusedAt(6)), clockTime, now)?.progress).toBe(
      "Needs sign-in since Fri 6 Nov, 02:10",
    );
  });

  it("says the date of a sign-in refused 9 days ago", () => {
    expect(setupEntry(account(refusedAt(9)), clockTime, now)?.progress).toBe(
      "Needs sign-in since Tue 3 Nov, 02:10",
    );
  });

  it("asks for a new sign-in too when the client is gone", () => {
    const gone = record(allSteps, {
      refreshRefused: { reason: "client-gone", at: "2026-11-12T02:10:00.000Z" },
    });
    expect(setupEntry(account(gone), clockTime, now)?.title).toBe(
      "Sign in to Google again for x@example.com",
    );
  });

  it("asks for a new client secret when the secret was refused", () => {
    const refused = record(allSteps, {
      refreshRefused: { reason: "client", at: "2026-11-12T02:10:00.000Z" },
    });
    expect(setupEntry(account(refused, { routinesOnHold: 1 }), clockTime, now)).toMatchObject({
      title: "Replace the Google client secret for x@example.com",
      progress: "Needs a new client secret · 1 routine on hold",
    });
  });

  it("offers the steps of a service added later", () => {
    const done = record(allSteps, { services: { ledger: fine } });
    expect(setupEntry(account(done, { adding: [atlas] }), clockTime, now)).toMatchObject({
      title: "Add Atlas to x@example.com",
      progress: "3 steps for Atlas",
    });
  });

  it("names every added service", () => {
    const done = record(allSteps, { services: { ledger: fine } });
    expect(setupEntry(account(done, { adding: [atlas, ledger] }), clockTime, now)?.title).toBe(
      "Add Atlas and Ledger to x@example.com",
    );
  });

  it("never puts the account's address in the entry's ref", () => {
    expect(setupEntry(account(record([])), clockTime, now)?.account).not.toContain("@");
  });
});
