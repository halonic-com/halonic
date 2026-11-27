import { readFileSync } from "node:fs";
import { join } from "node:path";
import { checkStepGate, routesOf } from "@halonicjs/action-steppers";
import { parse } from "@halonicjs/schema-kit";
import { FakeActionSender } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import {
  parseGithubRecording,
  recordedAnswers,
  recordedCalls,
} from "../github-replay.test-helper.ts";
import { manualGuideFor } from "../guide.test-helper.ts";
import { definition } from "./remove-runner.ts";

const parameters = { owner: "acme", repo: "app", runner_id: 23 };
const placeholders = { owner: "acme", repo: "app", runner_id: "23" };
const folder = join(import.meta.dirname, "..", "..", "fixtures", "github-remove-runner");
const step = { definition: definition.id, version: 1, placeholders };

/** A fake sender signed in to GitHub as `acme-dev` that replays one recorded scenario. */
async function replay(scenario: string) {
  const text = readFileSync(join(folder, `${scenario}.json`), "utf8");
  const recording = parseGithubRecording(text);
  const sender = new FakeActionSender({
    routes: routesOf(definition),
    signInAs: { github: "acme-dev" },
    answer: recordedAnswers(recording),
  });
  await sender.signIn("github");
  return { sender, recorded: recordedCalls(recording) };
}

/** Runs the check and asks the gate whether the removal may run, with no `expect`. */
async function checkThenGate(sender: FakeActionSender) {
  const read = await sender.send({ ...step, step: 1 });
  const kept = read.outcome === "answered" ? read.kept : {};
  return { read, gate: checkStepGate(definition, 2, {}, new Map([[1, kept]])) };
}

verifies("action-catalog.github-remove-runner", () => {
  describe("github.remove-runner@1", () => {
    it("reads an offline runner, lets the removal through and deletes it", async () => {
      const { sender, recorded } = await replay("offline-and-remove");
      const { read, gate } = await checkThenGate(sender);
      const kept = { name: "acme-builder-2", status: "offline", busy: false };
      expect(read).toEqual({ outcome: "answered", status: 200, kept });
      expect(gate).toEqual({ ok: true });
      expect(definition.preview(parameters, kept)[1]).toBe(
        "Removes runner 23 (`acme-builder-2`) from acme/app. Jobs that need it wait until another runner picks them up.",
      );
      expect(await sender.send({ ...step, step: 2 })).toEqual({
        outcome: "answered",
        status: 204,
        kept: {},
      });
      expect(sender.sent).toEqual(recorded);
    });

    it("refuses an online runner with its reason, before anything is deleted", async () => {
      const { sender, recorded } = await replay("online");
      const { gate } = await checkThenGate(sender);
      expect(gate).toEqual({
        ok: false,
        check: 1,
        cause: "requires",
        changes: [],
        message: "The runner is still online. Stop it on its machine first, then try again.",
      });
      expect(sender.sent).toEqual(recorded);
    });

    it("hands back GitHub's 404 for a runner that doesn't exist, and lets nothing through", async () => {
      const { sender } = await replay("not-found-404");
      const { read, gate } = await checkThenGate(sender);
      expect(read).toEqual({ outcome: "answered", status: 404, kept: {}, error: "Not Found" });
      expect(gate).toMatchObject({ ok: false, cause: "not-read" });
    });

    it("builds a check that runs without the dialog and an admin DELETE with no body", () => {
      expect(routesOf(definition)).toMatchObject([
        { step: 1, kind: "call", method: "GET", risk: "routine", body: [] },
        {
          step: 2,
          kind: "call",
          method: "DELETE",
          risk: "admin",
          path: "/repos/{owner}/{repo}/actions/runners/{runner_id}",
          body: [],
        },
      ]);
    });

    it("previews the read and says it stops on an online runner", () => {
      expect(definition.preview(parameters)).toEqual([
        "Reads runner 23 of acme/app; it needs your GitHub sign-in to have the Administration permission there. If the runner is online, Halonic stops here.",
        "Removes runner 23 from acme/app. Jobs that need it wait until another runner picks them up.",
      ]);
    });

    it("gives a numbered manual guide on the runners page", () => {
      expect(manualGuideFor("github.remove-runner@1", parameters, "Remove the old builder")).toBe(
        [
          "`Remove the old builder`",
          "",
          "Do these steps in order, signed in with your own account:",
          "1. Open https://github.com/acme/app/settings/actions/runners",
          "2. Find the runner with ID `23` and read its status.",
          "3. If it says **Idle** or **Active**, it is online: stop it on its machine first.",
          "4. Open https://github.com/acme/app/settings/actions/runners",
          "5. Click the runner with ID `23`, then click **Remove**.",
          "6. Click **Force remove this runner**.",
          "",
        ].join("\n"),
      );
    });

    it.each([{ runner_id: 0 }, { runner_id: "23" }, { repo: "../secrets" }, { path: "x" }])(
      "refuses %o",
      (change) => {
        expect(parse(definition.parameters, { ...parameters, ...change }).ok).toBe(false);
      },
    );
  });
});
