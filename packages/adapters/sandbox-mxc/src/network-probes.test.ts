import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { judgeNetwork } from "./network-probes.ts";
import type { AttemptState, LeakReport, NetworkAttempt } from "./probe-scripts.ts";

function attempt(state: AttemptState, code: string | null = null): NetworkAttempt {
  return { host: "198.51.100.7", port: 443, state, code };
}

/** A report whose internet attempts and network control are as given. */
function report(internet: NetworkAttempt[], network: NetworkAttempt | null): LeakReport {
  return {
    control: "readable",
    hidden: "hidden",
    denied: "hidden",
    ports: [],
    lan: [],
    internet,
    dns: [],
    network,
  };
}

const asked = { ports: 0, lan: 0, internet: 1, dns: 0 };

verifies("sandbox-mxc.canary", () => {
  describe("reading the network attempts", () => {
    it("counts a refusal as blocked, with or without the network control", () => {
      for (const network of [null, attempt("failed", "UNKNOWN")]) {
        const found = judgeNetwork(report([attempt("refused", "EACCES")], network), asked);
        expect(found).toMatchObject({ internetReached: false, unproven: [] });
      }
    });

    it("counts a timeout as blocked only when the bridge, the network control, connected", () => {
      const timedOut = [attempt("timeout")];
      expect(judgeNetwork(report(timedOut, attempt("connected")), asked).unproven).toEqual([]);
      expect(judgeNetwork(report(timedOut, attempt("timeout")), asked).unproven).toHaveLength(1);
      expect(judgeNetwork(report(timedOut, null), asked).unproven).toHaveLength(1);
    });

    it("counts a timeout as blocked when a control box showed the network works", () => {
      const timedOut = [attempt("timeout")];
      expect(judgeNetwork(report(timedOut, null), asked, true).unproven).toEqual([]);
      expect(judgeNetwork(report(timedOut, null), asked, false).unproven).toHaveLength(1);
    });

    it("counts an error that is no refusal as unproven, whatever the control says", () => {
      const failed = [attempt("failed", "UNKNOWN")];
      const found = judgeNetwork(report(failed, attempt("connected")), asked);
      expect(found.internetReached).toBe(false);
      expect(found.unproven[0]).toContain("UNKNOWN");
    });

    it("reports a connection as reached, and a missing attempt as unproven", () => {
      expect(judgeNetwork(report([attempt("connected")], null), asked).internetReached).toBe(true);
      expect(judgeNetwork(report([], null), asked).unproven).toHaveLength(1);
    });
  });
});
