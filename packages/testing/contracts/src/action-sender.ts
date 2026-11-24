import type { ActionCatalogStep, ActionSender, ActionSendRequest } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import {
  maxActionSendErrorLength,
  type SentActionCall,
  type StandInAnswer,
} from "./fake-action-sender.ts";

/** What the suite gives a sender under test: its allow-list, a stand-in service and who a sign-in signs in as. */
export interface ActionSenderSetup {
  steps: readonly ActionCatalogStep[];
  answer: (call: SentActionCall) => StandInAnswer;
  /** The account name a sign-in to `github` gives. Signing in to `cloudflare` is cancelled. */
  githubAccount: string;
}

/** A sender under test, and every call that reached its stand-in service, oldest first. */
export interface ActionSenderHarness {
  sender: ActionSender;
  sent: () => readonly SentActionCall[];
}

/** Creates a new sender for one test, wired to the setup's allow-list and stand-in service. */
export type MakeActionSender = (setup: ActionSenderSetup) => Promise<ActionSenderHarness>;

/** Invented catalog steps, as the catalog's generated allow-list would hold them. */
const approveRun: ActionCatalogStep = {
  definition: "github.approve-run",
  version: 1,
  step: 2,
  service: "github",
  method: "POST",
  path: "/repos/{owner}/{repo}/actions/runs/{runId}/approve",
  bodyFields: ["reason"],
  keep: ["id", "state", "details"],
};
const purgeCache: ActionCatalogStep = {
  definition: "cloudflare.purge-cache",
  version: 1,
  step: 1,
  service: "cloudflare",
  method: "POST",
  path: "/client/v4/zones/{zone}/purge_cache",
  bodyFields: ["files"],
  keep: ["id"],
};
const steps = [approveRun, purgeCache];

const approve = (values: Record<string, string>, ref = approveRun): ActionSendRequest => ({
  step: { definition: ref.definition, version: ref.version, step: ref.step },
  values,
});
const goodValues = { owner: "acme", repo: "app", runId: "123456" };

/** A stand-in that answers every call the same way. */
const always =
  (answer: StandInAnswer) =>
  (_call: SentActionCall): StandInAnswer =>
    answer;

/**
 * The contract every {@link ActionSender} passes: the fake now, the
 * shell's sender (over its `action_*` commands) later. It needs no network
 * and no token: a sender is given a harness that wires it to a stand-in
 * service and reports every call that reached it.
 */
export function actionSenderContract(name: string, make: MakeActionSender): void {
  verifies("contracts.action-sender", () => {
    describe(`ActionSender contract: ${name}`, () => {
      signInCases(make);
      refusalCases(make);
      sendCases(make);
    });
  });
}

/** A sender with the invented steps, signed in to GitHub. */
async function signedIn(make: MakeActionSender, answer: StandInAnswer = { status: 201 }) {
  const harness = await make({ steps, answer: always(answer), githubAccount: "acme-dev" });
  await harness.sender.signIn("github");
  return harness;
}

function signInCases(make: MakeActionSender): void {
  it("signs in and out of a service, and says who is signed in by name only", async () => {
    const { sender } = await make({
      steps,
      answer: always({ status: 200 }),
      githubAccount: "acme-dev",
    });
    expect(await sender.account("github")).toBeUndefined();
    const account = { service: "github", name: "acme-dev" };
    expect(await sender.signIn("github")).toEqual({ outcome: "signed-in", account });
    expect(await sender.account("github")).toEqual(account);
    await sender.signOut("github");
    await sender.signOut("github");
    expect(await sender.account("github")).toBeUndefined();
  });

  it("says a cancelled sign-in, and a service it doesn't know, apart", async () => {
    const { sender } = await make({
      steps,
      answer: always({ status: 200 }),
      githubAccount: "acme-dev",
    });
    expect(await sender.signIn("cloudflare")).toEqual({ outcome: "cancelled" });
    expect(await sender.signIn("npm")).toEqual({ outcome: "not-available" });
    expect(await sender.account("cloudflare")).toBeUndefined();
  });
}

