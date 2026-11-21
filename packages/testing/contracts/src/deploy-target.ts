import type {
  DeployEvent,
  DeploymentRef,
  DeployReach,
  DeployRequest,
  DeploySnapshot,
  DeployTarget,
  DestroyItem,
} from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { assert, describe, expect, it } from "vitest";

/** What a suite needs from a target under test. */
export interface DeployTargetHarness {
  /** The target, created for a host where `deployment` was never deployed. */
  target: DeployTarget;
  deployment: DeploymentRef;
  /** A token the host accepts. */
  token: string;
  /** The workspace as one commit, with at least one file. */
  snapshot: (commit: string) => Promise<DeploySnapshot>;
  /** A folder `export` may write to and `import` read from. */
  folder: () => Promise<string>;
  /** Called when the test ends, whatever happened. */
  dispose?: () => Promise<void>;
}

/** Creates a new harness for one test. */
export type MakeDeployTarget = () => Promise<DeployTargetHarness>;

/** A secret value the suite sends and then looks for everywhere it must not be. */
const secretValue = "contract-secret-6f0c2a9e";

const reaches: readonly DeployReach[] = [{ address: "api.example.com", secret: "EXAMPLE_KEY" }];

/**
 * The contract every {@link DeployTarget} passes: the fake and Cloudflare. It
 * drives a deployment from nothing through two deploys, a rollback and
 * destroy, and checks only what every target shows: the order of a deploy's
 * events, versions counted from 1, what `status` reads, the kit's error kinds
 * and that a secret's value never leaves the request. A lock held by another
 * deploy, a failed self-test and a warning after the switch are each target's
 * own test, because only the target can be made to show them.
 */
export function deployTargetContract(name: string, make: MakeDeployTarget): void {
  verifies("contracts.deploy-target", () => {
    describe(`DeployTarget contract: ${name}`, () => {
      loginCases(make);
      deployCases(make);
      rollbackCases(make);
      transferCases(make);
      destroyCases(make);
    });
  });
}

/** Runs one test against a new harness and disposes of it afterwards. */
function withTarget(
  make: MakeDeployTarget,
  body: (harness: DeployTargetHarness) => Promise<void>,
): () => Promise<void> {
  return async () => {
    const harness = await make();
    try {
      await body(harness);
    } finally {
      await harness.dispose?.();
    }
  };
}

async function requestFor(
  harness: DeployTargetHarness,
  commit: string,
  signal?: AbortSignal,
): Promise<DeployRequest> {
  return {
    deployment: harness.deployment,
    snapshot: await harness.snapshot(commit),
    secrets: new Map([["HALONIC_PASSWORD_HASH", secretValue]]),
    reaches,
    ...(signal === undefined ? {} : { signal }),
  };
}

/** Deploys a commit and fails the test unless it went live. */
async function deployLive(
  harness: DeployTargetHarness,
  commit: string,
  events: DeployEvent[] = [],
) {
  const result = await harness.target.deploy(await requestFor(harness, commit), (event) => {
    events.push(event);
  });
  assert(result.outcome === "deployed", `expected a deploy, got ${result.outcome}`);
  return result;
}

/** Checks that a call rejected with a deploy failure of this kind, and that its words hold no secret. */
async function expectFailure(call: Promise<unknown>, kind: string, codes: readonly string[]) {
  const error: unknown = await call.then(
    () => assert.fail(`expected a ${kind} failure`),
    (rejected: unknown) => rejected,
  );
  assert(error instanceof Error, "a target rejects with an Error");
  expect(error).toMatchObject({ kind });
  expect(codes).toContain((error as { code?: unknown }).code);
  expect(`${error.message} ${(error as { fix?: unknown }).fix ?? ""}`).not.toContain(secretValue);
  return error;
}

function loginCases(make: MakeDeployTarget): void {
  it(
    "lists the accounts a good token reaches",
    withTarget(make, async ({ target, token }) => {
      const { accounts } = await target.login(token);
      expect(accounts.length).toBeGreaterThan(0);
      for (const account of accounts) {
        expect(account.id).not.toBe("");
        expect(account.name).not.toBe("");
      }
    }),
  );

  it(
    "refuses a token the host doesn't know as unauthenticated",
    withTarget(make, async ({ target }) => {
      await expectFailure(target.login("not-a-token"), "unauthenticated", ["token-inactive"]);
    }),
  );
}

