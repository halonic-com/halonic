// The fake lives in @halonicjs/testing-contracts, whose code is measured in
// this package's run (its "measuredIn"), so its tests run here.
import type { DefinitionSource, DeployEvent, DeploymentRef, DeployRequest } from "@halonicjs/ports";
import {
  deployTargetContract,
  FakeDeployTarget,
  fakeDeployTargetEntry,
} from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";

const deployment: DeploymentRef = {
  name: "web",
  accountId: "fake-account",
  service: "acme",
  environment: "production",
};

/** A read-only workspace of two files at one commit. */
function files(commit: string): DefinitionSource {
  const contents = new Map([
    ["halonic.yaml", "name: acme\n"],
    ["flows/hello.yaml", "steps: []\n"],
  ]);
  return {
    location: `memory:acme@${commit}`,
    list: async () => [...contents.keys()].sort(),
    read: async (path) => contents.get(path) ?? null,
    version: async () => commit,
  };
}

const snapshot = async (commit: string) => ({
  commit,
  files: files(commit),
  halonicVersion: "1.15.0",
});

let folders = 0;

deployTargetContract("fake", async () => ({
  target: new FakeDeployTarget(),
  deployment,
  token: "fake-deploy-token",
  snapshot,
  folder: async () => `memory:export-${++folders}`,
}));

async function request(commit: string, signal?: AbortSignal): Promise<DeployRequest> {
  return {
    deployment,
    snapshot: await snapshot(commit),
    secrets: new Map(),
    reaches: [],
    ...(signal === undefined ? {} : { signal }),
  };
}

const holder = {
  who: "kim@example.com",
  startedAt: "2026-11-19T14:30:00.000Z",
  expiresAt: "2026-11-19T14:40:00.000Z",
};

verifies("contracts.fake-deploy-target", () => {
  describe("FakeDeployTarget", () => {
    it("refuses every change while another deploy holds the lock, until unlock frees it", async () => {
      const target = new FakeDeployTarget();
      await target.deploy(await request("c1"), () => {});
      await target.deploy(await request("c2"), () => {});
      target.holdLock(deployment, holder);

      expect((await target.plan(await request("c3"))).lockedBy).toEqual(holder);
      expect((await target.status(deployment)).lockedBy).toEqual(holder);
      for (const call of [
        target.deploy(await request("c3"), () => {}),
        target.rollback(deployment),
        target.destroy(deployment, { confirm: async () => true }),
      ]) {
        await expect(call).rejects.toMatchObject({ kind: "conflict", code: "deploy-locked" });
      }

      expect(await target.unlock(deployment)).toEqual({ freed: holder });
      expect((await target.deploy(await request("c3"), () => {})).outcome).toBe("deployed");
    });

    it("holds the lock as `who` while it deploys, and frees it after", async () => {
      const target = new FakeDeployTarget({ who: "sam@example.com" });
      const seen: (string | undefined)[] = [];
      await target.deploy(await request("c1"), () => {
        void target.status(deployment).then((status) => seen.push(status.lockedBy?.who));
      });
      expect(seen).toContain("sam@example.com");
      expect((await target.status(deployment)).lockedBy).toBeUndefined();
    });

    it("fails the next self-test, keeps the live version and goes live on the next deploy", async () => {
      const target = new FakeDeployTarget();
      await target.deploy(await request("c1"), () => {});
      target.failNextSelfTest(["sign-in"]);
      const failed = await target.deploy(await request("c2"), () => {});
      expect(failed).toMatchObject({
        outcome: "self-test-failed",
        version: { number: 2 },
        failedChecks: ["sign-in"],
        stillLive: { number: 1 },
        restoreFailed: false,
      });
      expect((await target.status(deployment)).live).toMatchObject({ number: 1 });
      expect(await target.deploy(await request("c2"), () => {})).toMatchObject({
        outcome: "deployed",
        version: { number: 2 },
      });
    });

    it("gives every warning added after the switch to the next deploy only", async () => {
      const target = new FakeDeployTarget();
      target.warnAfterSwitch("The lock was lost after the switch.");
      target.warnAfterSwitch("Another deploy may have taken over.");
      expect(await target.deploy(await request("c1"), () => {})).toMatchObject({
        warnings: ["The lock was lost after the switch.", "Another deploy may have taken over."],
      });
      expect(await target.deploy(await request("c2"), () => {})).toMatchObject({ warnings: [] });
    });

    it("stops after the step it's in when the signal is aborted, saying what still serves", async () => {
      const target = new FakeDeployTarget();
      await target.deploy(await request("c1"), () => {});
      const stop = new AbortController();
      const events: DeployEvent[] = [];
      const deploying = target.deploy(await request("c2", stop.signal), (event) => {
        events.push(event);
        if (event.phase === "done" && event.step === "upload") stop.abort();
      });
      await expect(deploying).rejects.toMatchObject({
        code: "stopped",
        live: { number: 1 },
        stoppedAfter: { step: "upload" },
      });
      expect(events.some((event) => "step" in event && event.step === "switch")).toBe(false);
      expect((await target.status(deployment)).live).toMatchObject({ number: 1 });
    });

    it("exports what was seeded and refuses an import from a folder with no export", async () => {
      const target = new FakeDeployTarget();
      await target.deploy(await request("c1"), () => {});
      const data = { runs: 3, records: 12, files: 2, bytes: 4096 };
      target.seed(deployment, data);
      expect(await target.export(deployment, "memory:out")).toEqual(data);
      await expect(target.import(deployment, "memory:nowhere")).rejects.toMatchObject({
        kind: "not_found",
        code: "transfer-failed",
      });
    });

    it("counts sign-outs, and refuses them and destroy for a deployment that was never deployed", async () => {
      const target = new FakeDeployTarget();
      await expect(target.revokeSessions(deployment)).rejects.toMatchObject({
        code: "not-deployed",
      });
      await expect(target.destroy(deployment, { confirm: async () => true })).rejects.toMatchObject(
        { code: "not-deployed" },
      );
      await target.deploy(await request("c1"), () => {});
      await target.revokeSessions(deployment);
      expect(target.sessionsRevoked(deployment)).toBe(1);
    });

    it("saves a token it accepts, and its entry hands out the target for the host fake", async () => {
      const target = new FakeDeployTarget({ token: "t-1" });
      await target.login("t-1");
      expect(target.savedTokens).toEqual(["t-1"]);
      const entry = fakeDeployTargetEntry(target);
      expect(entry).toMatchObject({ host: "fake", version: 1 });
      expect(
        entry.create({
          http: { fetch: async () => new Response() } as never,
          tokens: {} as never,
          environmentToken: undefined,
          who: "sam@example.com",
        }),
      ).toBe(target);
    });

    it("answers status for a deployment with nothing live", async () => {
      const status = await new FakeDeployTarget().status(deployment);
      expect(status).toMatchObject({
        url: undefined,
        live: undefined,
        health: { answering: false },
        runs: undefined,
      });
    });
  });
});
