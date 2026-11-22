import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { slotRefusal } from "./run-slots.ts";
import { MemoryUsageStorage } from "./test/memory-usage-storage.ts";
import { acmeLimits, openAccount } from "./test/usage-case.ts";

verifies("cloudflare-durable.usage-running", () => {
  it("lets as many runs run as the scope may, and refuses the next with the numbers", () => {
    const { account } = openAccount();
    expect(account.startRun("run_1", "u_acme").allowed).toBe(true);
    expect(account.startRun("run_2", "u_acme").allowed).toBe(true);
    expect(account.startRun("run_1", "u_acme").allowed).toBe(true);
    expect(account.startRun("run_3", "u_acme")).toEqual({
      allowed: false,
      refusal: { code: "plan.concurrency", running: 2, limit: 2 },
    });
  });

  it("gives a run's slot back while it waits, and lets it wake only when a slot is free", () => {
    const { account } = openAccount();
    account.startRun("run_1", "u_acme");
    account.startRun("run_2", "u_acme");
    account.stopRunning("run_1");
    expect(account.startRun("run_3", "u_acme").allowed).toBe(true);
    expect(account.startRun("run_1", "u_acme").allowed).toBe(false);
    account.stopRunning("run_2");
    expect(account.startRun("run_1", "u_acme").allowed).toBe(true);
  });

  it("finds no slot while it knows no limits", () => {
    expect(slotRefusal(new MemoryUsageStorage(), "u_acme")).toEqual({ code: "plan.none" });
  });

  it("refuses a start while the scope can't take a step", () => {
    const { account } = openAccount(acmeLimits({ status: "stopped" }));
    expect(account.startRun("run_1", "u_acme")).toMatchObject({
      refusal: { code: "plan.inactive" },
    });
  });

  describe("in an organisation", () => {
    const members = {
      u_ada: { status: "active", maxRunning: 1 },
      u_bo: { status: "active" },
    } as const;

    it("holds each member to their own cap inside the scope's", () => {
      const { account } = openAccount(acmeLimits({ members, maxRunning: 3 }));
      expect(account.startRun("run_1", "u_ada").allowed).toBe(true);
      expect(account.startRun("run_2", "u_ada")).toEqual({
        allowed: false,
        refusal: { code: "plan.member.concurrency", running: 1, limit: 1 },
      });
      expect(account.startRun("run_3", "u_bo").allowed).toBe(true);
      expect(account.startRun("run_4", "u_bo").allowed).toBe(true);
      expect(account.startRun("run_5", "u_bo")).toMatchObject({
        refusal: { code: "plan.concurrency", running: 3 },
      });
    });
  });
});
