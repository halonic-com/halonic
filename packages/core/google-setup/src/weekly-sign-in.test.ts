import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { editedValues } from "./setup-edit.ts";
import type { SetupValues } from "./setup-record.ts";
import { isReminderDue, signInEndsSoon, weeklySignIn } from "./weekly-sign-in.ts";

type WeeklyRecord = Pick<
  SetupValues,
  | "accountType"
  | "inProductionTickedAt"
  | "personalApp"
  | "lastSignInAt"
  | "refreshRefused"
  | "reminderClosedAt"
>;

const signedIn = "2026-11-08T10:42:00.000Z";
const minute = 60 * 1000;

/** A personal account's app in *Testing*, signed in at 8 Nov 10:42. */
const testing: WeeklyRecord = {
  accountType: "personal",
  inProductionTickedAt: null,
  personalApp: { publishing: "testing", testUserTickedAt: signedIn, sharedApp: false },
  lastSignInAt: signedIn,
  refreshRefused: null,
  reminderClosedAt: null,
};

const published: WeeklyRecord = {
  ...testing,
  personalApp: { publishing: "production", testUserTickedAt: null, sharedApp: false },
};

const workspace: WeeklyRecord = { ...testing, accountType: "workspace", personalApp: null };

function at(iso: string): Date {
  return new Date(iso);
}

verifies("google-setup.weekly-sign-in", () => {
  describe("a personal app in Testing signed in at 8 Nov 10:42", () => {
    it("ends on 15 Nov at 10:42 and is reminded of from 14 Nov at 10:42", () => {
      expect(weeklySignIn(testing)).toEqual({
        endsAt: at("2026-11-15T10:42:00.000Z"),
        remindFrom: at("2026-11-14T10:42:00.000Z"),
      });
    });

    it("ends soon from 14 Nov 10:42 until the sign-in ends, and not a minute before", () => {
      const endsSoon = (iso: string) => signInEndsSoon(testing, at(iso));

      expect(endsSoon("2026-11-14T10:41:00.000Z")).toBe(false);
      expect(endsSoon("2026-11-14T10:42:00.000Z")).toBe(true);
      expect(endsSoon("2026-11-15T10:41:00.000Z")).toBe(true);
      expect(endsSoon("2026-11-15T10:42:00.000Z")).toBe(false);
    });

    it("doesn't end soon once Google refused the refresh: that state says more", () => {
      const refused = { ...testing, refreshRefused: { reason: "sign-in", at: signedIn } } as const;

      expect(signInEndsSoon(refused, at("2026-11-14T12:00:00.000Z"))).toBe(false);
    });
  });

  it("never ends soon and has no end date for an app In production or a Workspace account", () => {
    for (const record of [published, workspace]) {
      expect(weeklySignIn(record)).toBeNull();
      for (let hours = 0; hours <= 10 * 24; hours += 6) {
        const now = new Date(Date.parse(signedIn) + hours * 60 * minute);
        expect(signInEndsSoon(record, now)).toBe(false);
      }
    }
  });

  it("has no end date before the first sign-in", () => {
    expect(weeklySignIn({ ...testing, lastSignInAt: null })).toBeNull();
  });

  it("reads a personal record from before HAL-18663 with no In production tick as Testing", () => {
    expect(weeklySignIn({ ...testing, personalApp: null })).not.toBeNull();
    expect(
      weeklySignIn({ ...testing, personalApp: null, inProductionTickedAt: signedIn }),
    ).toBeNull();
  });

  describe("the reminder in the Inbox", () => {
    const reminderTime = at("2026-11-14T11:00:00.000Z");

    it("is due while the sign-in ends soon", () => {
      expect(isReminderDue(testing, reminderTime)).toBe(true);
      expect(isReminderDue(testing, at("2026-11-13T11:00:00.000Z"))).toBe(false);
    });

    it("doesn't come back for that sign-in once closed with Not now", () => {
      const closed = {
        ...testing,
        ...editedValues(
          testing as SetupValues,
          { kind: "reminder-closed" },
          reminderTime.toISOString(),
        ),
      };

      expect(closed.reminderClosedAt).toBe("2026-11-14T11:00:00.000Z");
      expect(isReminderDue(closed, at("2026-11-15T09:00:00.000Z"))).toBe(false);
    });

    it("comes back a week after the next sign-in, which starts a new 7 days", () => {
      const closed = { ...testing, reminderClosedAt: "2026-11-14T11:00:00.000Z" };
      const signedInAgain = {
        ...closed,
        ...editedValues(closed as SetupValues, { kind: "signed-in" }, "2026-11-14T12:00:00.000Z"),
      };

      expect(weeklySignIn(signedInAgain)?.endsAt).toEqual(at("2026-11-21T12:00:00.000Z"));
      expect(isReminderDue(signedInAgain, at("2026-11-15T09:00:00.000Z"))).toBe(false);
      expect(isReminderDue(signedInAgain, at("2026-11-20T12:00:00.000Z"))).toBe(true);
    });
  });
});
