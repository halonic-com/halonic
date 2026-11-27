import { ServiceRegistry } from "@halonicjs/app";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { FakeShell } from "./fake-shell.test-helper.ts";
import { actionStepsKey, provideActionSteps } from "./shell-actions.ts";

const step = {
  definition: "github.set-variable",
  version: 1,
  step: 1,
  placeholders: { owner: "acme", repo: "app" },
};
const code = { code: "ACME-1234", page: "https://github.com/login/device", expiresIn: 900 };

verifies("services.action-steps", () => {
  describe("provideActionSteps", () => {
    it("in a browser build, runs no step, signs in nowhere and writes nothing", async () => {
      const services = new ServiceRegistry();
      expect(provideActionSteps(services, {})).toBe(false);
      const steps = services.get(actionStepsKey);
      expect(steps.canRun).toBe(false);
      expect(await steps.runStep("req-1", step)).toEqual({ outcome: "desktop-only" });
      expect(await steps.openGuidedStep("req-1", step)).toEqual({ outcome: "desktop-only" });
      expect(await steps.signIn("req-1", "github", () => undefined)).toEqual({
        outcome: "desktop-only",
      });
      expect(await steps.account("github")).toBeUndefined();
      await steps.signOut("github");
      await steps.cancelSignIn();
      expect(await steps.history("req-1")).toEqual([]);
    });

    it("in the desktop app, signs in, runs a step and records it all through the shell's action commands", async () => {
      const written: unknown[] = [];
      const shell = new FakeShell()
        .answer("action_record_append", (args) => {
          written.push(args["event"]);
          return null;
        })
        .answer("action_record_read", () => written)
        .answer("action_sign_in", (args) => {
          shell.send(String(args["code"]), { index: 0, message: code });
          return { outcome: "signed-in", account: { service: "github", name: "acme-dev" } };
        })
        .answer("action_send", () => ({
          outcome: "answered",
          status: 201,
          kept: { name: "ACME_MODE" },
        }));
      const services = new ServiceRegistry();
      expect(provideActionSteps(services, { __TAURI_INTERNALS__: shell })).toBe(true);
      const steps = services.get(actionStepsKey);
      const shown: unknown[] = [];
      await steps.signIn("req-1", "github", (shownCode) => shown.push(shownCode));
      expect(shown).toEqual([code]);
      await steps.runStep("req-1", step);
      expect(shell.callsOf("action_send")).toEqual([{ request: step }]);
      const appended = shell.callsOf("action_record_append").map((args) => args["event"]);
      expect(appended).toMatchObject([
        { type: "action.signed-in", request: "req-1", service: "github", account: "acme-dev" },
        { type: "action.step.started", request: "req-1", step: 1 },
        { type: "action.step.succeeded", request: "req-1", step: 1, status: 201 },
      ]);
      expect(await steps.history("req-1")).toEqual(appended);
    });
  });
});
