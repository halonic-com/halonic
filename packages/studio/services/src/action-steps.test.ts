import type { ActionRoute } from "@halonicjs/ports";
import {
  FakeActionRecords,
  FakeActionSender,
  type StandInAnswer,
} from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { createActionSteps } from "./action-steps.ts";

const setVariable: ActionRoute = {
  kind: "call",
  definition: "github.set-variable",
  version: 1,
  step: 1,
  service: "github",
  risk: "routine",
  method: "POST",
  path: "/repos/{owner}/{repo}/actions/variables",
  placeholders: { owner: "[a-z]+", repo: "[a-z]+" },
  body: [{ name: "name", kind: "string", pattern: "[A-Z_]+" }],
  keep: ["name"],
};
const variablesPage: ActionRoute = {
  kind: "guided",
  definition: "github.set-variable",
  version: 1,
  step: 2,
  service: "github",
  risk: "routine",
  address: "https://github.com/{owner}/{repo}/settings/variables/actions",
  placeholders: { owner: "[a-z]+", repo: "[a-z]+" },
};
const findVariable: ActionRoute = {
  kind: "call",
  definition: "github.set-variable",
  version: 1,
  step: 3,
  service: "github",
  risk: "routine",
  method: "GET",
  path: "/repos/{owner}/{repo}/actions/variables",
  placeholders: { owner: "[a-z]+", repo: "[a-z]+" },
  body: [],
  keep: ["name"],
};
const placeholders = { owner: "acme", repo: "app" };
const step = {
  definition: "github.set-variable",
  version: 1,
  step: 1,
  placeholders,
  body: { name: "ACME_MODE" },
};
const page = { definition: "github.set-variable", version: 1, step: 2, placeholders };
const at = "2026-11-25T09:00:00.000Z";

/** The steps over the fake sender, signed in as `acme-dev`, with `answer` as GitHub. */
async function setUp(
  answer: () => StandInAnswer = () => ({ status: 201, fields: { name: "ACME_MODE" } }),
) {
  const fake = new FakeActionSender({
    routes: [setVariable, variablesPage, findVariable],
    answer,
    signInAs: { github: "acme-dev" },
  });
  const sender = Object.assign(fake, { cancelSignIn: () => Promise.resolve() });
  const records = new FakeActionRecords();
  const steps = createActionSteps({ sender, records, now: () => new Date(at) });
  await steps.signIn("req-1", "github", () => undefined);
  return { fake, records, steps };
}

const typesOf = async (records: FakeActionRecords) =>
  (await records.read("req-1")).map((event) => event.type);

