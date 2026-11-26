// The public API of @halonicjs/adapter-toolscript-check. Everything else in src/ is internal.

export {
  type BuildOptions,
  type BuildResult,
  buildToolScript,
  profileVersion,
  verifyArtifact,
} from "./build.ts";
export { type CheckOptions, type CheckResult, checkToolScript } from "./check.ts";
export type { Problem, ProblemRule } from "./messages.ts";
export { stripTypes } from "./strip-types.ts";