function deployCases(make: MakeDeployTarget): void {
  it(
    "plans a first deploy without changing anything",
    withTarget(make, async (harness) => {
      const plan = await harness.target.plan(await requestFor(harness, "c1"));
      expect(plan.live).toBeUndefined();
      expect(plan.lockedBy).toBeUndefined();
      expect(plan.unchanged).toBe(false);
      expect(plan.creates.length).toBeGreaterThan(0);
      expect(plan.files.length).toBeGreaterThan(0);
      expect((await harness.target.status(harness.deployment)).live).toBeUndefined();
    }),
  );

  it(
    "deploys version 1, reporting each step as started and then done, ending with the switch",
    withTarget(make, async (harness) => {
      const events: DeployEvent[] = [];
      const done = await deployLive(harness, "c1", events);
      expect(done.version).toMatchObject({ number: 1, commit: "c1" });
      expect(done.previous).toBeUndefined();
      expect(Array.isArray(done.warnings)).toBe(true);

      const steps = events.filter((event) => event.phase === "started" || event.phase === "done");
      for (const [index, event] of steps.entries()) {
        if (event.phase === "done")
          expect(steps[index - 1]).toMatchObject({ step: event.step, phase: "started" });
      }
      expect(steps.at(-1)).toMatchObject({ step: "switch", phase: "done", version: 1 });

      const status = await harness.target.status(harness.deployment);
      expect(status.live).toMatchObject({ number: 1, commit: "c1" });
      expect(status.lockedBy).toBeUndefined();
    }),
  );

  it(
    "makes no new version for a commit that is live already",
    withTarget(make, async (harness) => {
      await deployLive(harness, "c1");
      expect((await harness.target.plan(await requestFor(harness, "c1"))).unchanged).toBe(true);
      const again = await harness.target.deploy(await requestFor(harness, "c1"), () => {});
      expect(again).toMatchObject({ outcome: "unchanged", version: { number: 1 } });
    }),
  );

  it(
    "deploys version 2 over version 1, and plans it against what version 1 reaches",
    withTarget(make, async (harness) => {
      await deployLive(harness, "c1");
      const plan = await harness.target.plan(await requestFor(harness, "c2"));
      expect(plan.live).toMatchObject({ number: 1 });
      expect(plan.liveReaches).toEqual(reaches);
      expect(plan.unchanged).toBe(false);

      const done = await deployLive(harness, "c2");
      expect(done.version).toMatchObject({ number: 2, commit: "c2" });
      expect(done.previous).toMatchObject({ number: 1 });
      const status = await harness.target.status(harness.deployment);
      expect(status.live).toMatchObject({ number: 2 });
      expect(status.previous).toMatchObject({ number: 1 });
    }),
  );

  it(
    "stops a deploy whose signal was aborted before it began, with nothing live",
    withTarget(make, async (harness) => {
      const stop = new AbortController();
      stop.abort();
      const error = await expectFailure(
        harness.target.deploy(await requestFor(harness, "c1", stop.signal), () => {}),
        "conflict",
        ["stopped"],
      );
      expect(error).toMatchObject({ live: "none" });
      expect((await harness.target.status(harness.deployment)).live).toBeUndefined();
    }),
  );

  it(
    "never puts a secret's value into a plan, an event, a result or a status",
    withTarget(make, async (harness) => {
      const events: DeployEvent[] = [];
      const plan = await harness.target.plan(await requestFor(harness, "c1"));
      const done = await deployLive(harness, "c1", events);
      const status = await harness.target.status(harness.deployment);
      expect(JSON.stringify([plan, events, done, status])).not.toContain(secretValue);
    }),
  );

  it(
    "frees nothing when no deploy holds the lock",
    withTarget(make, async ({ target, deployment }) => {
      expect(await target.unlock(deployment)).toEqual({ freed: undefined });
    }),
  );
}

function rollbackCases(make: MakeDeployTarget): void {
  it(
    "plans a rollback without making it, then goes back to version 1",
    withTarget(make, async (harness) => {
      await deployLive(harness, "c1");
      await deployLive(harness, "c2");
      const { target, deployment } = harness;

      const plan = await target.rollback(deployment, { plan: true });
      expect(plan).toMatchObject({ mode: "plan", from: { number: 2 }, to: { number: 1 } });
      expect((await target.status(deployment)).live).toMatchObject({ number: 2 });

      const done = await target.rollback(deployment);
      expect(done).toMatchObject({ mode: "rolled-back", from: { number: 2 }, to: { number: 1 } });
      expect((await target.status(deployment)).live).toMatchObject({ number: 1 });
    }),
  );

  it(
    "refuses a rollback with nothing to go back to",
    withTarget(make, async (harness) => {
      await expectFailure(harness.target.rollback(harness.deployment), "not_found", [
        "not-deployed",
      ]);
      await deployLive(harness, "c1");
      await expectFailure(harness.target.rollback(harness.deployment), "conflict", [
        "nothing-to-roll-back",
        "rollback-not-possible",
      ]);
    }),
  );
}

function transferCases(make: MakeDeployTarget): void {
  it(
    "imports what it exported, with the same counts",
    withTarget(make, async (harness) => {
      await deployLive(harness, "c1");
      const folder = await harness.folder();
      const exported = await harness.target.export(harness.deployment, folder);
      const imported = await harness.target.import(harness.deployment, folder);
      expect(imported).toEqual(exported);
    }),
  );
}

function destroyCases(make: MakeDeployTarget): void {
  it(
    "lists what it would remove, removes nothing when told no, and removes it all when told yes",
    withTarget(make, async (harness) => {
      await deployLive(harness, "c1");
      const { target, deployment } = harness;
      const shown: (readonly DestroyItem[])[] = [];
      const answer = (yes: boolean) => async (items: readonly DestroyItem[]) => {
        shown.push(items);
        return yes;
      };

      const plan = await target.destroy(deployment, { confirm: answer(true), plan: true });
      expect(plan.mode).toBe("plan");
      expect(plan.items.length).toBeGreaterThan(0);
      expect(shown).toEqual([]);

      expect((await target.destroy(deployment, { confirm: answer(false) })).mode).toBe("cancelled");
      expect((await target.status(deployment)).live).toMatchObject({ number: 1 });

      const destroyed = await target.destroy(deployment, { confirm: answer(true) });
      expect(destroyed.mode).toBe("destroyed");
      expect(shown.at(-1)).toEqual(destroyed.items);
      expect((await target.status(deployment)).live).toBeUndefined();
    }),
  );
}
