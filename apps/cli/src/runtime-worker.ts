/**
 * Where the runtime package's build writes the worker every plugin gets, or `undefined` when this
 * copy of Halonic doesn't carry the runtime. It is looked up only when called, so loading the CLI
 * never looks for the runtime package (HAL-19380). The npm package doesn't ship the runtime: the
 * stager (`tooling/publish`) replaces this file with one that returns `undefined`, as it replaces
 * `npm-package.ts`, so the bundle never asks Node for a workspace package.
 */
export function runtimeWorkerUrl(): URL | undefined {
  return new URL(
    "../dist/worker.js",
    import.meta.resolve("@halonicjs/target-paperclip-runtime/actions"),
  );
}
