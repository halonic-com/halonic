import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { button, type FakeStudio, fakeStudio } from "../fake-studio.test-helper.ts";
import { runSteps, type Step, type StepContext } from "../runner.ts";
import { seedNames } from "../test-paperclip.ts";
import { buttonLabels, words } from "../words.ts";
import { restartKeepsSignIn } from "./restart-sign-in.ts";

const connectedRow = `Paperclip · Acme Click Test · Board\n${words.readOnly}\n${words.connected}\n${words.keyPower}`;
const signedOutRow = `Paperclip · Acme Click Test\n${words.signedOutCallout}\n${words.signInAgain}\n${words.keyPower}`;
const { title, line } = words.messengerEmpty;

/** A restarted Studio on the demo whose Settings › Connections shows `row`, and whose Messenger shows `messenger`. */
function restartedStudio(row: string, messenger: string): FakeStudio {
  const studio = fakeStudio("Acme");
  const show = () => {
    const window = studio.windows.get("main");
    if (window !== undefined) window.text = `${words.connectionsSection}\n${row}`;
  };
  button(studio, "main", buttonLabels.settings.text, show);
  button(studio, "main", words.connectionsSection, show);
  Object.assign(studio.context, {
    openShortcut: async (name: string) => {
      studio.shortcuts.push(name);
      studio.windows.set(name, { text: messenger, buttons: new Map() });
    },
  });
  return studio;
}

/** A step that records which app it ran on. */
function recordingStep(id: string, seen: StepContext[], restartsFirst = false): Step {
  return {
    id,
    title: `Step ${id}`,
    requirements: [`acme.${id}`],
    ...(restartsFirst ? { restartsFirst } : {}),
    run: async (context) => {
      seen.push(context);
      return { passed: true };
    },
  };
}

verifies("studio-click-test.connections-steps", () => {
  describe("a restart keeps the sign-in", () => {
    it("restarts the app first and needs Connect Paperclip", () => {
      expect(restartKeepsSignIn).toMatchObject({
        restartsFirst: true,
        needs: ["connect-paperclip"],
      });
    });

    it("passes when the row reads Connected and Messenger lists the seeded chat", async () => {
      const studio = restartedStudio(connectedRow, `${seedNames.agent} Chat`);
      await expect(restartKeepsSignIn.run(studio.context)).resolves.toEqual({ passed: true });
      expect(studio.shortcuts).toEqual(["Halonic Messenger"]);
    });

    it("fails as SIGN_IN_AGAIN_SHOWN when the row asks to sign in again", async () => {
      const studio = restartedStudio(signedOutRow, `${seedNames.agent} Chat`);
      await expect(restartKeepsSignIn.run(studio.context)).resolves.toMatchObject({
        passed: false,
        code: "SIGN_IN_AGAIN_SHOWN",
      });
      expect(studio.shortcuts).toEqual([]);
    });

    it("fails as NO_CONNECTIONS when Messenger says No connections", async () => {
      const studio = restartedStudio(connectedRow, `${title}\n${line}`);
      await expect(restartKeepsSignIn.run(studio.context)).resolves.toMatchObject({
        passed: false,
        code: "NO_CONNECTIONS",
      });
    });
  });

  describe("runSteps with a step that restarts first", () => {
    it("restarts the app before that step and goes on with the restarted app", async () => {
      const first = fakeStudio().context;
      const restartedApp = fakeStudio().context;
      const seen: StepContext[] = [];
      const results = await runSteps(
        [recordingStep("a", seen), recordingStep("b", seen, true), recordingStep("c", seen)],
        first,
        async () => undefined,
        async () => restartedApp,
      );
      expect(results.map((result) => result.verdict)).toEqual(["passed", "passed", "passed"]);
      expect(seen).toEqual([first, restartedApp, restartedApp]);
    });

    it("fails that step as NO_RESTART and runs no more when the app won't start again", async () => {
      const seen: StepContext[] = [];
      const results = await runSteps(
        [recordingStep("a", seen, true), recordingStep("b", seen)],
        fakeStudio().context,
        async () => undefined,
        async () => {
          throw new Error("DevTools never answered");
        },
      );
      const reason = "the app didn't restart for step 1: DevTools never answered";
      expect(results).toMatchObject([
        { verdict: "failed", code: "NO_RESTART", note: reason },
        { verdict: "not run", note: reason },
      ]);
      expect(seen).toEqual([]);
    });
  });
});
