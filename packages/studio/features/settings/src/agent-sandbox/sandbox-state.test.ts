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
    expect(v.secondary).toEqual(["check-again"]);
  });

  it("offers Remove under Needs setting up while a removal kept some access (HAL-15851)", () => {
    const check = { state: "needs-setup", accessKept: true } as const;
    const v = view({ check });
    expect(v.chip).toEqual({ label: "Needs setting up", tone: "warning" });
    expect(v.primary).toEqual({ action: "set-up", label: "Set up the sandbox", busy: false });
    expect(v.secondary).toEqual(["check-again", "remove"]);
    expect(view({ check, place: "served" }).secondary).toEqual(["check-again"]);
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
    expect(v.secondary).toEqual(["check-again", "remove"]);
  });

  it("says when it can't check, and offers Check again only", () => {
    const v = view({ check: { state: "unknown", reason: "the host didn't answer." } });
    expect(v.lead).toBe("Couldn't check the sandbox: the host didn't answer.");
    expect(v.secondary).toEqual(["check-again"]);
    expect(v.primary).toBeNull();
    expect(v.details).toBeNull();
  });

  it("puts an internal error's line in the warning Callout with Copy details (C446-2)", () => {
    const check = { state: "unknown", reason: "it broke.", details: "Error: boom" } as const;
    const v = view({ check });
    expect(v.callout).toEqual({
      line: "Couldn't check the sandbox: it broke.",
      action: "copy-details",
    });
    expect(v.lead).toBe("");
    expect(v.secondary).toEqual(["check-again"]);
    expect(v.details).toBe("Error: boom");
  });

  it("keeps a setup's Callout and puts Copy details next to Check again when the check also failed", () => {
    const check = { state: "unknown", reason: "it broke.", details: "Error: boom" } as const;
    const outcome = { kind: "setup", how: "check_failed", reason: "it was missing." } as const;
    const v = view({ check, outcome });
    expect(v.callout?.action).toBe("try-again");
    expect(v.lead).toBe("Couldn't check the sandbox: it broke.");
    expect(v.secondary).toEqual(["check-again", "copy-details"]);
  });

  it("words when it checked from the clock at drawing, not from when the check ran", () => {
    const checkedAt = new Date(2026, 10, 9, 9, 12).toISOString();
    const facts = { ...base, check: { state: "ready", checkedAt } } as const;
    expect(sandboxView(facts, new Date(2026, 10, 9, 23, 59)).lead).toBe("Checked today at 09:12");
    expect(sandboxView(facts, new Date(2026, 10, 10, 0, 1)).lead).toBe(
      "Checked yesterday at 09:12",
    );
  });

  it("says why the sandbox can't run and what fixes it, as words the section draws with Check again and the guide", () => {
    const v = view({ check: { state: "unavailable", code: "bubblewrap-missing" } });
    expect(v.chip).toEqual({ label: "Not available", tone: "attention" });
    expect(v.notAvailable).toEqual({
      reason: "bubblewrap isn't installed, and the sandbox needs it.",
      fix: "Install it, for example on Ubuntu or Debian with sudo apt install bubblewrap.",
      docs: {
        name: "How to install bubblewrap",
        href: "https://docs.halonic.dev/security/sandbox/#bubblewrap",
      },
      wayRound: "You can run an agent on this computer after a warning.",
    });
    // The words bring their own Check again, guide and way round (C701-1).
    expect(v.lead).toBe("");
    expect(v.secondary).toEqual([]);
    expect(v.primary).toBeNull();
    expect(v.hint).toBeNull();
  });

  it("words `other` and an unknown code from the catalogue, never the check's sentence", () => {
    for (const code of ["other", "from-the-future"]) {
      const v = view({ check: { state: "unavailable", code } });
      expect(v.notAvailable?.reason).toBe("Halonic can't tell what the sandbox is missing.");
      expect(v.notAvailable?.fix).toBe("See what the sandbox needs on this computer.");
      expect(v.notAvailable?.docs.name).toBe("What the sandbox needs");
    }
  });

  it("leaves the fix out where it is the section's own set-up button", () => {
    const v = view({ check: { state: "unavailable", code: "setup-needed" } });
    expect(v.notAvailable?.reason).toBe(
      "The sandbox's one-time setup isn't done for this version of Halonic.",
    );
    expect(v.notAvailable?.fix).toBeNull();
  });

  it("gives the WSL 2 fix for Halonic's Linux system, which the set-up button can't install", () => {
    const v = view({ check: { state: "unavailable", code: "distro-missing" } });
    expect(v.notAvailable?.reason).toBe(
      "WSL works, but Halonic's own Linux system for the sandbox isn't installed.",
    );
    expect(v.notAvailable?.fix).toBe("Use Halonic inside WSL 2 on this computer.");
  });

  it("says to remove another program's setup, then check again, for a setup conflict", () => {
    const v = view({ check: { state: "unavailable", code: "setup-conflict" } });
    expect(v.notAvailable?.fix).toBe(
      "Remove the other program's sandbox setup, then choose Check again.",
    );
  });

  it("keeps the fix for a reason the set-up button doesn't fix", () => {
    const v = view({ check: { state: "unavailable", code: "windows" } });
    expect(v.notAvailable?.fix).toBe("Pick another sandbox in Settings.");
  });

  it("gives served Studio the fix that says to do it on the computer", () => {
    const v = view({ check: { state: "unavailable", code: "ripgrep-missing" }, place: "served" });
    expect(v.notAvailable?.fix).toBe(
      "On the computer Halonic runs on: install it, for example on macOS with brew install ripgrep.",
    );
  });

  it("asks for a restart with Check again only, never Repair", () => {
    const v = view({ check: { state: "restart-needed" } });
    expect(v.chip).toEqual({ label: "Restart needed", tone: "attention" });
    expect(v.lead).toContain("Windows needs to restart");
    expect(v.primary).toBeNull();
    expect(v.secondary).toEqual(["check-again"]);
  });

  it("offers Check again in Needs setting up", () => {
    expect(view({}).secondary).toEqual(["check-again"]);
  });

  it("shows Not available and no button when the build has no sandbox", () => {
    const v = view({ available: false });
    expect(v.chip).toEqual({ label: "Not available", tone: "attention" });
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
        "The sandbox isn't set up: the setup didn't finish within 5 minutes.",
      );
      expect(callout({ kind: "setup", how: "timed-out", repairing: true })?.line).toBe(
        "The sandbox isn't repaired: the repair didn't finish within 5 minutes.",
      );
    });

    it("says an earlier setup or repair still running as a note, with Try again", () => {
      expect(callout({ kind: "setup", how: "still-running", repairing: false })).toEqual({
        line: "The earlier setup is still running. Wait a minute, then try again.",
        action: "try-again",
        note: true,
      });
      expect(callout({ kind: "setup", how: "still-running", repairing: true })?.line).toBe(
        "The earlier repair is still running. Wait a minute, then try again.",
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

    it("offers Copy details instead of Try again for an internal error", () => {
      const reason = "Halonic ran into a problem it can't explain yet.";
      const details = "Error: boom";
      expect(callout({ kind: "setup", how: "failed", reason, details })?.action).toBe(
        "copy-details",
      );
      expect(callout({ kind: "remove", how: "failed", reason, details })?.action).toBe(
        "copy-details",
      );
      expect(view({ outcome: { kind: "remove", how: "failed", reason, details } }).details).toBe(
        details,
      );
    });

    it("keeps Windows' message for Copy details when it couldn't start the helper", () => {
      const outcome = {
        kind: "setup",
        how: "failed",
        reason: "Windows couldn't start Halonic's sandbox helper.",
        details: "Access is denied. (os error 5)",
      } as const;
      expect(callout(outcome)).toMatchObject({
        line: "The sandbox isn't set up: Windows couldn't start Halonic's sandbox helper.",
        action: "copy-details",
      });
      expect(view({ outcome }).details).toBe("Access is denied. (os error 5)");
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

  it("times a setup out after 5 minutes", () => {
    expect(setupTimedOut(0, SETUP_TIME_LIMIT_MS - 1)).toBe(false);
    expect(setupTimedOut(0, SETUP_TIME_LIMIT_MS)).toBe(true);
    expect(SETUP_TIME_LIMIT_MS).toBe(5 * 60 * 1000);
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

verifies("settings.agent-sandbox-setup-again", () => {
  it("says the sandbox needs setting up again for a setup from an older release", () => {
    const v = view({ check: { state: "needs-setup", setupAgain: true } });
    expect(v.chip).toEqual({ label: "Needs setting up", tone: "warning" });
    expect(v.primary).toEqual({ action: "set-up", label: "Set up the sandbox", busy: false });
    expect(v.lead).toBe(
      "This version of Halonic needs the sandbox set up again, with administrator rights. Until then, agents set to run in a sandbox don't start.",
    );
    expect(v.hint).toBe("Windows asks for administrator rights once.");
  });

  it("keeps the one-time setup lead for a computer that was never set up", () => {
    const v = view({ check: { state: "needs-setup" } });
    expect(v.lead).toBe(
      "The sandbox needs a one-time setup with administrator rights. Until then, agents set to run in a sandbox don't start.",
    );
    expect(v.hint).toBe("Windows asks for administrator rights once.");
  });
});
