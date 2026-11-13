import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import {
  afterResult,
  type SandboxFacts,
  SETUP_TIME_LIMIT_MS,
  sandboxView,
  setupTimedOut,
} from "./sandbox-state.ts";

const base: SandboxFacts = {
  available: true,
  place: "app",
  check: { state: "needs-setup" },
  running: null,
  outcome: null,
};
const view = (over: Partial<SandboxFacts>) =>
  sandboxView({ ...base, ...over }, new Date(2026, 10, 9, 12, 0));

verifies("settings.agent-sandbox-state", () => {
  it("shows Needs setting up with the button and the one-prompt hint", () => {
    const v = view({});
    expect(v.chip).toEqual({ label: "Needs setting up", tone: "warning" });
    expect(v.primary).toEqual({ action: "set-up", label: "Set up the sandbox", busy: false });
    expect(v.hint).toBe("Windows asks for administrator rights once.");
  });

  it("shows Ready with Check again and Remove", () => {
    const v = view({
      check: { state: "ready", checkedAt: new Date(2026, 10, 9, 9, 12).toISOString() },
    });
    expect(v.chip).toEqual({ label: "Ready", tone: "success" });
    expect(v.lead).toBe("Checked today at 09:12");
    expect(v.secondary).toEqual(["check-again", "remove"]);
    expect(v.primary).toBeNull();
  });

  it("shows Needs repair with Repair the sandbox", () => {
    const v = view({
      check: { state: "needs-repair", reason: "its firewall filters are missing." },
    });
    expect(v.chip?.label).toBe("Needs repair");
    expect(v.lead).toContain(
      "part of it is missing or out of date: its firewall filters are missing.",
    );
    expect(v.primary?.label).toBe("Repair the sandbox");
    expect(v.secondary).toEqual(["remove"]);
  });

  it("says when it can't check, and offers Check again only", () => {
    const v = view({ check: { state: "unknown", reason: "the host didn't answer." } });
    expect(v.lead).toBe("Couldn't check the sandbox: the host didn't answer.");
    expect(v.secondary).toEqual(["check-again"]);
    expect(v.primary).toBeNull();
  });

  it("words when it checked from the clock at drawing, not from when the check ran", () => {
    const checkedAt = new Date(2026, 10, 9, 9, 12).toISOString();
    const facts = { ...base, check: { state: "ready", checkedAt } } as const;
    expect(sandboxView(facts, new Date(2026, 10, 9, 23, 59)).lead).toBe("Checked today at 09:12");
    expect(sandboxView(facts, new Date(2026, 10, 10, 0, 1)).lead).toBe(
      "Checked yesterday at 09:12",
    );
  });

  it("says why the sandbox can't run when the check ran, and offers Check again only", () => {
    const v = view({ check: { state: "unavailable", reason: "hardware virtualisation is off." } });
    expect(v.lead).toBe("The sandbox isn't ready: hardware virtualisation is off.");
    expect(v.secondary).toEqual(["check-again"]);
    expect(v.primary).toBeNull();
  });

  it("asks for a restart with Check again only, never Repair", () => {
    const v = view({ check: { state: "restart-needed" } });
    expect(v.chip).toEqual({ label: "Restart needed", tone: "warning" });
    expect(v.lead).toContain("Windows needs to restart");
    expect(v.primary).toBeNull();
    expect(v.secondary).toEqual(["check-again"]);
  });

  it("shows Not available and no button when the build has no sandbox", () => {
    const v = view({ available: false });
    expect(v.chip?.label).toBe("Not available");
    expect(v.primary).toBeNull();
    expect(v.secondary).toEqual([]);
  });

  describe("while it runs", () => {
    it("shows the busy button and the waiting-for-Windows step", () => {
      const v = view({ running: { verb: "setup", step: "elevating" } });
      expect(v.chip).toEqual({ label: "Setting up", tone: "neutral" });
      expect(v.primary).toEqual({ action: "set-up", label: "Setting up…", busy: true });
      expect(v.steps.map((s) => s.mark)).toEqual(["doing", "waiting"]);
      expect(v.steps[0]?.note).toContain("Check the taskbar");
      expect(v.secondary).toEqual([]);
    });

    it("moves on to the check", () => {
      const v = view({ running: { verb: "setup", step: "checking" } });
      expect(v.steps.map((s) => s.mark)).toEqual(["done", "doing"]);
      expect(v.steps[0]?.label).toBe("Set up the agent sandbox");
    });

    it("says Repairing for a repair", () => {
      const v = view({ running: { verb: "repair", step: "elevating" } });
      expect(v.primary?.label).toBe("Repairing…");
    });
  });

  describe("the failure Callouts", () => {
    const callout = (outcome: SandboxFacts["outcome"]) => view({ outcome }).callout;

    it("names a refused prompt", () => {
      expect(callout({ kind: "setup", how: "cancelled" })).toEqual({
        line: "The sandbox isn't set up: Windows didn't give Halonic administrator rights. If you don't have an administrator password, ask whoever manages this computer.",
        action: "try-again",
      });
    });

    it("gives the reason as a sentence", () => {
      expect(
        callout({
          kind: "setup",
          how: "failed",
          reason: "Windows didn't accept the sandbox's network rules.",
        }),
      ).toEqual({
        line: "The sandbox isn't set up: Windows didn't accept the sandbox's network rules.",
        action: "try-again",
      });
    });

    it("says the time-out", () => {
      expect(callout({ kind: "setup", how: "timed-out", repairing: false })?.line).toBe(
        "The sandbox isn't set up: the setup didn't finish within 3 minutes.",
      );
      expect(callout({ kind: "setup", how: "timed-out", repairing: true })?.line).toBe(
        "The sandbox isn't repaired: the repair didn't finish within 3 minutes.",
      );
    });

    it("says a failed check", () => {
      expect(callout({ kind: "setup", how: "check_failed", reason: "no account." })?.line).toBe(
        "The sandbox was set up, but didn't pass its check: no account.",
      );
    });

    it("refuses a removal while runs use the sandbox, with the count", () => {
      expect(callout({ kind: "remove", how: "in-use", runs: 1 })).toEqual({
        line: "The sandbox wasn't removed: 1 run is using it. Stop it or let it finish, then try again.",
        action: null,
      });
      expect(callout({ kind: "remove", how: "in-use", runs: 3 })?.line).toBe(
        "The sandbox wasn't removed: 3 runs are using it. Stop them or let them finish, then try again.",
      );
    });

    it("says a refused or failed removal with no Try again", () => {
      expect(callout({ kind: "remove", how: "cancelled" })?.action).toBeNull();
      expect(callout({ kind: "remove", how: "failed", reason: "Windows said no." })?.line).toBe(
        "The sandbox wasn't removed: Windows said no.",
      );
    });
  });

  it("only looks in served Studio", () => {
    const needs = view({ place: "served" });
    expect(needs.primary).toBeNull();
    expect(needs.hint).toBe("View only here. Set up the sandbox on the computer running Halonic.");
    expect(needs.secondary).toEqual(["check-again"]);
    const ready = view({
      place: "served",
      check: { state: "ready", checkedAt: "2026-11-09T09:12:00" },
    });
    expect(ready.secondary).toEqual(["check-again"]);
  });

  it("times a setup out after 3 minutes", () => {
    expect(setupTimedOut(0, SETUP_TIME_LIMIT_MS - 1)).toBe(false);
    expect(setupTimedOut(0, SETUP_TIME_LIMIT_MS)).toBe(true);
  });

  it("turns a failed check into Needs repair, and leaves other failures alone", () => {
    expect(
      afterResult({ kind: "setup", how: "check_failed", reason: "x." }, { state: "needs-setup" }),
    ).toEqual({
      state: "needs-repair",
      reason: "x.",
    });
    expect(afterResult({ kind: "setup", how: "cancelled" }, { state: "needs-setup" })).toEqual({
      state: "needs-setup",
    });
  });
});
