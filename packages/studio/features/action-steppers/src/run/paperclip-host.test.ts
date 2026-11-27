import { shippedCatalog as catalog, shippedDefinitions } from "@halonicjs/action-catalog";
import { routesOf } from "@halonicjs/action-steppers";
import type { AnswerResult, InboxActionRequest } from "@halonicjs/ports";
import { createActionSteps } from "@halonicjs/studio-services";
import {
  FakeActionRecords,
  FakeActionSender,
  FakeServiceSignIn,
} from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { reviewActionItem } from "../review/action-item-review.ts";
import {
  type ConnectionsRead,
  connectedPaperclips,
  noConnections,
} from "../review/paperclip-host.ts";
import { acmeSource, actionItem } from "../test-support/acme-catalog.test-helper.ts";
import { allowsAcme } from "../test-support/acme-run.test-helper.ts";
import { StepperRun } from "./stepper-run.ts";

const at = new Date("2026-11-27T09:00:00.000Z");
const acmeAddress = "https://paperclip.acme.example";

/** The `acme` Paperclip as Settings lists it, in the given state, read the way the Inbox reads it. */
function acmeIn(kind: "online" | "no-key"): ConnectionsRead {
  const state = kind === "online" ? { kind, asOf: at.toISOString() } : { kind };
  const paperclips = connectedPaperclips([{ provider: "paperclip", address: acmeAddress, state }]);
  return { kind: "read", paperclips };
}

/** Store `ANTHROPIC_API_KEY` in the `ACME` company's Secrets on `host`. */
function setSecretRequest(host: string): InboxActionRequest {
  return {
    definition: "paperclip.set-secret",
    version: 1,
    parameters: { host, company: "ACME", name: "ANTHROPIC_API_KEY" },
    expires: "2026-11-27T12:00:00.000Z",
  };
}

/** Connect Studio to the `acme` Paperclip for the first time. */
const connectRequest: InboxActionRequest = {
  definition: "paperclip.connect-and-test",
  version: 1,
  parameters: { host: "paperclip.acme.example", connection: "acme", mode: "connect" },
  expires: "2026-11-27T12:00:00.000Z",
};

/**
 * A stepper for `request` from "Paperclip · Acme", which the policy allows, signed in to
 * Paperclip, with a stand-in sign-in for the `acme` connection file that holds no key yet.
 */
async function runOf(request: InboxActionRequest, paperclips: () => ConnectionsRead) {
  const definition = catalog.definition(request.definition, request.version);
  if (definition === undefined) throw new Error(`${request.definition} isn't shipped`);
  const fake = new FakeActionSender({
    routes: routesOf(definition),
    answer: () => ({ status: 200, fields: {} }),
    signInAs: { paperclip: "Board" },
    user: { confirms: true, secret: () => "" },
  });
  const sender = Object.assign(fake, { cancelSignIn: () => Promise.resolve() });
  const records = new FakeActionRecords();
  const steps = createActionSteps({ sender, records, now: () => at });
  await fake.signIn("paperclip");
  const signIn = new FakeServiceSignIn({
    connections: { acme: { address: acmeAddress, company: "acme-company" } },
    keys: [],
    approver: "Acme Board",
    now: () => at,
  });
  const serviceSignIn = { signIn, openPage: () => Promise.resolve() };
  const answer = (): Promise<AnswerResult> =>
    Promise.resolve({ outcome: "answered", answeredAt: at.toISOString() });
  const item = actionItem(request);
  const context = { catalog, policy: allowsAcme, now: at, paperclips: paperclips() };
  const review = reviewActionItem(item, acmeSource, context);
  const open = async (): Promise<StepperRun> => {
    if (review.kind !== "stepper") throw new Error(`unreadable: ${review.reasons.join("; ")}`);
    const options = { item, source: acmeSource, catalog, policy: allowsAcme, steps, answer };
    const run = new StepperRun(review.view, {
      ...options,
      now: () => at,
      paperclips,
      serviceSignIn,
    });
    await run.open();
    return run;
  };
  return { review, records, open };
}

/** Every page address and manual guide address anywhere in `value`. */
function addressesIn(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(addressesIn);
  if (typeof value !== "object" || value === null) return [];
  return Object.entries(value).flatMap(([key, field]) =>
    (key === "address" || key === "url") && typeof field === "string"
      ? [field]
      : addressesIn(field),
  );
}

