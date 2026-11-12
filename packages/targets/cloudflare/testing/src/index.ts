/**
 * Public entry point of `@halonicjs/target-cloudflare-testing`: runs port
 * contract suites inside workerd (HAL-197 part 1). So far it has the check
 * the test Worker's build uses to find matchers the vitest shim lacks.
 */
export { missingShimApis } from "./node/matcher-check.ts";
