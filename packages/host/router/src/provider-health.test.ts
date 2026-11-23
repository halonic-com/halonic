import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { type CallResult, ProviderHealth } from "./provider-health.ts";

const minute = 60_000;
const alias = "deepseek-flash";

/** Records `results` on the alias one second apart, starting at `start`; returns the time of the last one. */
function recordAll(health: ProviderHealth, results: readonly CallResult[], start = 0): number {
  let at = start;
  for (const [index, result] of results.entries()) {
    at = start + index * 1_000;
    health.record(alias, result, at);
  }
  return at;
}

function failures(count: number): CallResult[] {
  return Array.from({ length: count }, () => "provider-error" as const);
}

verifies("router.provider-health", () => {
  describe("failures in a row", () => {
    it("takes the alias out for 15 minutes after the fifth", () => {
      const health = new ProviderHealth();
      const last = recordAll(health, failures(4));
      expect(health.isHealthy(alias, last)).toBe(true);

      health.record(alias, "provider-error", last + 1_000);
      expect(health.isHealthy(alias, last + 1_000)).toBe(false);
      expect(health.isHealthy(alias, last + 1_000 + 15 * minute - 1)).toBe(false);
      expect(health.isHealthy(alias, last + 1_000 + 15 * minute)).toBe(true);
    });

    it("starts counting again after a call that worked", () => {
      const health = new ProviderHealth();
      const last = recordAll(health, [...failures(4), "ok", "provider-error"]);
      expect(health.isHealthy(alias, last)).toBe(true);
    });
  });

  describe("share of failures in 10 minutes", () => {
    it("takes the alias out when more than half of 10 calls failed", () => {
      const health = new ProviderHealth();
      const turns: CallResult[] = ["provider-error", "provider-error", "ok"];
      const last = recordAll(health, [...turns, ...turns, ...turns, "provider-error"]);
      expect(health.isHealthy(alias, last)).toBe(false);
    });

    it("keeps the alias at exactly half", () => {
      const health = new ProviderHealth();
      const last = recordAll(
        health,
        Array.from({ length: 10 }, (_, i) => (i % 2 ? "ok" : "provider-error")),
      );
      expect(health.isHealthy(alias, last)).toBe(true);
    });

    it("doesn't count the share for fewer than 10 calls", () => {
      const health = new ProviderHealth();
      const last = recordAll(health, [
        "provider-error",
        "ok",
        "provider-error",
        "ok",
        "provider-error",
      ]);
      expect(health.isHealthy(alias, last)).toBe(true);
    });

    it("forgets calls older than 10 minutes", () => {
      const health = new ProviderHealth();
      recordAll(health, ["provider-error", "provider-error", "ok", "provider-error"]);
      const later = 11 * minute;
      const turns: CallResult[] = ["provider-error", "ok"];
      const last = recordAll(health, [...turns, ...turns, ...turns], later);
      expect(health.isHealthy(alias, last)).toBe(true);
    });
  });

  describe("while out and after", () => {
    it("doesn't extend the time out for calls recorded meanwhile", () => {
      const health = new ProviderHealth();
      const last = recordAll(health, failures(5));
      health.record(alias, "provider-error", last + 14 * minute);
      expect(health.isHealthy(alias, last + 15 * minute)).toBe(true);
    });

    it("comes back with no failures counted", () => {
      const health = new ProviderHealth();
      const last = recordAll(health, failures(5));
      const back = recordAll(health, failures(4), last + 15 * minute);
      expect(health.isHealthy(alias, back)).toBe(true);
    });
  });

  it("treats an alias with no calls as healthy", () => {
    expect(new ProviderHealth().isHealthy(alias, 0)).toBe(true);
  });

  it("lists the aliases that are out, by name", () => {
    const health = new ProviderHealth();
    for (const name of ["zeta", "alpha"]) {
      for (let call = 0; call < 5; call += 1) {
        health.record(name, "provider-error", call);
      }
    }
    health.record("opus", "ok", 0);
    expect(health.unhealthyAliases(10)).toEqual(["alpha", "zeta"]);
  });
});