verifies("action-steppers.paperclip-host", () => {
  describe("a Paperclip request's host", () => {
    it("is ready to run on the Paperclip the user connected", async () => {
      const request = setSecretRequest("paperclip.acme.example");
      const { open } = await runOf(request, () => acmeIn("online"));
      const run = await open();
      expect(run.current().stage).toEqual({ kind: "ready" });
      expect(run.current().steps[0]?.action).toMatchObject({
        kind: "browser",
        address: "https://paperclip.acme.example/ACME/company/settings/secrets",
      });
    });

    it("is refused, with its reason, on a host the user didn't connect", async () => {
      const request = setSecretRequest("paperclip.acme.example.other.test");
      const { review } = await runOf(request, () => acmeIn("online"));
      expect(review).toEqual({
        kind: "unreadable",
        reasons: [
          "`paperclip.acme.example.other.test` isn't a Paperclip you connected in Settings › Connections",
        ],
      });
    });

    it("is refused when Studio has no connections to compare it with", async () => {
      const { review } = await runOf(
        setSecretRequest("paperclip.acme.example"),
        () => noConnections,
      );
      expect(review.kind).toBe("unreadable");
    });

    it("is refused, with its reason, on a connection with no key on this computer", async () => {
      const request = setSecretRequest("paperclip.acme.example");
      const { review } = await runOf(request, () => acmeIn("no-key"));
      expect(review).toEqual({
        kind: "unreadable",
        reasons: [
          "this computer isn't signed in to `paperclip.acme.example`: sign in to it in Settings › Connections",
        ],
      });
    });

    it("stops a ready request once its connection loses its key, before the step opens", async () => {
      let paperclips = acmeIn("online");
      const request = setSecretRequest("paperclip.acme.example");
      const { records, open } = await runOf(request, () => paperclips);
      const run = await open();
      // Disconnect forgets the key but keeps the connection file, so the row turns `no-key`.
      paperclips = acmeIn("no-key");
      run.actions.runStep(1);
      await run.idle();
      expect(run.current().stage).toEqual({ kind: "not-available" });
      expect(await records.read("paperclip:acme/item-1")).toEqual([]);
    });

    it("waits in review mode while the connections are read, then is ready once they are", async () => {
      let paperclips: ConnectionsRead = { kind: "loading" };
      const request = setSecretRequest("paperclip.acme.example");
      const { review, open } = await runOf(request, () => paperclips);
      expect(review.kind).toBe("stepper");
      const run = await open();
      expect(run.current().stage).toEqual({ kind: "desktop-only" });
      paperclips = acmeIn("online");
      run.recheck();
      await run.idle();
      expect(run.current().stage).toEqual({ kind: "ready" });
    });

    it("runs no step while the connections are still being read", async () => {
      const request = setSecretRequest("paperclip.acme.example");
      const { records, open } = await runOf(request, () => ({ kind: "loading" }));
      const run = await open();
      run.actions.runStep(1);
      await run.idle();
      expect(run.current().stage).toEqual({ kind: "desktop-only" });
      expect(await records.read("paperclip:acme/item-1")).toEqual([]);
    });

    it("is refused, with its reason, when the connections couldn't be read", async () => {
      const request = setSecretRequest("paperclip.acme.example");
      const { review } = await runOf(request, () => ({ kind: "failed" }));
      expect(review).toEqual({
        kind: "unreadable",
        reasons: ["Halonic couldn't read your connections in Settings › Connections"],
      });
    });

    it("lets a first sign-in run on a connection that holds no key yet", async () => {
      const { open } = await runOf(connectRequest, () => acmeIn("no-key"));
      const run = await open();
      expect(run.current().stage).toEqual({ kind: "ready" });
    });
  });

  describe("connectedPaperclips", () => {
    it("reads each Paperclip connection's host once, with a key if any of its rows has one", () => {
      const online = { kind: "online", asOf: at.toISOString() };
      const paperclips = connectedPaperclips([
        { provider: "paperclip", address: "https://paperclip.acme.example", state: online },
        {
          provider: "paperclip",
          address: "https://paperclip.acme.example/",
          state: { kind: "no-key" },
        },
        {
          provider: "paperclip",
          address: "https://paperclip.beta.example",
          state: { kind: "signed-out" },
        },
        { provider: "other", address: "https://other.acme.example", state: online },
        { provider: "paperclip", address: "not an address", state: online },
      ]);
      expect(paperclips).toEqual([
        { host: "paperclip.acme.example", hasKey: true },
        { host: "paperclip.beta.example", hasKey: false },
      ]);
    });
  });

  describe("the shipped Paperclip definitions", () => {
    const paperclipDefinitions = shippedDefinitions.filter(
      (entry) => entry.definition.service === "paperclip",
    );

    it.each(paperclipDefinitions)("$key opens pages only on the request's host", (entry) => {
      const addresses = addressesIn(entry.definition.steps);
      expect(addresses.length).toBeGreaterThan(0);
      for (const address of addresses) expect(address).toMatch(/^https:\/\/\{host\}\//);
    });
  });
});
