import { createNodeWorkerToolScriptIsolate } from "@halonicjs/adapter-toolscript-quickjs-node";
import type { ToolScriptIsolate } from "@halonicjs/ports";

/**
 * The isolate `serve`'s rule steps run in: QuickJS in a worker thread of its own per rule, with
 * the agent limits and no host functions (requirement `cli.serve-rules`, HAL-18669). None in the
 * npm package, which bundles the CLI into one file and doesn't ship the worker's own file yet, so
 * there a rule step fails as it does for `run`.
 */
export function servedRuleIsolate(npmPackage: boolean): {
  readonly toolScriptIsolate?: ToolScriptIsolate;
} {
  return npmPackage ? {} : { toolScriptIsolate: createNodeWorkerToolScriptIsolate() };
}
