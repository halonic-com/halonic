// Runs inside workerd: the DefinitionSource contract against a real R2 bucket.

import { env } from "cloudflare:workers";
import { definitionSourceContract } from "@halonicjs/testing-contracts";
import { writeDefinitionSnapshot } from "./definition-snapshot-writer.ts";
import { R2DefinitionSource } from "./r2-definition-source.ts";

declare global {
  namespace Cloudflare {
    interface Env {
      /** The test Worker's R2 bucket, bound by the test file that starts workerd. */
      DEFINITIONS: R2Bucket;
    }
  }
}

// Every source gets a prefix of its own, so a case never finds what another left in the bucket.
definitionSourceContract("R2", async (files) => {
  const keyPrefix = `case-${crypto.randomUUID()}/`;
  await writeDefinitionSnapshot(env.DEFINITIONS, files, keyPrefix);
  return new R2DefinitionSource(env.DEFINITIONS, { keyPrefix });
});
