import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { findSignInMessage, findSignInProblem, SignInError } from "./sign-in.ts";

verifies("harness-claude-code.sign-in-expired", () => {
  describe("findSignInProblem", () => {
    it.each([
      ["Login expired · Please run /login", "sign-in-expired"],
      ["  Login expired · Please run /login\n", "sign-in-expired"],
      ["Not logged in · Please run /login", "signed-out"],
      ["Authentication required · Sign in again to continue", "signed-out"],
    ])("reads %j as %s", (line, problem) => {
      expect(findSignInProblem(line)).toBe(problem);
    });

    it.each([
      "Please check your login settings",
      "The agent said: Login expired · Please run /login",
      "",
    ])("finds no sign-in problem in %j", (line) => {
      expect(findSignInProblem(line)).toBeUndefined();
    });
  });

  describe("findSignInMessage", () => {
    it.each([
      ["Login expired · Please run /login", "sign-in-expired"],
      [" Not logged in · Please run /login\n", "signed-out"],
    ])("reads the whole message %j as %s", (text, problem) => {
      expect(findSignInMessage(text)).toBe(problem);
    });

    it.each([
      "Not logged in users see the landing page first.",
      "Authentication required · Sign in again to continue",
      "Login expired sessions now redirect.\nRun /login",
      "Please run /login",
    ])("finds no sign-in message in the answer %j", (text) => {
      expect(findSignInMessage(text)).toBeUndefined();
    });
  });

  describe("SignInError", () => {
    it("says to sign in again for the agent, with `halonic doctor`, when its sign-in has expired", () => {
      const error = new SignInError("sign-in-expired");
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe("SignInError");
      expect(error.problem).toBe("sign-in-expired");
      expect(error.message).toBe(
        "Claude Code's sign-in for this agent has expired. Sign in again for this agent: `halonic doctor` shows the command.",
      );
    });

    it("says to sign in for the agent, not in the person's own terminal, when no one is signed in", () => {
      expect(new SignInError("signed-out").message).toBe(
        "Claude Code isn't signed in for this agent. Sign in for this agent, not in your own terminal: `halonic doctor` shows the command.",
      );
    });
  });
});
