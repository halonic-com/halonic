import type { Deployment } from "@halonicjs/format";
import type {
  DefinitionSource,
  DeployEvent,
  DeployedVersion,
  DeployPlan,
  DeployRequest,
  DeployTarget,
} from "@halonicjs/ports";
import { errorKindOf } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { chooseDeployment } from "./choose-deployment.ts";
import { createDeployService, type DeployInput, type DeployQuestions } from "./deploy-service.ts";

const v1: DeployedVersion = {
  number: 1,
  id: "v-1",
  commit: "3f9c2e1",
  halonicVersion: "0.3.1",
  liveSince: "2026-11-19T13:00:00.000Z",
};

const livePlan: DeployPlan = {
  account: { id: "acc", name: "sam@example.com's Account" },
  url: "https://acme.sam-example.workers.dev",
  creates: [],
  adopts: [],
  databaseChanges: [],
  deletesData: false,
  live: v1,
  liveReaches: [{ address: "api.anthropic.com", secret: "anthropic-key" }],
  lockedBy: undefined,
  unchanged: false,
  files: ["workspace.yaml"],
};

const firstPlan: DeployPlan = {
  ...livePlan,
  creates: [{ kind: "service", name: "acme" }],
  live: undefined,
  liveReaches: undefined,
};

/** A target that records what it was asked and deploys at once. */
function fakeTarget(plan: DeployPlan) {
  const deployed: DeployRequest[] = [];
  const target = {
    plan: async () => plan,
    deploy: async (request: DeployRequest) => {
      deployed.push(request);
      return {
        outcome: "deployed" as const,
        url: "https://acme.sam-example.workers.dev",
        version: { ...v1, number: 2, id: "v-2", commit: "8d1a04b" },
        previous: v1,
        warnings: [],
      };
    },
  } as Partial<DeployTarget> as DeployTarget;
  return { target, deployed };
}

function service(plan: DeployPlan) {
  const fake = fakeTarget(plan);
  const loaded: string[] = [];
  const deploys = createDeployService({
    loadTarget: async (host) => {
      loaded.push(host);
      return fake.target;
    },
    clock: { now: () => new Date("2026-11-19T14:34:00.000Z") },
    timeZone: "UTC",
  });
  return { deploys, loaded, deployed: fake.deployed };
}

function questions(answer: boolean) {
  const asked: string[] = [];
  const ask: DeployQuestions = {
    secret: async (name) => {
      asked.push(`secret ${name}`);
      return `value of ${name}`;
    },
    confirm: async () => {
      asked.push("Deploy?");
      return answer;
    },
  };
  return { ask, asked };
}

const input: DeployInput = {
  host: "cloudflare",
  deployment: { name: "web", accountId: "acc", service: "acme", environment: "production" },
  snapshot: {
    commit: "8d1a04b",
    files: {} as DefinitionSource,
    halonicVersion: "0.3.1",
  },
  reaches: [{ address: "api.anthropic.com", secret: "anthropic-key" }],
  secretNames: ["anthropic-key"],
  secrets: new Map([["anthropic-key", "sk-test"]]),
  yes: false,
  questions: undefined,
};

const cloudflare = { host: "cloudflare", stage: "production", shadow: false } as Deployment;
const local = { host: "local", stage: "development", shadow: false } as Deployment;