function refusalCases(make: MakeActionSender): void {
  it("refuses a step that isn't on its allow-list, and sends nothing", async () => {
    const { sender, sent } = await signedIn(make);
    const offList = [
      approve(goodValues, { ...approveRun, version: 2 }),
      approve(goodValues, { ...approveRun, step: 1 }),
      approve(goodValues, { ...approveRun, definition: "github.delete-repo" }),
    ];
    for (const request of offList) {
      expect(await sender.send(request)).toEqual({ outcome: "refused", reason: "not-in-catalog" });
    }
    expect(sent()).toEqual([]);
  });

  it("refuses a value that could reach another route, and sends nothing", async () => {
    const { sender, sent } = await signedIn(make);
    const badValues = [
      { owner: "acme", repo: "app" },
      { ...goodValues, extra: "x" },
      ...["", ".", "..", "app/../../user", "app\\x", "app?x=1", "app#x"].map((repo) => ({
        ...goodValues,
        repo,
      })),
    ];
    for (const values of badValues) {
      expect(await sender.send(approve(values))).toEqual({
        outcome: "refused",
        reason: "bad-value",
      });
    }
    expect(sent()).toEqual([]);
  });

  it("refuses a body that isn't an object of the step's body fields, and sends nothing", async () => {
    const { sender, sent } = await signedIn(make);
    const bodies = [{ reason: "ok", admin: true }, ["reason"], "reason"];
    for (const body of bodies) {
      expect(await sender.send({ ...approve(goodValues), body })).toEqual({
        outcome: "refused",
        reason: "bad-value",
      });
    }
    expect(sent()).toEqual([]);
  });

  it("refuses a step while signed out of its service, and sends nothing", async () => {
    const { sender, sent } = await signedIn(make);
    const purge = approve({ zone: "0123abcd" }, purgeCache);
    expect(await sender.send(purge)).toEqual({ outcome: "refused", reason: "signed-out" });
    await sender.signOut("github");
    expect(await sender.send(approve(goodValues))).toEqual({
      outcome: "refused",
      reason: "signed-out",
    });
    expect(sent()).toEqual([]);
  });
}

function sendCases(make: MakeActionSender): void {
  it("sends the allow-list's method and path, each value as one encoded segment", async () => {
    const { sender, sent } = await signedIn(make);
    const body = { reason: "release 1.2" };
    await sender.send({ ...approve({ ...goodValues, repo: "app one" }), body });
    expect(sent()).toEqual([
      {
        service: "github",
        method: "POST",
        path: "/repos/acme/app%20one/actions/runs/123456/approve",
        body,
      },
    ]);
  });

  it("hands back only the step's kept fields that hold plain values", async () => {
    const fields = { id: 7, state: "approved", details: { a: 1 }, token: "acme-fake-token" };
    const { sender } = await signedIn(make, { status: 201, fields });
    const result = await sender.send(approve(goodValues));
    expect(result).toEqual({
      outcome: "answered",
      status: 201,
      kept: { id: 7, state: "approved" },
    });
    expect(JSON.stringify(result)).not.toContain("acme-fake-token");
  });

  it("hands back a failed status with the service's message, capped, and no fields", async () => {
    const error = "Must have admin rights. ".repeat(40);
    const { sender } = await signedIn(make, { status: 403, fields: { id: 7 }, error });
    const result = await sender.send(approve(goodValues));
    expect(result).toEqual({
      outcome: "answered",
      status: 403,
      kept: {},
      error: error.slice(0, maxActionSendErrorLength),
    });
  });

  it("says when the service didn't answer", async () => {
    const { sender } = await signedIn(make, "unreachable");
    expect(await sender.send(approve(goodValues))).toEqual({ outcome: "unreachable" });
  });
}
