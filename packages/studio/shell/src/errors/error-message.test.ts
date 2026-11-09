import { KindedError } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { errorMessageFor } from "./error-message.ts";

const title = "Couldn't save Support reply.";

verifies("shell.error-messages", () => {
  it("keeps the screen's own title for every kind", () => {
    expect(errorMessageFor(new KindedError("denied", "No."), { title }).title).toBe(title);
    expect(errorMessageFor(new Error("boom"), { title }).title).toBe(title);
  });

  it("shows an invalid_input error's message, with no action", () => {
    const error = new KindedError("invalid_input", "Enter a whole number from 1 to 64.");
    expect(errorMessageFor(error, { title })).toEqual({
      kind: "invalid_input",
      title,
      body: "Enter a whole number from 1 to 64.",
    });
  });

  describe("not_found", () => {
    const error = new KindedError("not_found", "There is no agent named Sorter.");

    it("names the missing item's kind and offers its list", () => {
      const message = errorMessageFor(error, {
        title,
        item: { kindName: "agent", place: "Agents" },
      });
      expect(message.body).toBe("This agent isn't in this workspace any more.");
      expect(message.action).toEqual({ id: "go-to", label: "Go to Agents", place: "Agents" });
    });

    it("falls back to the error's message when the screen doesn't name the item", () => {
      expect(errorMessageFor(error, { title })).toEqual({
        kind: "not_found",
        title,
        body: error.message,
      });
    });
  });

  describe("conflict", () => {
    const loadLatest = { id: "load-latest", label: "Load the latest" };

    it("shows the error's message and offers Load the latest", () => {
      const message = errorMessageFor(new KindedError("conflict", "The run changed."), { title });
      expect(message).toEqual({
        kind: "conflict",
        title,
        body: "The run changed.",
        action: loadLatest,
      });
    });

    it("says it was changed elsewhere when the error has no message", () => {
      const message = errorMessageFor(new KindedError("conflict", ""), { title });
      expect(message.body).toBe("It was changed somewhere else since you opened it.");
      expect(message.action).toEqual(loadLatest);
    });

    it("doesn't offer Load the latest while the item has unsaved edits (FR6)", () => {
      const message = errorMessageFor(new KindedError("conflict", "The run changed."), {
        title,
        hasUnsavedEdits: true,
      });
      expect(message.action).toBeUndefined();
      expect(
        errorMessageFor(new KindedError("conflict", ""), { title, hasUnsavedEdits: false }).action,
      ).toEqual(loadLatest);
    });
  });

  describe("unauthenticated", () => {
    const error = new KindedError("unauthenticated", "The sign-in expired.");

    it("names the signed-out service and offers its sign-in", () => {
      const message = errorMessageFor(error, {
        title,
        service: { name: "Gmail (fin@acme.example)", signIn: "Sign in with Google" },
      });
      expect(message.body).toBe("Gmail (fin@acme.example) is signed out.");
      expect(message.action).toEqual({ id: "sign-in", label: "Sign in with Google" });
    });

    it("has no action for a service without a sign-in", () => {
      expect(
        errorMessageFor(error, { title, service: { name: "Acme CRM" } }).action,
      ).toBeUndefined();
    });

    it("tells a served Studio's user they were logged out", () => {
      const message = errorMessageFor(error, { title, served: true });
      expect(message.body).toBe("You've been logged out of this Studio.");
      expect(message.action).toEqual({ id: "log-in", label: "Log in" });
    });

    it("falls back to the error's message", () => {
      expect(errorMessageFor(error, { title })).toEqual({
        kind: "unauthenticated",
        title,
        body: error.message,
      });
    });
  });

  describe("denied", () => {
    const error = new KindedError(
      "denied",
      "Acme is local only, so Halonic sent nothing to OpenAI.",
    );

    it("shows the message that names the rule", () => {
      expect(errorMessageFor(error, { title })).toEqual({
        kind: "denied",
        title,
        body: error.message,
      });
    });

    it.each([
      ["trust", "Open trust"],
      ["connector", "Open connector"],
    ] as const)("opens the %s where the rule is set", (rule, label) => {
      expect(errorMessageFor(error, { title, rule }).action).toEqual({
        id: "open-rule",
        label,
        rule,
      });
    });
  });

  describe("limit_reached", () => {
    const error = new KindedError("limit_reached", "Rate limited.");
    const anthropic = { name: "Anthropic" };

    it.each([
      [90_000, "Anthropic asked Halonic to slow down. Try again in 2 minutes."],
      [60_000, "Anthropic asked Halonic to slow down. Try again in 1 minute."],
      [5_000, "Anthropic asked Halonic to slow down. Try again in 1 minute."],
    ])("says when a service's limit resets (%i ms)", (retryAfterMs, body) => {
      const message = errorMessageFor(error, { title, service: anthropic, retryAfterMs });
      expect(message.body).toBe(body);
      expect(message.action).toEqual({ id: "try-again", label: "Try again" });
    });

    it("leaves out the wait when the service didn't say", () => {
      expect(errorMessageFor(error, { title, service: anthropic }).body).toBe(
        "Anthropic asked Halonic to slow down.",
      );
    });

    it("offers Change budget for Halonic's own budget", () => {
      const budget = new KindedError(
        "limit_reached",
        "This month's estimated spend reached its budget of €50.00.",
      );
      expect(errorMessageFor(budget, { title, ownBudget: true })).toEqual({
        kind: "limit_reached",
        title,
        body: budget.message,
        action: { id: "change-budget", label: "Change budget" },
      });
    });

    it("falls back to the error's message, with Try again", () => {
      expect(errorMessageFor(error, { title })).toEqual({
        kind: "limit_reached",
        title,
        body: "Rate limited.",
        action: { id: "try-again", label: "Try again" },
      });
    });
  });

  describe("unavailable", () => {
    const error = new KindedError("unavailable", "Timed out.");

    it("says which service didn't answer, with Try again", () => {
      expect(errorMessageFor(error, { title, service: { name: "Anthropic" } })).toEqual({
        kind: "unavailable",
        title,
        body: "Anthropic didn't answer. It may be offline or busy.",
        action: { id: "try-again", label: "Try again" },
      });
    });

    it("falls back to the error's message", () => {
      expect(errorMessageFor(error, { title }).body).toBe("Timed out.");
    });
  });

  describe("internal", () => {
    const internal = {
      kind: "internal",
      title,
      body: "Halonic ran into a problem it can't explain yet.",
      action: { id: "copy-details", label: "Copy details" },
    };

    it("never shows an internal error's own message", () => {
      const message = errorMessageFor(
        new KindedError("internal", "at runStep (engine/src/run-step.ts:42:7)"),
        { title },
      );
      expect(message).toEqual(internal);
      expect(JSON.stringify(message)).not.toContain("run-step.ts");
    });

    it.each<[string, unknown]>([
      ["a TypeError", new TypeError("Cannot read properties of undefined (reading 'path')")],
      [
        "a cause that has a kind",
        new Error("wrapped", { cause: new KindedError("conflict", "x") }),
      ],
      ["a string", "ENOENT: .halonic/settings.json"],
      ["null", null],
    ])("calls %s internal and keeps its text off screen", (_, error) => {
      const message = errorMessageFor(error, { title, service: { name: "Anthropic" } });
      expect(message).toEqual(internal);
    });
  });
});
