// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { account, record } from "../accounts.test-helper.ts";
import { connectorBadge } from "../connector-badges.ts";
import { setupEntry } from "../setup-entry.ts";
import {
  button,
  driveClock,
  open,
  press,
  ready,
  upToSignIn,
} from "../sign-in-view.test-helper.tsx";
import { unmountAll } from "../test-support/render.tsx";

// Local times, so the words match whatever zone the tests run in.
const signedIn = new Date(2026, 10, 8, 10, 42);
const dayAfter = new Date(2026, 10, 9, 9, 0);
const reminderTime = new Date(2026, 10, 14, 11, 0);

const testingApp = { publishing: "testing", testUserTickedAt: null, sharedApp: false } as const;

/** A personal app in *Testing*, signed in at 8 Nov 10:42, with Ledger working. */
function personalInTesting(extra: Parameters<typeof record>[1] = {}) {
  const at = signedIn.toISOString();
  return account(
    record(upToSignIn, {
      ...ready,
      inProductionTickedAt: null,
      personalApp: testingApp,
      lastSignInAt: at,
      stepsDone: Object.fromEntries([...upToSignIn, "sign-in"].map((id) => [id, at])),
      services: { ledger: { result: { kind: "works" }, checkedAt: at } },
      ...extra,
    }),
  );
}

function workspace() {
  return personalInTesting({ accountType: "workspace", personalApp: null });
}

/** A stand-in for the Inbox's time format; the reminder line doesn't use it. */
const inboxTime = (at: Date) => at.toISOString();

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
  driveClock((ms) => vi.advanceTimersByTimeAsync(ms));
});
afterEach(() => {
  unmountAll();
  vi.useRealTimers();
});

verifies("google-setup.weekly-reminder", () => {
  describe("step 7 after a sign-in", () => {
    it("shows the date Google ends the sign-in of a personal Testing app, and the reminder day", async () => {
      vi.setSystemTime(dayAfter);
      const { container } = await open(personalInTesting());
      expect(container.textContent).toContain("Google ends this sign-in on 15 Nov at 10:42.");
      expect(container.textContent).toContain(
        "Google is set up for x@example.com. Ledger works. Studio reminds you on 14 Nov to sign in again.",
      );
    });

    it("shows no end date for a Workspace account", async () => {
      vi.setSystemTime(dayAfter);
      const { container } = await open(workspace());
      expect(container.textContent).toContain("Google is set up for x@example.com. Ledger works.");
      expect(container.textContent).not.toContain("Google ends this sign-in");
      expect(container.textContent).not.toContain("Studio reminds you");
    });

    it("shows no end date for an app In production", async () => {
      vi.setSystemTime(dayAfter);
      const published = { ...testingApp, publishing: "production" } as const;
      const { container } = await open(personalInTesting({ personalApp: published }));
      expect(container.textContent).not.toContain("Google ends this sign-in");
    });
  });

  describe("a day before the sign-in ends", () => {
    it("gives the connector chip Sign-in ends soon, and none to a Workspace account", () => {
      expect(connectorBadge(personalInTesting(), vi.fn(), reminderTime)?.label).toBe(
        "Sign-in ends soon",
      );
      expect(connectorBadge(personalInTesting(), vi.fn(), dayAfter)).toBeUndefined();
      expect(connectorBadge(workspace(), vi.fn(), reminderTime)).toBeUndefined();
    });

    it("brings the item back to the Inbox as Sign in again, with the end date", () => {
      expect(setupEntry(personalInTesting(), inboxTime, reminderTime)).toMatchObject({
        title: "Sign in again for x@example.com",
        progress: "Google ends the sign-in on 15 Nov, 10:42",
      });
      expect(setupEntry(personalInTesting(), inboxTime, dayAfter)).toBeUndefined();
      expect(setupEntry(workspace(), inboxTime, reminderTime)).toBeUndefined();
    });

    it("opens the item at step 7 with the reminder and Sign in with Google", async () => {
      vi.setSystemTime(reminderTime);
      const { container } = await open(personalInTesting());
      expect(container.textContent).toContain(
        "Google ends this sign-in on 15 Nov at 10:42, because your app is in Testing. Sign in again now, and workflows that use Ledger keep running.",
      );
      // A personal app in Testing has six steps, so signing in is step 6; every other is folded.
      const opened = [...container.querySelectorAll("li")].filter((step) =>
        step.textContent?.includes("Not now"),
      );
      expect(opened.map((step) => step.textContent)).toEqual([
        expect.stringContaining("Step 6 of 6"),
      ]);
      expect(button(container, "Sign in with Google")).toBeDefined();
    });

    it("keeps the reminder out of the Inbox for this sign-in once closed with Not now", async () => {
      vi.setSystemTime(reminderTime);
      const { fake, container } = await open(personalInTesting());
      await press(button(container, "Not now"));
      expect(fake.edits).toContainEqual({
        accountRef: "gaccount_1",
        edit: { kind: "reminder-closed" },
      });

      const closed = personalInTesting({ reminderClosedAt: reminderTime.toISOString() });
      expect(setupEntry(closed, inboxTime, reminderTime)).toBeUndefined();
      // The chip stays until the user signs in again or the sign-in ends.
      expect(connectorBadge(closed, vi.fn(), reminderTime)?.label).toBe("Sign-in ends soon");
    });
  });
});
