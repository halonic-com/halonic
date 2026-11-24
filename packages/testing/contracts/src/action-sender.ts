import { maxActionErrorLength } from "@halonicjs/events";
import type { ActionRoute, ActionSender, ActionSendRequest, ActionService } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import {
  addSecretPage,
  approveBody,
  approveRun,
  deleteEnvironment,
  routes,
  runValues,
  setWorkerSecret,
  stepOf,
} from "./action-sender-routes.ts";
import type { SentActionCall, StandInAnswer, StandInUser } from "./fake-action-sender.ts";

/** What the suite gives a sender under test: its route list, a stand-in service and a stand-in user. */
export interface ActionSenderSetup {
  routes: readonly ActionRoute[];
  answer: (call: SentActionCall) => StandInAnswer;
  /** Who a sign-in signs in as, by service. A service without one says `cancelled`. */
  accounts: Readonly<Record<ActionService, string>>;
  user: StandInUser;
}

/** A sender under test, and everything that left it, oldest first. */
export interface ActionSenderHarness {
  sender: ActionSender;
  sent: () => readonly SentActionCall[];
  opened: () => readonly string[];
}

/** Creates a new sender for one test, wired to the setup's route list, stand-in service and user. */
export type MakeActionSender = (setup: ActionSenderSetup) => Promise<ActionSenderHarness>;

const accounts = { github: "acme-dev", cloudflare: "acme-ops" };
const confirming: StandInUser = { confirms: true, secret: () => "acme-fake-secret" };

/** A sender signed in to every service, with a user who confirms and types a secret. */
async function ready(make: MakeActionSender, overrides: Partial<ActionSenderSetup> = {}) {
  const answer = (): StandInAnswer => ({ status: 201 });
  const harness = await make({ routes, answer, accounts, user: confirming, ...overrides });
  await harness.sender.signIn("github");
  await harness.sender.signIn("cloudflare");
  return harness;
}

/**
 * The contract every {@link ActionSender} passes: the fake now, the
 * shell's sender (over its `action_*` commands) later. It needs no network
 * and no token: a sender is given a harness that wires it to a stand-in
 * service and user and reports everything that left it. Dropping token
 * shapes from error text is the shell's own test, since a token shape in
 * this repository would trip the leak guard.
 */
export function actionSenderContract(name: string, make: MakeActionSender): void {
  verifies("contracts.action-sender", () => {
    describe(`ActionSender contract: ${name}`, () => {
      signInCases(make);
      refusalCases(make);
      dialogCases(make);
      sendCases(make);
    });
  });
}

function signInCases(make: MakeActionSender): void {
  it("signs in and out, says who by name only, and tells cancelled from unknown", async () => {
    const answer = (): StandInAnswer => ({ status: 200 });
    const setup = { routes, answer, accounts: { github: "acme-dev" }, user: confirming };
    const { sender } = await make(setup);
    expect(await sender.account("github")).toBeUndefined();
    const account = { service: "github", name: "acme-dev" };
    expect(await sender.signIn("github")).toEqual({ outcome: "signed-in", account });
    expect(await sender.account("github")).toEqual(account);
    await sender.signOut("github");
    await sender.signOut("github");
    expect(await sender.account("github")).toBeUndefined();
    expect(await sender.signIn("cloudflare")).toEqual({ outcome: "cancelled" });
    expect(await sender.signIn("npm")).toEqual({ outcome: "not-available" });
  });
}

function refusalCases(make: MakeActionSender): void {
  it("refuses a step that isn't on its route list, or of the other kind, and sends nothing", async () => {
    const { sender, sent, opened } = await ready(make);
    const notInCatalog = { outcome: "refused", reason: "not-in-catalog" };
    for (const route of [
      { ...approveRun, version: 2 },
      { ...approveRun, step: 1 },
    ]) {
      expect(await sender.send(stepOf(route, runValues, approveBody))).toEqual(notInCatalog);
    }
    const repoOnly = { owner: "acme", repo: "app" };
    expect(await sender.send(stepOf(addSecretPage, repoOnly))).toEqual(notInCatalog);
    expect(await sender.openGuided(stepOf(approveRun, runValues))).toEqual(notInCatalog);
    expect([...sent(), ...opened()]).toEqual([]);
  });

  it("refuses a placeholder that could reach another route, and sends nothing", async () => {
    const { sender, sent, opened } = await ready(make);
    const repos = [
      "",
      ".",
      "..",
      "app/../../user",
      "app\\x",
      "app?x=1",
      "app#x",
      "app%2Fx",
      "app:x",
    ];
    const badValues = [
      { owner: "acme", repo: "app" },
      { ...runValues, extra: "x" },
      { ...runValues, runId: "12a" },
      ...repos.map((repo) => ({ ...runValues, repo })),
    ];
    const badValue = { outcome: "refused", reason: "bad-value" };
    for (const values of badValues) {
      expect(await sender.send(stepOf(approveRun, values, approveBody))).toEqual(badValue);
    }
    const page = stepOf(addSecretPage, { owner: "acme", repo: "../settings" });
    expect(await sender.openGuided(page)).toEqual(badValue);
    expect([...sent(), ...opened()]).toEqual([]);
  });

  it("refuses a body with a field missing, extra, mistyped, or that only it may fill", async () => {
    const { sender, sent } = await ready(make);
    // A page could send any JSON, so the mistyped body is typed only as the port's.
    const bodies = [
      { reason: "Release 1.2" },
      { ...approveBody, admin: true },
      { ...approveBody, environmentIds: ["161088068"] },
      { ...approveBody, reason: "" },
    ] as ActionSendRequest["body"][];
    const badValue = { outcome: "refused", reason: "bad-value" };
    for (const body of bodies) {
      expect(await sender.send(stepOf(approveRun, runValues, body))).toEqual(badValue);
    }
    const secretValues = { account: "0123abcd", script: "acme-worker" };
    const pageSecret = { name: "API_KEY", text: "typed-in-the-page" };
    expect(await sender.send(stepOf(setWorkerSecret, secretValues, pageSecret))).toEqual(badValue);
    const pageConstant = { name: "API_KEY", type: "plain_text" };
    expect(await sender.send(stepOf(setWorkerSecret, secretValues, pageConstant))).toEqual(
      badValue,
    );
    expect(sent()).toEqual([]);
  });

  it("refuses a step while signed out of its service, and sends nothing", async () => {
    const { sender, sent } = await ready(make);
    await sender.signOut("github");
    expect(await sender.send(stepOf(approveRun, runValues, approveBody))).toEqual({
      outcome: "refused",
      reason: "signed-out",
    });
    expect(sent()).toEqual([]);
  });
}

