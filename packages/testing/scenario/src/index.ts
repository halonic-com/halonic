/**
 * Public entry point of `@halonicjs/testing-scenario`: `eventually()` checks
 * until the state is right instead of sleeping, `keepOnFailure()` saves
 * state for the reader when a test fails, and `trustedWorkspace()` trusts a
 * fixture workspace.
 */
export { type EventuallyOptions, eventually } from "./eventually.ts";
export { type KeepOnFailureOptions, keepOnFailure } from "./keep-on-failure.ts";
export { trustedWorkspace, trustedWorkspaceGrantedAt } from "./trusted-workspace.ts";
