import { shippedCatalog as catalog } from "@halonicjs/action-catalog";
import { routesOf } from "@halonicjs/action-steppers";
import type { AnswerResult, InboxActionRequest } from "@halonicjs/ports";
import { createActionSteps } from "@halonicjs/studio-services";
import { FakeActionRecords, FakeActionSender } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { reviewActionItem } from "../review/action-item-review.ts";
import { connectedPaperclipHosts } from "../review/paperclip-host.ts";
import { acmeSource, actionItem } from "../test-support/acme-catalog.test-helper.ts";
import { allowsAcme } from "../test-support/acme-run.test-helper.ts";
import { StepperRun } from "./stepper-run.ts";

const definition = catalog.definition("paperclip.set-secret", 1);
if (definition === undefined) throw new Error("paperclip.set-secret@1 isn't shipped");
const shipped = definition;

const at = new Date("2026-11-27T09:00:00.000Z");

/** The Paperclip the user connected, as `connectedPaperclipHosts` reads it from Settings. */
const connected = connectedPaperclipHosts([
  { provider: "paperclip", address: "https://paperclip.acme.example" },
]);

/** Store `ANTHROPIC_API_KEY` in the `ACME` company's Secrets on `host`. */
function setSecretRequest(host: string): InboxActionRequest {
  return {
    definition: "paperclip.set-secret",
    version: 1,
    parameters: { host, company: "ACME", name: "ANTHROPIC_API_KEY" },
    expires: "2026-11-27T12:00:00.000Z",
  };
}

/** A stepper for `request` from "Paperclip · Acme", which the policy allows, signed in to Paperclip. */
async function runOf(request: InboxActionRequest, hosts: () => readonly string[]) {
  const fake = new FakeActionSender({
    routes: routesOf(shipped),
    answer: () => ({ status: 200, fields: {} }),
    signInAs: { paperclip: "Board" },
    user: { confirms: true, secret: () => "" },
  });
  const sender = Object.assign(fake, { cancelSignIn: () => Promise.resolve() });
  const records = new FakeActionRecords();
  const steps = createActionSteps({ sender, records, now: () => at });
  await fake.signIn("paperclip");
  const answer = (): Promise<AnswerResult> =>
    Promise.resolve({ outcome: "answered", answeredAt: at.toISOString() });
  const item = actionItem(request);
  const context = { catalog, policy: allowsAcme, now: at, paperclipHosts: hosts() };
  const review = reviewActionItem(item, acmeSource, context);
  const open = async (): Promise<StepperRun> => {
    if (review.kind !== "stepper") throw new Error(`unreadable: ${review.reasons.join("; ")}`);
    const options = { item, source: acmeSource, catalog, policy: allowsAcme, steps, answer };
    const run = new StepperRun(review.view, { ...options, now: () => at, paperclipHosts: hosts });
    await run.open();
    return run;
  };
  return { review, records, open };
}

verifies("action-steppers.paperclip-host", () => {
  describe("a Paperclip request's host", () => {
    it("is ready to run on the Paperclip the user connected", async () => {
      const { open } = await runOf(setSecretRequest("paperclip.acme.example"), () => connected);
      const run = await open();
      expect(run.current().stage).toEqual({ kind: "ready" });
      expect(run.current().steps[0]?.action).toMatchObject({
        kind: "browser",
        address: "https://paperclip.acme.example/ACME/company/settings/secrets",
      });
    });

    it("is refused, with its reason, on a host the user didn't connect", async () => {
      const request = setSecretRequest("paperclip.acme.example.other.test");
      const { review } = await runOf(request, () => connected);
      expect(review).toEqual({
        kind: "unreadable",
        reasons: [
          "`paperclip.acme.example.other.test` isn't a Paperclip you connected in Settings › Connections",
        ],
      });
    });

    it("is refused when Studio has no connections to compare it with", async () => {
      const { review } = await runOf(setSecretRequest("paperclip.acme.example"), () => []);
      expect(review.kind).toBe("unreadable");
    });

    it("stops a ready request once its Paperclip is disconnected, before the step opens", async () => {
      let hosts = connected;
      const { records, open } = await runOf(
        setSecretRequest("paperclip.acme.example"),
        () => hosts,
      );
      const run = await open();
      hosts = [];
      run.actions.runStep(1);
      await run.idle();
      expect(run.current().stage).toEqual({ kind: "not-available" });
      expect(await records.read("paperclip:acme/item-1")).toEqual([]);
    });
  });

  describe("connectedPaperclipHosts", () => {
    it("reads the host of each Paperclip connection, once, and nothing else", () => {
      const hosts = connectedPaperclipHosts([
        { provider: "paperclip", address: "https://paperclip.acme.example" },
        { provider: "paperclip", address: "https://paperclip.acme.example/" },
        { provider: "other", address: "https://other.acme.example" },
        { provider: "paperclip", address: "not an address" },
      ]);
      expect(hosts).toEqual(["paperclip.acme.example"]);
    });
  });
});