function dialogCases(make: MakeActionSender): void {
  it("sends nothing when the user doesn't confirm a risky step or closes the secret dialog", async () => {
    const refusing: StandInUser = { confirms: false, secret: () => "acme-fake-secret" };
    const declined = await ready(make, { user: refusing });
    const environment = { owner: "acme", repo: "app", environment: "staging" };
    const deleting = stepOf(deleteEnvironment, environment);
    expect(await declined.sender.send(deleting)).toEqual({ outcome: "cancelled" });
    const closing: StandInUser = { confirms: true, secret: () => undefined };
    const closed = await ready(make, { user: closing });
    const secretValues = { account: "0123abcd", script: "acme-worker" };
    const setting = stepOf(setWorkerSecret, secretValues, { name: "API_KEY" });
    expect(await closed.sender.send(setting)).toEqual({ outcome: "cancelled" });
    expect([...declined.sent(), ...closed.sent()]).toEqual([]);
  });

  it("fills the constant and the typed secret itself, and never hands the secret back", async () => {
    const answer = (): StandInAnswer => ({ status: 200, fields: { name: "API_KEY" } });
    const { sender, sent } = await ready(make, { answer });
    const secretValues = { account: "0123abcd", script: "acme-worker" };
    const result = await sender.send(stepOf(setWorkerSecret, secretValues, { name: "API_KEY" }));
    expect(result).toEqual({ outcome: "answered", status: 200, kept: { name: "API_KEY" } });
    expect(JSON.stringify(result)).not.toContain("acme-fake-secret");
    expect(sent()).toEqual([
      {
        service: "cloudflare",
        method: "PUT",
        path: "/client/v4/accounts/0123abcd/workers/scripts/acme-worker/secrets",
        body: { name: "API_KEY", type: "secret_text", text: "acme-fake-secret" },
      },
    ]);
  });
}

function sendCases(make: MakeActionSender): void {
  it("sends the route's method and path, each value as one encoded segment", async () => {
    const { sender, sent, opened } = await ready(make);
    await sender.send(stepOf(approveRun, { ...runValues, repo: "app one" }, approveBody));
    expect(sent()).toEqual([
      {
        service: "github",
        method: "POST",
        path: "/repos/acme/app%20one/actions/runs/123456/approve",
        body: approveBody,
      },
    ]);
    const page = stepOf(addSecretPage, { owner: "acme", repo: "app" });
    expect(await sender.openGuided(page)).toEqual({ outcome: "opened" });
    expect(opened()).toEqual(["https://github.com/acme/app/settings/secrets/actions/new"]);
  });

  it("hands back only the route's kept fields that hold plain values", async () => {
    const fields = { id: 7, state: "approved", details: { a: 1 }, token: "acme-fake-token" };
    const { sender } = await ready(make, { answer: () => ({ status: 201, fields }) });
    const result = await sender.send(stepOf(approveRun, runValues, approveBody));
    expect(result).toEqual({
      outcome: "answered",
      status: 201,
      kept: { id: 7, state: "approved" },
    });
    expect(JSON.stringify(result)).not.toContain("acme-fake-token");
  });

  it("hands back a failed status with the service's message, capped, and no fields", async () => {
    const error = "Must have admin rights. ".repeat(40);
    const { sender } = await ready(make, {
      answer: () => ({ status: 403, fields: { id: 7 }, error }),
    });
    expect(await sender.send(stepOf(approveRun, runValues, approveBody))).toEqual({
      outcome: "answered",
      status: 403,
      kept: {},
      error: error.slice(0, maxActionErrorLength),
    });
  });

  it("says when the service didn't answer", async () => {
    const { sender } = await ready(make, { answer: () => "unreachable" });
    const result = await sender.send(stepOf(approveRun, runValues, approveBody));
    expect(result).toEqual({ outcome: "unreachable" });
  });
}
