import { describe, expect, it } from "vitest";
import { account, atlas, ledger, record } from "./accounts.test-helper.ts";
import { setupEntry, utcTime } from "./setup-entry.ts";

const allSteps = ["project", "apis", "consent", "scopes", "client", "credentials", "sign-in"];
const fine = { result: { kind: "works" as const }, checkedAt: "2026-11-12T02:10:00.000Z" };

describe("setupEntry", () => {
  it("names the next step of a setup under way", () => {
    const entry = setupEntry(account(record(["project", "apis", "consent"])), utcTime);
    expect(entry).toMatchObject({
      account: "gaccount_1",
      title: "Set up Google for x@example.com",
      progress: "Step 4 of 7 · Scopes",
    });
  });

  it("starts at the project step of a setup not begun", () => {
    const entry = setupEntry(account(record([])), utcTime);
    expect(entry?.progress).toBe("Step 1 of 7 · Project");
  });

  it("says how many services failed their check once every step is done", () => {
    const failed = record(allSteps, {
      services: { ledger: { result: { kind: "unreachable" }, checkedAt: fine.checkedAt } },
    });
    expect(setupEntry(account(failed), utcTime)?.progress).toBe("Step 7 of 7 · 1 service to fix");
  });

  it("has no entry when everything works", () => {
    const done = record(allSteps, { services: { ledger: fine } });
    expect(setupEntry(account(done), utcTime)).toBeUndefined();
  });

  it("has no entry for an account without a service", () => {
    expect(setupEntry(account(record([]), { services: [] }), utcTime)).toBeUndefined();
  });

  it("asks you to sign in again, with the time and the routines on hold", () => {
    const refused = record(allSteps, {
      refreshRefused: { reason: "sign-in", at: "2026-11-12T02:10:00.000Z" },
    });
    expect(setupEntry(account(refused, { routinesOnHold: 2 }), utcTime)).toMatchObject({
      title: "Sign in to Google again for x@example.com",
      progress: "Needs sign-in since 02:10 · 2 routines on hold",
    });
    expect(setupEntry(account(refused), utcTime)?.progress).toBe("Needs sign-in since 02:10");
  });

  it("asks for a new sign-in too when the client is gone", () => {
    const gone = record(allSteps, {
      refreshRefused: { reason: "client-gone", at: "2026-11-12T02:10:00.000Z" },
    });
    expect(setupEntry(account(gone), utcTime)?.title).toBe(
      "Sign in to Google again for x@example.com",
    );
  });

  it("asks for a new client secret when the secret was refused", () => {
    const refused = record(allSteps, {
      refreshRefused: { reason: "client", at: "2026-11-12T02:10:00.000Z" },
    });
    expect(setupEntry(account(refused, { routinesOnHold: 1 }), utcTime)).toMatchObject({
      title: "Replace the Google client secret for x@example.com",
      progress: "Needs a new client secret · 1 routine on hold",
    });
  });

  it("offers the steps of a service added later", () => {
    const done = record(allSteps, { services: { ledger: fine } });
    expect(setupEntry(account(done, { adding: [atlas] }), utcTime)).toMatchObject({
      title: "Add Atlas to x@example.com",
      progress: "3 steps for Atlas",
    });
  });

  it("names every added service", () => {
    const done = record(allSteps, { services: { ledger: fine } });
    expect(setupEntry(account(done, { adding: [atlas, ledger] }), utcTime)?.title).toBe(
      "Add Atlas and Ledger to x@example.com",
    );
  });

  it("never puts the account's address in the entry's ref", () => {
    expect(setupEntry(account(record([])), utcTime)?.account).not.toContain("@");
  });
});
