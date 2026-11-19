import { tunnelReasons } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { reasonWords, tunnelProblem, tunnelState } from "./tunnel-words.ts";

const at = "2026-11-19T10:00:00.000Z";

verifies("remote.tunnel-reasons", () => {
  it("words each reason as the design's table does", () => {
    const table = tunnelReasons.map((reason) => {
      const words = reasonWords(reason, "tailscale");
      return [reason, words.title, words.actions.map((action) => action.label).join(" · ")];
    });

    expect(table).toEqual([
      ["not-installed", "Tailscale isn't installed", "Open Tailscale setup · Check again"],
      ["signed-out", "Tailscale is signed out", "Open Tailscale · Check again"],
      ["offline", "This computer is offline", ""],
      ["provider-error", "Tailscale reported a problem", "Check again"],
      ["public-refused", "Tailscale Funnel is on", "Open Tailscale · Check again"],
      ["stopped", "Remote is off", ""],
    ]);
    expect(reasonWords("signed-out", "tailscale").line).toBe(
      "Phones can't reach this computer until you sign in again. Your agents keep running.",
    );
    expect(reasonWords("public-refused", "tailscale").line).toBe(
      "Funnel would put Halonic's remote port on the public internet, so Halonic refuses to use it. Turn Funnel off in Tailscale.",
    );
  });

  it("shows no problem while the tunnel starts, is ready or is stopped", () => {
    expect(tunnelProblem({ state: "starting", at }, "tailscale")).toBeUndefined();
    expect(tunnelProblem({ state: "ready", at }, "tailscale")).toBeUndefined();
    expect(tunnelProblem({ state: "down", reason: "stopped", at }, "tailscale")).toBeUndefined();
    expect(
      tunnelProblem({ state: "degraded", reason: "provider-error", at }, "tailscale")?.title,
    ).toBe("Tailscale reported a problem");
  });

  it("names the state in a word for the Connection line", () => {
    expect(tunnelState({ state: "ready", at }, "tailscale")).toBe("Ready");
    expect(tunnelState({ state: "starting", at }, "tailscale")).toBe("Starting…");
    expect(tunnelState({ state: "down", reason: "signed-out", at }, "tailscale")).toBe(
      "Signed out",
    );
    expect(tunnelState({ state: "down", reason: "public-refused", at }, "fake")).toBe("Funnel on");
  });
});
