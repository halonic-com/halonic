// Runs inside workerd: the BlobStore contract against a real R2 bucket.

import { env } from "cloudflare:workers";
import { blobStoreContract } from "@halonicjs/testing-contracts";
import { R2BlobStore } from "./r2-blob-store.ts";

declare global {
  namespace Cloudflare {
    interface Env {
      /** The test Worker's R2 bucket, bound by the test file that starts workerd. */
      BLOBS: R2Bucket;
    }
  }
}

// Every store gets a prefix of its own, so a case never finds what another left in the bucket.
blobStoreContract("R2", async () => new R2BlobStore(env.BLOBS, `case-${crypto.randomUUID()}/`));
