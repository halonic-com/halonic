/**
 * Public entry point of `@halonicjs/testing-spec`: `verifies()` links tests
 * to the requirement they prove, and `typeTest()` marks tests that only check
 * types. `expectSpecFile()` needs Node, so it lives in `@halonicjs/testing-spec/node`.
 */
export { typeTest } from "./type-test.ts";
export { requirementIdPattern, verifies } from "./verifies.ts";
