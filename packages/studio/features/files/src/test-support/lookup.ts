import { limitedLookup, type ServiceLookup } from "@halonicjs/studio-shell";
import { filesFeature } from "../feature.ts";
import { type FileReviewHost, FileReviewService } from "../file-review.ts";

/**
 * The files feature's services in a test: `host` for every key, except the assistant's changes to
 * review, which only a test that gives `review` has.
 */
export function filesLookup(host: unknown, review?: FileReviewHost): ServiceLookup {
  const open = (key: unknown) => (key === FileReviewService ? review : host);
  return limitedLookup(filesFeature, { get: open, find: open });
}
