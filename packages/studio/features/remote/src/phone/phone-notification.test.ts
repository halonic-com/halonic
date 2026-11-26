import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { phoneNotificationOf } from "./phone-notification.ts";

const asks = { text: "Chief asks you: Ship phase 2 now?", source: "Paperclip · Halonic" };
const finished = { text: "Chief finished what you asked" };

verifies("remote.phone-notification-lock-screen", () => {
  it("shows only the p06c line on the lock screen, and the item once unlocked", () => {
    expect(phoneNotificationOf("Tim's laptop", asks)).toEqual({
      lockScreen: { title: "Something needs you on Tim's laptop" },
      unlocked: { title: "Chief asks you: Ship phase 2 now?", body: "Paperclip · Halonic" },
    });
  });

  it("keeps the lock screen the same line whatever the item says", () => {
    const first = phoneNotificationOf("Tim's laptop", asks);
    const second = phoneNotificationOf("Tim's laptop", finished);
    expect(second.lockScreen).toEqual(first.lockScreen);
    const lockScreen = JSON.stringify(first.lockScreen);
    for (const word of ["Chief", "Ship", "Paperclip"]) {
      expect(lockScreen).not.toContain(word);
    }
    expect(second.unlocked).toEqual({ title: "Chief finished what you asked" });
  });
});
