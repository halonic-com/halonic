import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { type PhoneStatus, phoneStatusLabelState } from "./phone-tunnel.ts";

verifies("remote.phone-tunnel-status", () => {
  it("says offline only when the phone's own network is down", () => {
    expect(phoneStatusLabelState({ state: "reconnecting", lastTry: "network-down" })).toBe(
      "phoneOffline",
    );
    for (const lastTry of ["timeout", "refused", "unreachable"] as const) {
      expect(phoneStatusLabelState({ state: "reconnecting", lastTry })).toBe("unreachable");
    }
  });

  it("reads connecting and a first retry as Reconnecting", () => {
    expect(phoneStatusLabelState({ state: "connecting" })).toBe("reconnecting");
    expect(
      phoneStatusLabelState({ state: "reconnecting", nextTryAt: "2026-11-14T14:02:05Z" }),
    ).toBe("reconnecting");
  });

  it("maps the remaining states, keeping the label while paused and dropping it when closed", () => {
    const cases: readonly [PhoneStatus, string][] = [
      [{ state: "connected" }, "connected"],
      [{ state: "removed" }, "removed"],
      [{ state: "cant-confirm" }, "cantConfirm"],
      [{ state: "paused" }, "keep"],
      [{ state: "closed" }, "none"],
    ];
    for (const [status, shown] of cases) expect(phoneStatusLabelState(status)).toBe(shown);
  });
});
