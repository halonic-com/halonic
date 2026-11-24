import type { Deployment } from "@halonicjs/format";
import type {
  DeployAccount,
  DeploymentRef,
  DeploymentStatus,
  DeployTarget,
} from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { createDeployService } from "./deploy-service.ts";
import { deploymentRefOf } from "./deployment-ref.ts";

const sams: DeployAccount = { id: "9a7806061c88ada191ed06f989cc3dac", name: "Sam's Account" };
const studio: DeployAccount = { id: "0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e", name: "Example Studio" };

function web(account?: string, stage: Deployment["stage"] = "development"): Deployment {
  return {
    name: "Web",
    host: "cloudflare",
    stage,
    shadow: false,
    cloudflare: { worker: "acme", ...(account === undefined ? {} : { account }) },
  };
}

/** A target whose token reaches `accounts`. */
function reaching(...accounts: DeployAccount[]) {
  return { accounts: async () => accounts };
}

verifies("app.deploy-account", () => {
  describe("with the account in deployments.yaml", () => {
    it("uses it when the token reaches it", async () => {
      await expect(deploymentRefOf(reaching(studio, sams), "web", web(sams.id))).resolves.toEqual({
        name: "web",
        accountId: sams.id,
        service: "acme",
        environment: "development",
      } satisfies DeploymentRef);
    });

    it("refuses with denied when the token doesn't reach it", async () => {
      await expect(deploymentRefOf(reaching(studio), "web", web(sams.id))).rejects.toMatchObject({
        kind: "denied",
        message: `The token doesn't reach the account web is on (ID ${sams.id}).`,
        fix: "Make a token for that account and save it: halonic deploy login cloudflare",
      });
    });
  });

  describe("without an account in deployments.yaml", () => {
    it("uses the token's one account", async () => {
      await expect(deploymentRefOf(reaching(sams), "web", web())).resolves.toMatchObject({
        accountId: sams.id,
      });
    });

    it("refuses a token that reaches several, naming the field", async () => {
      await expect(deploymentRefOf(reaching(sams, studio), "web", web())).rejects.toMatchObject({
        kind: "invalid_input",
        message:
          "The token reaches 2 Cloudflare accounts, and deployments.yaml doesn't say which one web is on.",
        fix: "Add the account's ID to web in deployments.yaml as cloudflare.account.",
      });
    });

    it("refuses a token that reaches none", async () => {
      await expect(deploymentRefOf(reaching(), "web", web())).rejects.toMatchObject({
        kind: "denied",
        message: "The token doesn't reach any Cloudflare account.",
      });
    });
  });

  it("refuses a deployment with no Worker before it asks the host anything", async () => {
    let asked = false;
    const target = {
      accounts: async () => {
        asked = true;
        return [sams];
      },
    };
    const deployment: Deployment = { ...web(), cloudflare: undefined };
    await expect(deploymentRefOf(target, "web", deployment)).rejects.toMatchObject({
      kind: "not_found",
      message: "There's no Worker for web in deployments.yaml yet.",
      fix: "Add cloudflare.worker to web in deployments.yaml, then run again.",
    });
    expect(asked).toBe(false);
  });

  it("makes a production stage a production deployment", async () => {
    await expect(
      deploymentRefOf(reaching(sams), "web", web(undefined, "production")),
    ).resolves.toMatchObject({ environment: "production" });
  });

  it("reads status through the target with the checked deployment", async () => {
    const asked: DeploymentRef[] = [];
    const status = { url: "https://acme.sam-example.workers.dev" } as DeploymentStatus;
    const target = {
      ...reaching(sams),
      status: async (ref: DeploymentRef) => {
        asked.push(ref);
        return status;
      },
    } as Partial<DeployTarget> as DeployTarget;
    const deploys = createDeployService({
      loadTarget: async () => target,
      clock: { now: () => new Date() },
    });
    await expect(deploys.status("cloudflare", "web", web(sams.id))).resolves.toBe(status);
    expect(asked).toEqual([
      { name: "web", accountId: sams.id, service: "acme", environment: "development" },
    ]);
  });
});
