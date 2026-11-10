/**
 * Public entry point of `@halonicjs/testing-spec`: `verifies()` links tests
 * to the requirement they prove, and `typeTest()` marks tests that only check
 * types, and `expectSpecFile()` pins a package's committed spec file to the
 * code.
 */
export { expectSpecFile } from "./spec-file.ts";
export { typeTest } from "./type-test.ts";
export { requirementIdPattern, verifies } from "./verifies.ts";