verifies("services.action-steps", () => {
  describe("createActionSteps", () => {
    it("runs step 1 as exactly that catalog step and records that it succeeded, with its kept fields", async () => {
      const { fake, records, steps } = await setUp();
      expect(await steps.runStep("req-1", step)).toEqual({
        outcome: "answered",
        status: 201,
        kept: { name: "ACME_MODE" },
      });
      expect(fake.sent).toEqual([
        {
          service: "github",
          method: "POST",
          path: "/repos/acme/app/actions/variables",
          body: { name: "ACME_MODE" },
        },
      ]);
      expect(await records.read("req-1")).toEqual([
        { type: "action.signed-in", request: "req-1", at, service: "github", account: "acme-dev" },
        { type: "action.step.started", request: "req-1", at, step: 1 },
        {
          type: "action.step.succeeded",
          request: "req-1",
          at,
          step: 1,
          status: 201,
          kept: { name: "ACME_MODE" },
        },
      ]);
    });

    it("records a failed status with the service's message, a refusal and no answer as failures", async () => {
      const forbidden = await setUp(() => ({ status: 403, error: "Must have admin rights." }));
      await forbidden.steps.runStep("req-1", step);
      expect((await forbidden.records.read("req-1")).at(-1)).toEqual({
        type: "action.step.failed",
        request: "req-1",
        at,
        step: 1,
        failure: "service-error",
        status: 403,
        error: "Must have admin rights.",
      });
      const silent = await setUp(() => ({ status: 500 }));
      await silent.steps.runStep("req-1", step);
      expect((await silent.records.read("req-1")).at(-1)).toMatchObject({
        failure: "service-error",
        status: 500,
      });
      const unreachable = await setUp(() => "unreachable");
      await unreachable.steps.runStep("req-1", step);
      expect((await unreachable.records.read("req-1")).at(-1)).toMatchObject({
        failure: "unreachable",
      });
      const refused = await setUp();
      await refused.steps.runStep("req-1", {
        ...step,
        placeholders: { owner: "acme", repo: "../x" },
      });
      expect((await refused.records.read("req-1")).at(-1)).toMatchObject({ failure: "refused" });
    });

    it("records a check whose 2xx answer found more than one match as failed, not succeeded", async () => {
      const { records, steps } = await setUp(() => ({ status: 200, matches: 2 }));
      const check = { definition: "github.set-variable", version: 1, step: 3, placeholders };
      expect(await steps.runStep("req-1", check)).toEqual({
        outcome: "answered",
        status: 200,
        kept: {},
        unusable: "more-than-one",
      });
      expect((await records.read("req-1")).at(-1)).toEqual({
        type: "action.step.failed",
        request: "req-1",
        at,
        step: 3,
        failure: "more-than-one",
        status: 200,
      });
    });

    it("leaves only the start when the user cancels in the shell's dialog, so the step can run again", async () => {
      const { fake, records } = await setUp();
      const confirmedRoute: ActionRoute = { ...setVariable, risk: "admin" };
      const declining = new FakeActionSender({
        routes: [confirmedRoute],
        signInAs: { github: "acme-dev" },
        user: { confirms: false, secret: () => undefined },
      });
      await declining.signIn("github");
      const cancelSteps = createActionSteps({
        sender: Object.assign(declining, { cancelSignIn: () => Promise.resolve() }),
        records,
        now: () => new Date(at),
      });
      expect(await cancelSteps.runStep("req-1", step)).toEqual({ outcome: "cancelled" });
      expect(await typesOf(records)).toEqual(["action.signed-in", "action.step.started"]);
      expect([...fake.sent, ...declining.sent]).toEqual([]);
    });

    it("runs nothing more once the request's record has its action.finished", async () => {
      const { fake, records, steps } = await setUp();
      await records.append({ type: "action.finished", request: "req-1", at, outcome: "declined" });
      expect(await steps.runStep("req-1", step)).toEqual({ outcome: "closed" });
      expect(await steps.openGuidedStep("req-1", page)).toEqual({ outcome: "closed" });
      expect([...fake.sent, ...fake.opened]).toEqual([]);
      expect(await typesOf(records)).toEqual(["action.signed-in", "action.finished"]);
    });

    it("opens a guided step's page and records its start, or its refusal", async () => {
      const { fake, records, steps } = await setUp();
      expect(await steps.openGuidedStep("req-1", page)).toEqual({ outcome: "opened" });
      expect(fake.opened).toEqual(["https://github.com/acme/app/settings/variables/actions"]);
      const badPage = { ...page, placeholders: { owner: "acme", repo: "../settings" } };
      expect(await steps.openGuidedStep("req-1", badPage)).toEqual({
        outcome: "refused",
        reason: "bad-value",
      });
      expect(await typesOf(records)).toEqual([
        "action.signed-in",
        "action.step.started",
        "action.step.started",
        "action.step.failed",
      ]);
    });

    it("records no sign-in that didn't happen, and passes account, sign-out and cancel on", async () => {
      const { records, steps } = await setUp();
      expect(await steps.signIn("req-2", "cloudflare", () => undefined)).toEqual({
        outcome: "not-available",
      });
      expect(await records.read("req-2")).toEqual([]);
      expect(await steps.account("github")).toEqual({ service: "github", name: "acme-dev" });
      await steps.signOut("github");
      await steps.cancelSignIn();
      expect(await steps.account("github")).toBeUndefined();
      expect(steps.canRun).toBe(true);
    });
  });
});
