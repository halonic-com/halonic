/**
 * The target contract suite against the Worker's own wiring, inside workerd (HAL-6803): every
 * port as `createRuntime` builds it from real D1, R2 and Durable Object bindings. Run by
 * `target.test.ts`.
 *
 * The cases share the bindings, so each one builds its runtime under a scope of its own (see
 * `RuntimeOptions`), and the record store is read through a view with a tag of its own. The
 * Durable Objects are the Worker's classes with a clock the suite moves.
 */

import { env } from "cloudflare:workers";
import {
  cases,
  clocksByObjectName,
  SuiteClock,
  type TestRunObject,
} from "@halonicjs/adapter-cloudflare-durable/testing";
import { writeDefinitionSnapshot } from "@halonicjs/adapter-cloudflare-storage";
import { secretVariableName } from "@halonicjs/adapter-env-secrets";
import { createTokenStore } from "@halonicjs/adapter-token-store";
import {
  pbkdf2ChainFormat,
  scopedRecordStore,
  targetCapabilityRefusals,
  targetPortContracts,
} from "@halonicjs/testing-contracts";
import type { RuntimeEnv } from "../env.ts";
import { createRuntime, type Runtime, scopedKeyPrefix } from "../runtime.ts";
import { workerSecrets } from "../worker-secrets.ts";

export {
  TestCoordinationObject,
  TestRoutinesObject,
  TestRunObject,
} from "@halonicjs/adapter-cloudflare-durable/testing";

// Test values made up for this file; the key is 32 bytes in base64url.
const configured = {
  ...(env as unknown as RuntimeEnv),
  HALONIC_SECRET_TOKEN_KEY: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  HALONIC_SECRET_SERVE_PASSWORD: "not-a-real-hash",
};

/** The Scheduler contract never appends, so no run list update is ever sent. */
const noRunList = { publish: async () => {} };

/** A runtime that has bindings and storage of its own, and the scope it lives under. */
async function freshRuntime(): Promise<{ runtime: Runtime; scope: string }> {
  const scope = crypto.randomUUID();
  return { runtime: await createRuntime(configured, { scope }), scope };
}

targetPortContracts("cloudflare", {
  clock: async () => (await freshRuntime()).runtime.clock,

  blobs: async () => (await freshRuntime()).runtime.blobs,

  records: async () => scopedRecordStore((await freshRuntime()).runtime.records),

  secrets: async (values) => {
    // The secrets the Worker reads from `env`, with `values` as its Workers secrets.
    const variables = Object.fromEntries(
      Object.entries(values).map(([name, value]) => [secretVariableName(name), value]),
    );
    return workerSecrets(variables);
  },

  tokens: async () => {
    const { runtime } = await freshRuntime();
    return createTokenStore({
      records: scopedRecordStore(runtime.records),
      secrets: runtime.secrets,
      clock: runtime.clock,
    });
  },

  definitions: async (files) => {
    const { runtime, scope } = await freshRuntime();
    await writeDefinitionSnapshot(configured.DEFINITIONS, files, scopedKeyPrefix(scope));
    return runtime.definitions;
  },

  coordination: async () => {
    const { runtime, scope } = await freshRuntime();
    const clock = new SuiteClock();
    clocksByObjectName.set(scope, clock);
    return { coordination: runtime.coordination, clock };
  },

  scheduler: async (listener) => {
    const { runtime, scope } = await freshRuntime();
    const clock = new SuiteClock();
    const objectNames = new Set<string>();
    cases.set(scope, { clock, listener, runList: noRunList, objectNames });
    const { RUN } = env as unknown as { RUN: DurableObjectNamespace<TestRunObject> };
    return {
      scheduler: runtime.scheduler,
      clock,
      async settle() {
        await Promise.all(
          [...objectNames].map((name) => RUN.get(RUN.idFromName(name)).fireAlarm()),
        );
        // The cron's tick, through the runtime's routines object. A tick that rejects is not
        // retried: the next tick catches up.
        await runtime.routines.tick(clock.now().toISOString()).catch(() => undefined);
      },
    };
  },

  passwords: {
    make: async () => (await freshRuntime()).runtime.passwords,
    format: pbkdf2ChainFormat,
  },
});

targetCapabilityRefusals("cloudflare", async () => {
  const { runtime } = await freshRuntime();
  return { wiredPorts: runtime, definitions: runtime.definitions, secrets: runtime.secrets };
});
