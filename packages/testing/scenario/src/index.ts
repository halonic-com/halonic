/**
 * Public entry point of `@halonicjs/testing-scenario`: `eventually()` checks
 * until the state is right instead of sleeping, and `keepOnFailure()` saves
 * state for the reader when a test fails.
 */
export { type EventuallyOptions, eventually } from "./eventually.ts";
export { type KeepOnFailureOptions, keepOnFailure } from "./keep-on-failure.ts";
