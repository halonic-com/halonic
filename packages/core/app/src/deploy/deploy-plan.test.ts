import type { Deployment } from "@halonicjs/format";
import type { DefinitionSource, DeployPlan, DeployRequest, DeployTarget } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { createDeployService, type DeployInput } from "./deploy-service.ts";

const plan: DeployPlan = {
  account: { id: "acc", name: "sam@example.com's Account" },
  url: "https://acme.sam-example.workers.dev",
  creates: [{ kind: "service", name: "acme" }],
  adopts: [],
  databaseChanges: [],
  deletesData: false,
  live: undefined,
  liveReaches: undefined,
  lockedBy: { who: "sam@example.com", startedAt: "2026-11-19T14:32:00Z", expiresAt: "x" },
  unchanged: false,
  files: ["workspace.yaml"],
};

const input: DeployInput = {
  host: "cloudflare",
  deployment: { name: "web", accountId: "acc", service: "acme", environment: "production" },
  snapshot: { commit: "8d1a04b", files: {} as DefinitionSource, halonicVersion: "0.3.1" },
  reaches: [],
  secretNames: [],
  secrets: new Map(),
  yes: false,
  questions: undefined,
};

function service() {
  const planned: DeployRequest[] = [];
  const called: string[] = [];
  const target = {
    accounts: async () => [{ id: "acc", name: "sam@example.com's Account" }],
    plan: async (request: DeployRequest) => {
      planned.push(request);
      return plan;
    },
    deploy: async () => {
      called.push("deploy");
      throw new Error("deploy isn't called by plan");
    },
  } as Partial<DeployTarget> as DeployTarget;
  const deploys = createDeployService({
    loadTarget: async () => target,
    clock: { now: () => new Date("2026-11-19T14:34:00Z") },
  });
  return { deploys, planned, called };
}

verifies("app.deploy-service", () => {
  it("plans without deploying, with what's new, and gives a held lock as data", async () => {
    const { deploys, planned, called } = service();
    const result = await deploys.plan(input);
    expect(result.plan).toBe(plan);
    expect(result.news).toMatchObject({ first: true, creates: plan.creates });
    expect(planned).toHaveLength(1);
    expect(called).toEqual([]);
  });

  it("finds where a deployment lives from deployments.yaml", async () => {
    const { deploys } = service();
    const deployment = {
      host: "cloudflare",
      stage: "development",
      cloudflare: { worker: "acme" },
    } as Deployment;
    await expect(deploys.deploymentRef("cloudflare", "web", deployment)).resolves.toEqual({
      name: "web",
      accountId: "acc",
      service: "acme",
      environment: "development",
    });
  });
});
