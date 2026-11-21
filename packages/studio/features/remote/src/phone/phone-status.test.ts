import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { type PhoneState, PhoneStatusTracker, phoneStatusLabel } from "./phone-status.ts";

const computer = "Tim's laptop";

/** A tracker that has already shown `first`. */
function trackerAt(first: PhoneState): PhoneStatusTracker {
  const tracker = new PhoneStatusTracker(computer);
  tracker.change(first, 0);
  return tracker;
}

verifies("remote.phone-status", () => {
  describe("the header label", () => {
    it.each([
      ["connected", "Connected · Tim's laptop", "success", "Connected to Tim's laptop. Details"],
      ["reconnecting", "Reconnecting…", "waiting", "Reconnecting. Details"],
      [
        "unreachable",
        "Can't reach your computer",
        "attention",
        "Can't reach your computer. Details",
      ],
      ["phoneOffline", "Your phone is offline", "attention", "Your phone is offline. Details"],
      ["removed", "Removed from this computer", "danger", "Removed from this computer. Details"],
      [
        "cantConfirm",
        "Can't confirm your computer",
        "danger",
        "Can't confirm your computer. Details",
      ],
    ] as const)("shows %s in words", (state, text, tone, name) => {
      expect(phoneStatusLabel(state, computer)).toMatchObject({ text, tone, name });
    });
  });

  describe("what the phone says", () => {
    it("says nothing for the first state", () => {
      const tracker = new PhoneStatusTracker(computer);
      expect(tracker.change("connected", 0)).toEqual({ shown: "connected" });
      expect(new PhoneStatusTracker(computer).change("unreachable", 0)).toEqual({
        shown: "unreachable",
      });
    });

    it("says nothing for a reconnect shorter than 2 seconds, either way", () => {
      const tracker = trackerAt("connected");
      expect(tracker.change("reconnecting", 1000)).toEqual({ shown: "reconnecting" });
      expect(tracker.tick(2999)).toBeUndefined();
      expect(tracker.change("connected", 2999)).toEqual({ shown: "connected" });
      expect(tracker.tick(10_000)).toBeUndefined();
    });

    it("says Reconnecting once after 2 seconds, then Connected when it's back", () => {
      const tracker = trackerAt("connected");
      tracker.change("reconnecting", 1000);
      expect(tracker.tick(3000)).toBe("Reconnecting");
      expect(tracker.tick(4000)).toBeUndefined();
      expect(tracker.change("connected", 5000)).toEqual({
        shown: "connected",
        announce: "Connected to Tim's laptop",
      });
    });

    it("keeps Can't reach and offline on the label while it tries again, and says nothing", () => {
      for (const state of ["unreachable", "phoneOffline"] as const) {
        const tracker = trackerAt("connected");
        expect(tracker.change(state, 1000).announce).toBe(phoneStatusLabel(state, computer).said);
        expect(tracker.change("reconnecting", 2000)).toEqual({ shown: state });
        expect(tracker.tick(10_000)).toBeUndefined();
        expect(tracker.change(state, 11_000)).toEqual({ shown: state });
        expect(tracker.state).toBe(state);
      }
    });

    it("says each trouble state at once with the label's words", () => {
      const tracker = trackerAt("connected");
      expect(tracker.change("unreachable", 1).announce).toBe("Can't reach your computer");
      expect(tracker.change("phoneOffline", 2).announce).toBe("Your phone is offline");
      expect(tracker.change("removed", 3).announce).toBe("Removed from this computer");
      expect(trackerAt("connected").change("cantConfirm", 1).announce).toBe(
        "Can't confirm your computer",
      );
    });

    it("says Connected after a trouble state it said, but not after one it didn't", () => {
      const said = trackerAt("connected");
      said.change("unreachable", 1);
      expect(said.change("connected", 2).announce).toBe("Connected to Tim's laptop");

      const opened = trackerAt("unreachable");
      expect(opened.change("connected", 2).announce).toBeUndefined();
    });
  });
});
