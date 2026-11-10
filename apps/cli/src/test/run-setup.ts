import { join } from "node:path";
import { FileTrustStore } from "@halonicjs/adapter-fs-node";
import type { IdGenerator } from "@halonicjs/ports";
import type { ProfileEnvironment } from "@halonicjs/profile";
import { fixedClock } from "@halonicjs/std";
import type { RunSetup } from "../commands/run/run.ts";

/** 10 Nov 2026, 14:01 UTC: when the engine's fixed clock starts. */
export const engineStart = Date.UTC(2026, 10, 10, 14, 1);

/** Ids that end in 01jd8q, so the short run id is the same every time. */
function fixedIds(): IdGenerator {
  let count = 0;
  return { next: (prefix) => `${prefix}_mfx3k2a${count++}_01jd8q` };
}

/**
 * The setup `halonic run` and `halonic runs send` use in a test: the engine
 * on a fixed clock and fixed ids, the trust records in `folder`, the runs in
 * `profile`, and no server to call, as the test model calls none.
 */
export function testRunSetup(folder: string, profile: ProfileEnvironment): RunSetup {
  return {
    clock: () => ({ now: new Date(engineStart + 60_000), timeZone: "UTC" }),
    trust: () => ({
      trustStore: new FileTrustStore(join(folder, "trust")),
      clock: fixedClock(engineStart),
      commandSearch: { path: undefined, endings: [] },
    }),
    http: {
      fetch: async () => {
        throw new TypeError("The test model calls no server.");
      },
    },
    profile,
    engine: { clock: fixedClock(engineStart, 0), ids: fixedIds() },
  };
}
