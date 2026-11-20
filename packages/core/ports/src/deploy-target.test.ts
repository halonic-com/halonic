import type { RunFailureKind } from "@halonicjs/events";
import { typeTest, verifies } from "@halonicjs/testing-spec";
import { expect, expectTypeOf, it } from "vitest";
import type {
  DeployDone,
  DeployEvent,
  DeployedVersion,
  DeployFailure,
  DeployResult,
  DeployTarget,
  DeployTargetContext,
  DeployTargetEntry,
} from "./deploy-target.ts";

const version: DeployedVersion = {
  number: 2,
  id: "v-2",
  commit: "8d1a04b",
  halonicVersion: "0.3.1",
  liveSince: "2026-11-19T14:02:00.000Z",
};

verifies("ports.deploy-target", () => {
  typeTest("has exactly the deploy methods", () => {
    expectTypeOf<keyof DeployTarget>().toEqualTypeOf<
      | "login"
      | "plan"
      | "deploy"
      | "status"
      | "rollback"
      | "export"
      | "import"
      | "unlock"
      | "revokeSessions"
      | "destroy"
    >();
    expectTypeOf<ReturnType<DeployTarget["deploy"]>>().toEqualTypeOf<Promise<DeployResult>>();
    expectTypeOf<DeployResult["outcome"]>().toEqualTypeOf<
      "deployed" | "unchanged" | "self-test-failed"
    >();
  });

  typeTest("keeps every warning of a deploy that went live", () => {
    const done: DeployDone = {
      outcome: "deployed",
      url: "https://acme.sam-example.workers.dev",
      version,
      previous: undefined,
      warnings: ["The deploy lock was lost after the switch."],
    };
    // @ts-expect-error: a deploy that went live always says its warnings, even when there are none
    const silent: DeployDone = { outcome: "deployed", url: done.url, version, previous: undefined };
    expectTypeOf([done, silent]).toEqualTypeOf<DeployDone[]>();
  });

  typeTest("gives each step's event its details", () => {
    const upload: DeployEvent = {
      phase: "done",
      step: "upload",
      version: 2,
      files: 42,
      secrets: 2,
    };
    // @ts-expect-error: an upload says which version, how many files and how many secrets
    const bare: DeployEvent = { phase: "started", step: "upload" };
    expectTypeOf([upload, bare]).toEqualTypeOf<DeployEvent[]>();
  });

  typeTest("gives a failure one of the kit's error kinds", () => {
    expectTypeOf<DeployFailure["kind"]>().toEqualTypeOf<RunFailureKind>();
    expectTypeOf<DeployFailure>().toMatchTypeOf<Error>();
    const failure: Pick<DeployFailure, "kind" | "code"> = {
      kind: "conflict",
      code: "deploy-locked",
    };
    const coded: Pick<DeployFailure, "kind" | "code"> = {
      // @ts-expect-error: a failure's kind is one of the kit's eight, not a code
      kind: "deploy-locked",
      code: "deploy-locked",
    };
    expectTypeOf([failure, coded]).toBeArray();
  });

  it("lets a loader check an entry before it creates the target", () => {
    const entry: DeployTargetEntry = {
      host: "cloudflare",
      version: 1,
      create: (_context: DeployTargetContext) => ({}) as DeployTarget,
    };
    expect(entry.host).toBe("cloudflare");
    expect(typeof entry.create).toBe("function");
  });
});
