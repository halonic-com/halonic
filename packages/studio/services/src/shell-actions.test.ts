import { ServiceRegistry } from "@halonicjs/app";
import { FakeActionRecords } from "@halonicjs/testing-contracts";
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
      const records = new FakeActionRecords();
      expect(provideActionSteps(services, {}, records)).toBe(false);
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
      expect(await records.read("req-1")).toEqual([]);
    });

    it("in the desktop app, signs in and runs a step through the shell's action commands", async () => {
      const shell = new FakeShell()
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
      const records = new FakeActionRecords();
      expect(provideActionSteps(services, { __TAURI_INTERNALS__: shell }, records)).toBe(true);
      const steps = services.get(actionStepsKey);
      const shown: unknown[] = [];
      await steps.signIn("req-1", "github", (shownCode) => shown.push(shownCode));
      expect(shown).toEqual([code]);
      await steps.runStep("req-1", step);
      expect(shell.callsOf("action_send")).toEqual([{ request: step }]);
      expect((await records.read("req-1")).map((event) => event.type)).toEqual([
        "action.signed-in",
        "action.step.started",
        "action.step.succeeded",
      ]);
    });
  });
});