verifies("app.deploy-service", () => {
  describe("which deployment (2.1)", () => {
    it("deploys the one Cloudflare deployment when none is named", () => {
      expect(chooseDeployment("Acme", { home: local, web: cloudflare }, undefined, [])).toEqual({
        kind: "chosen",
        id: "web",
        deployment: cloudflare,
      });
    });

    it("says there's none to deploy yet, so the caller sets one up", () => {
      expect(chooseDeployment("Acme", { home: local }, undefined, [])).toEqual({ kind: "none" });
    });

    it("asks which one when there are several", () => {
      const choose = () =>
        chooseDeployment("Acme", { web: cloudflare, staging: cloudflare }, undefined, []);
      expect(choose).toThrow("Acme has 2 deployments on Cloudflare: web, staging. Say which one.");
      expect(errorKindOf(catchError(choose))).toBe("invalid_input");
    });

    it("refuses a local deployment and points at halonic serve", () => {
      const error = catchError(() => chooseDeployment("Acme", { home: local }, "home", []));
      expect(error).toMatchObject({
        kind: "invalid_input",
        message: "home runs on your own machine, not on Cloudflare.",
        fix: "Start it with halonic serve home.",
      });
    });

    it("says when the named deployment doesn't exist", () => {
      expect(errorKindOf(catchError(() => chooseDeployment("Acme", {}, "web", [])))).toBe(
        "not_found",
      );
    });
  });

  it("stops before any question when another deploy holds the lock (3.7)", async () => {
    const { deploys, deployed } = service({
      ...firstPlan,
      lockedBy: {
        who: "sam@example.com",
        startedAt: "2026-11-19T14:32:00.000Z",
        expiresAt: "2026-11-19T14:42:00.000Z",
      },
    });
    const { ask, asked } = questions(true);
    const failure = deploys.deploy({ ...input, secrets: new Map(), questions: ask }, () => {});
    await expect(failure).rejects.toMatchObject({
      kind: "conflict",
      message:
        "Couldn't deploy web: a deploy of web by sam@example.com is still running, started 2 min ago. Nothing changed on Cloudflare.",
      fix: "Wait for it to finish, then run again. If it was stopped without finishing, run again after 14:42, when its lock runs out.",
    });
    expect(asked).toEqual([]);
    expect(deployed).toEqual([]);
  });

  describe("a lock taken after the plan (3.7)", () => {
    const holder = {
      who: "kim@example.com",
      startedAt: "2026-11-19T14:33:00.000Z",
      expiresAt: "2026-11-19T14:43:00.000Z",
    };
    const race = (
      lockedBy: typeof holder | undefined,
      before: readonly DeployEvent[] = [],
      taken: Error = Object.assign(new Error("taken"), { code: "deploy-locked" }),
    ) => {
      const seen: DeployEvent[] = [];
      const target = {
        plan: async () => livePlan,
        deploy: async (_request: DeployRequest, onEvent: (event: DeployEvent) => void) => {
          for (const event of before) onEvent(event);
          throw taken;
        },
        // The service reads only `lockedBy` from the status.
        status: async () => ({ lockedBy }) as Awaited<ReturnType<DeployTarget["status"]>>,
      } as Partial<DeployTarget> as DeployTarget;
      const deploys = createDeployService({
        loadTarget: async () => target,
        clock: { now: () => new Date("2026-11-19T14:34:00.000Z") },
        timeZone: "UTC",
      });
      const failure = deploys.deploy({ ...input, yes: true }, (event) => seen.push(event));
      return { failure, seen };
    };

    it("names the holder while nothing has changed", async () => {
      await expect(race(holder).failure).rejects.toMatchObject({
        kind: "conflict",
        message:
          "Couldn't deploy web: a deploy of web by kim@example.com is still running, started 1 min ago. Nothing changed on Cloudflare.",
      });
      const started: DeployEvent = {
        step: "upload",
        version: 2,
        files: 3,
        secrets: 1,
        phase: "started",
      };
      await expect(race(holder, [started]).failure).rejects.toMatchObject({ kind: "conflict" });
      await expect(race(undefined).failure).rejects.toThrow("taken");
    });

    it("keeps the target's failure once a step has finished, since something changed", async () => {
      const done: DeployEvent = { step: "database", changes: 2, first: false, phase: "done" };
      const { failure, seen } = race(holder, [done]);
      await expect(failure).rejects.toThrow("taken");
      expect(seen).toEqual([done]);
    });

    it("keeps a lost lock's failure, which says what still serves: the snapshot may be written", async () => {
      const lost = Object.assign(new Error("lost"), { code: "deploy-locked", live: "none" });
      await expect(race(holder, [], lost).failure).rejects.toThrow("lost");
    });
  });

  it("lists every missing answer in one error without a terminal (4)", async () => {
    const { deploys, deployed } = service(firstPlan);
    const failure = deploys.deploy({ ...input, secrets: new Map() }, () => {});
    await expect(failure).rejects.toMatchObject({
      kind: "invalid_input",
      message:
        "Couldn't deploy web: 2 answers are missing, and there's no terminal to ask you. Nothing changed on Cloudflare.",
      fix: "Pass them: --yes for the deploy question, and anthropic-key on --secrets-stdin.",
    });
    expect(deployed).toEqual([]);
  });

  it("deploys without a terminal when --yes and the secrets are given (4)", async () => {
    const { deploys, deployed } = service(firstPlan);
    const outcome = await deploys.deploy({ ...input, yes: true }, () => {});
    expect(outcome.outcome).toBe("deployed");
    expect(deployed).toHaveLength(1);
  });

  describe("Deploy? [y/N] only when something is new (C4)", () => {
    it("asks on the first deploy, and a no deploys nothing", async () => {
      const { deploys, deployed } = service(firstPlan);
      const { ask, asked } = questions(false);
      const outcome = await deploys.deploy({ ...input, questions: ask }, () => {});
      expect(asked).toEqual(["Deploy?"]);
      expect(outcome).toEqual({ outcome: "declined" });
      expect(deployed).toEqual([]);
    });

    it("doesn't ask for a new commit alone", async () => {
      const { deploys, deployed } = service(livePlan);
      const { ask, asked } = questions(false);
      await deploys.deploy({ ...input, questions: ask }, () => {});
      expect(asked).toEqual([]);
      expect(deployed).toHaveLength(1);
    });

    it("asks when the workspace reaches a new address, or sends a secret elsewhere", async () => {
      for (const reach of [
        { address: "api.example.com", secret: "crm-key" },
        { address: "api.anthropic.com", secret: "crm-key" },
      ]) {
        const { deploys } = service(livePlan);
        const { ask, asked } = questions(true);
        await deploys.deploy(
          { ...input, reaches: [...input.reaches, reach], questions: ask },
          () => {},
        );
        expect(asked).toEqual(["Deploy?"]);
      }
    });

    it("asks when there's something to create or take over, or a change deletes data", async () => {
      for (const plan of [
        { ...livePlan, creates: [{ kind: "bucket" as const, name: "acme-blobs" }] },
        { ...livePlan, adopts: [{ kind: "bucket" as const, name: "acme-blobs" }] },
        { ...livePlan, deletesData: true },
      ]) {
        const { deploys } = service(plan);
        const { ask, asked } = questions(true);
        await deploys.deploy({ ...input, questions: ask }, () => {});
        expect(asked).toEqual(["Deploy?"]);
      }
    });
  });

  it("asks for a missing secret in a terminal, after the lock check", async () => {
    const { deploys, deployed } = service(livePlan);
    const { ask, asked } = questions(true);
    await deploys.deploy({ ...input, secrets: new Map(), questions: ask }, () => {});
    expect(asked).toEqual(["secret anthropic-key"]);
    expect(deployed[0]?.secrets.get("anthropic-key")).toBe("value of anthropic-key");
  });

  it("deploys a workspace nobody trusted: the service asks for no trust (C1)", async () => {
    const { deploys, deployed, loaded } = service(livePlan);
    // The service's only inputs are the target loader and the clock; there is no trust gate to pass.
    const outcome = await deploys.deploy(input, () => {});
    expect(loaded).toEqual(["cloudflare"]);
    expect(outcome.outcome).toBe("deployed");
    expect(deployed).toHaveLength(1);
  });
});

function catchError(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }
  throw new Error("expected it to throw");
}
