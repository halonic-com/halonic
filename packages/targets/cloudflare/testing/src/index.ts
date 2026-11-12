/**
 * Public entry point of `@halonicjs/target-cloudflare-testing`: runs port
 * contract suites inside workerd. `runSuitesInWorkerd` is what a test file
 * calls; `buildTestWorker` and `WorkerdRunner` are its parts, also meant for
 * the live test run against a Cloudflare account (HAL-198).
 */
export { buildTestWorker } from "./node/build-test-worker.ts";
export { missingShimApis } from "./node/matcher-check.ts";
export { runSuitesInWorkerd, WorkerdCaseError } from "./node/run-in-workerd.ts";
export { compatibilityDate, type WorkerdBindings, WorkerdRunner } from "./node/workerd-runner.ts";
export type { CaseNode, CaseResult, CaseTree, SuiteMeta, SuiteNode } from "./worker/protocol.ts";
