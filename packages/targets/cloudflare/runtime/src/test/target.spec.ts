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
  SuiteCase,
  type TestCoordinationObject,
  type TestRoutinesObject,
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

/** The Durable Object bindings: the Worker's classes, with a clock the suite sets. */
const bindings = env as unknown as {
  COORDINATION: DurableObjectNamespace<TestCoordinationObject>;
  RUN: DurableObjectNamespace<TestRunObject>;
  ROUTINES: DurableObjectNamespace<TestRoutinesObject>;
};

/**
 * A runtime that has bindings and storage of its own, and the scope it lives under. With a
 * `suiteCase`, its Durable Objects are the ones the case keeps on its clock and listener.
 */
async function freshRuntime(suiteCase?: SuiteCase): Promise<{ runtime: Runtime; scope: string }> {
  const scope = crypto.randomUUID();
  const runtimeEnv =
    suiteCase === undefined
      ? configured
      : ({
          ...configured,
          COORDINATION: suiteCase.namespace(bindings.COORDINATION),
          RUN: suiteCase.namespace(bindings.RUN),
          ROUTINES: suiteCase.namespace(bindings.ROUTINES),
        } as RuntimeEnv);
  return { runtime: await createRuntime(runtimeEnv, { scope }), scope };
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
    await writeDefinitionSnapshot(configured.DEFINITIONS, files, [], scopedKeyPrefix(scope));
    return runtime.definitions;
  },

  coordination: async () => {
    const suiteCase = new SuiteCase();
    const { runtime } = await freshRuntime(suiteCase);
    return { coordination: runtime.coordination, clock: suiteCase.clock };
  },

  scheduler: async (listener) => {
    const suiteCase = new SuiteCase({ listener });
    const { runtime } = await freshRuntime(suiteCase);
    return {
      scheduler: runtime.scheduler,
      clock: suiteCase.clock,
      async settle() {
        await suiteCase.fireAlarms(bindings.RUN);
        // The cron's tick, through the runtime's routines object. A tick that rejects is not
        // retried: the next tick catches up.
        await runtime.routines.tick(suiteCase.clock.now().toISOString()).catch(() => undefined);
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
